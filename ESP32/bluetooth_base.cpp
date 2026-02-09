#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include "driver/rtc_io.h"
#include "driver/gpio.h"

// ---- TFT (ST7789) ----
#define TFT_MOSI 35
#define TFT_SCLK 36
#define TFT_CS   34
#define TFT_DC   5
#define TFT_RST  4
#define TFT_BL   21

// ---- I2C ----
#define I2C_SDA  8
#define I2C_SCL  9

// ---- Heart sensor (analog) ----
#define HR_ADC   1

// ---- Buttons (active-low) ----
#define BTN1     6
#define BTN2     7
#define BTN3     2

static const uint32_t DEBOUNCE_MS   = 35;
static const uint32_t SLEEP_IDLE_MS = 10UL * 60UL * 1000UL; // 10 minutes
static const uint32_t RTC_QUIET_MS  = 800;

// Create display object
Adafruit_ST7789 tft = Adafruit_ST7789(&SPI, TFT_CS, TFT_DC, TFT_RST);

static void screenOff() { digitalWrite(TFT_BL, LOW); }
static void screenOn()  { digitalWrite(TFT_BL, HIGH); }

// ===================== BLE (NimBLE) =====================
#include <NimBLEDevice.h>

// Nordic UART-style UUIDs
static const char* BLE_NAME = "Commubu";
static NimBLEUUID SERVICE_UUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
static NimBLEUUID CHAR_UUID_RX("6E400002-B5A3-F393-E0A9-E50E24DCCA9E"); // iPhone -> ESP (Write)
static NimBLEUUID CHAR_UUID_TX("6E400003-B5A3-F393-E0A9-E50E24DCCA9E"); // ESP -> iPhone (Notify/Read)

static NimBLEServer*         bleServer = nullptr;
static NimBLECharacteristic* txChar    = nullptr;
static NimBLECharacteristic* rxChar    = nullptr;
static volatile bool bleConnected = false;

// ---- RX buffering: callback stores; loop() prints + LCD ----
static portMUX_TYPE rxMux = portMUX_INITIALIZER_UNLOCKED;
static volatile bool rxPending = false;
static String rxMessage;

// ---- helper: show received text on TFT ----
static void showRxOnTFT(const String& msg) {
  tft.fillRect(0, 190, 320, 50, ST77XX_BLACK);
  tft.setTextWrap(false);

  tft.setCursor(10, 195);
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_GREEN);
  tft.print("RX:");

  tft.setCursor(10, 210);
  tft.setTextColor(ST77XX_WHITE);

  String clipped = msg;
  if (clipped.length() > 50) clipped = clipped.substring(0, 50);
  tft.print(clipped);
}

static void bleSend(const String& msg) {
  if (!txChar) return;
  txChar->setValue(msg.c_str());
  if (bleConnected) txChar->notify();
}

// =====================================================================
// NimBLE-Arduino 2.3.7 callback signatures use NimBLEConnInfo
// =====================================================================

// Phone -> ESP callbacks (2.3.7 signature)
class RxCallbacks : public NimBLECharacteristicCallbacks {
public:
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& connInfo) {
    (void)connInfo;

    std::string v = c->getValue();
    if (v.empty()) return;

    String msg;
    msg.reserve(v.size());
    for (size_t i = 0; i < v.size(); i++) msg += (char)v[i];

    portENTER_CRITICAL(&rxMux);
    rxMessage = msg;
    rxPending = true;
    portEXIT_CRITICAL(&rxMux);
  }
};

// Server callbacks (2.3.7 signatures)
class ServerCallbacks : public NimBLEServerCallbacks {
public:
  void onConnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo) {
    (void)pServer; (void)connInfo;
    bleConnected = true;
    Serial.println("BLE: connected");
  }

  void onDisconnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo, int reason) {
    (void)pServer; (void)connInfo; (void)reason;
    bleConnected = false;
    Serial.println("BLE: disconnected");
    NimBLEDevice::startAdvertising();
  }
};

static void initBLE() {
  NimBLEDevice::init(BLE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9); // max TX power

  bleServer = NimBLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  NimBLEService* svc = bleServer->createService(SERVICE_UUID);

  // TX: ESP -> phone
  txChar = svc->createCharacteristic(
    CHAR_UUID_TX,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
  );
  txChar->setValue("boot");

  // RX: phone -> ESP
  rxChar = svc->createCharacteristic(
    CHAR_UUID_RX,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  rxChar->setCallbacks(new RxCallbacks());

  svc->start();

  Serial.println("BLE: service/characteristics started");
  Serial.print("BLE: RX UUID = "); Serial.println(rxChar->getUUID().toString().c_str());
  Serial.print("BLE: TX UUID = "); Serial.println(txChar->getUUID().toString().c_str());

  // ---- Advertising payload ----
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->stop();

  NimBLEAdvertisementData ad;
  ad.setFlags(0x06);
  ad.setName(BLE_NAME);
  ad.addServiceUUID(SERVICE_UUID);
  ad.setManufacturerData("TINY");

  adv->setAdvertisementData(ad);
  adv->start();

  Serial.println("BLE: advertising");
  Serial.print("BLE addr: ");
  Serial.println(NimBLEDevice::getAddress().toString().c_str());
}

// ---------------- Debounced button ----------------
struct DebouncedButton {
  uint8_t pin;
  bool stableState;
  bool lastStableState;
  bool lastRaw;
  uint32_t lastChangeMs;

  void begin(uint8_t p) {
    pin = p;
    pinMode(pin, INPUT_PULLUP);
    bool raw = digitalRead(pin);
    stableState = raw;
    lastStableState = raw;
    lastRaw = raw;
    lastChangeMs = millis();
  }

  void update() {
    bool raw = digitalRead(pin);

    if (raw != lastRaw) {
      lastRaw = raw;
      lastChangeMs = millis();
    }

    if ((millis() - lastChangeMs) >= DEBOUNCE_MS) {
      lastStableState = stableState;
      stableState = raw;
    }
  }

  bool fell() const { return (lastStableState == HIGH && stableState == LOW); }
  bool pressed() const { return (stableState == LOW); }
};

DebouncedButton b1, b2, b3;

// ---------------- TFT UI helpers ----------------
static void initTFT() {
  screenOff();

  pinMode(TFT_CS, OUTPUT);  digitalWrite(TFT_CS, HIGH);
  pinMode(TFT_DC, OUTPUT);  digitalWrite(TFT_DC, HIGH);
  pinMode(TFT_RST, OUTPUT); digitalWrite(TFT_RST, HIGH);

  SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);

  tft.init(240, 320);
  tft.setRotation(1);
  tft.setSPISpeed(20000000);

  tft.fillScreen(ST77XX_BLACK);

  screenOn();
  delay(5);
}

static void drawUI(const char* title, int hrRaw, const char* wakeStr) {
  tft.fillScreen(ST77XX_BLACK);

  tft.setTextWrap(false);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(2);

  tft.setCursor(10, 10);
  tft.print(title);

  tft.setTextSize(1);
  tft.setCursor(10, 50);
  tft.print("Wake: ");
  tft.print(wakeStr);

  tft.setTextSize(2);
  tft.setCursor(10, 90);
  tft.print("HR ADC: ");
  tft.print(hrRaw);

  tft.setTextSize(1);
  tft.setCursor(10, 140);
  tft.print("BTN1/2/3 to stay awake.");
  tft.setCursor(10, 160);
  tft.print("Idle -> deep sleep.");

  tft.fillRect(0, 190, 320, 50, ST77XX_BLACK);
  tft.setCursor(10, 195);
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_GREEN);
  tft.print("RX: (waiting...)");
}

static const char* wakeCauseToStr(esp_sleep_wakeup_cause_t cause) {
  switch (cause) {
    case ESP_SLEEP_WAKEUP_EXT1: return "EXT1 (buttons)";
    case ESP_SLEEP_WAKEUP_TIMER: return "TIMER";
    case ESP_SLEEP_WAKEUP_UNDEFINED: return "POWERON/RESET";
    default: return "OTHER";
  }
}

static void configureRtcWakePins() {
  const gpio_num_t wakePins[] = {
    (gpio_num_t)BTN1,
    (gpio_num_t)BTN2,
    (gpio_num_t)BTN3
  };

  for (auto p : wakePins) {
    rtc_gpio_deinit(p);
    rtc_gpio_init(p);
    rtc_gpio_set_direction(p, RTC_GPIO_MODE_INPUT_ONLY);
    rtc_gpio_pullup_en(p);
    rtc_gpio_pulldown_dis(p);
    rtc_gpio_hold_en(p);
  }
}

static bool rtcButtonsAllHighFor(uint32_t ms) {
  uint32_t start = millis();
  while (millis() - start < ms) {
    int r1 = rtc_gpio_get_level((gpio_num_t)BTN1);
    int r2 = rtc_gpio_get_level((gpio_num_t)BTN2);
    int r3 = rtc_gpio_get_level((gpio_num_t)BTN3);

    if (r1 == 0 || r2 == 0 || r3 == 0) {
      Serial.print("RTC levels not all HIGH: BTN1=");
      Serial.print(r1);
      Serial.print(" BTN2=");
      Serial.print(r2);
      Serial.print(" BTN3=");
      Serial.println(r3);
      return false;
    }
    delay(5);
  }
  return true;
}

static void enterDeepSleep() {
  NimBLEDevice::deinit(true);

  screenOff();
  delay(5);

  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, LOW);
  gpio_hold_en((gpio_num_t)TFT_BL);
  gpio_deep_sleep_hold_en();

  pinMode(TFT_CS,   INPUT);
  pinMode(TFT_DC,   INPUT);
  pinMode(TFT_RST,  INPUT);
  pinMode(TFT_MOSI, INPUT);
  pinMode(TFT_SCLK, INPUT);

  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  configureRtcWakePins();
  delay(20);

  if (!rtcButtonsAllHighFor(RTC_QUIET_MS)) {
    Serial.println("Sleep aborted: wake pin LOW/noisy (would wake instantly).");
    gpio_deep_sleep_hold_dis();
    gpio_hold_dis((gpio_num_t)TFT_BL);
    screenOn();
    initBLE();
    return;
  }

  const uint64_t wakeMask =
      (1ULL << BTN1) |
      (1ULL << BTN2) |
      (1ULL << BTN3);

  esp_sleep_enable_ext1_wakeup(wakeMask, ESP_EXT1_WAKEUP_ANY_LOW);

  Serial.println("Entering deep sleep now.");
  Serial.flush();
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(50);

  pinMode(TFT_BL, OUTPUT);   digitalWrite(TFT_BL, LOW);
  pinMode(TFT_CS, OUTPUT);   digitalWrite(TFT_CS, HIGH);
  pinMode(TFT_DC, OUTPUT);   digitalWrite(TFT_DC, HIGH);
  pinMode(TFT_RST, OUTPUT);  digitalWrite(TFT_RST, HIGH);
  pinMode(TFT_MOSI, OUTPUT); digitalWrite(TFT_MOSI, LOW);
  pinMode(TFT_SCLK, OUTPUT); digitalWrite(TFT_SCLK, LOW);

  gpio_deep_sleep_hold_dis();
  gpio_hold_dis((gpio_num_t)TFT_BL);

  b1.begin(BTN1);
  b2.begin(BTN2);
  b3.begin(BTN3);

  pinMode(TFT_BL, OUTPUT);
  screenOff();

  Wire.begin(I2C_SDA, I2C_SCL);

  analogReadResolution(12);
  analogSetPinAttenuation(HR_ADC, ADC_11db);

  initTFT();
  initBLE();

  bleSend("Commubu booted");

  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  const char* causeStr = wakeCauseToStr(cause);

  Serial.print("Wake cause: ");
  Serial.println(causeStr);

  int hrRaw = analogRead(HR_ADC);
  drawUI("TinyS3[D] Watch UI", hrRaw, causeStr);
}

void loop() {
  static uint32_t lastActivity = millis();

  // ---- Handle BLE RX (safe context) ----
  if (rxPending) {
    String msgCopy;
    portENTER_CRITICAL(&rxMux);
    msgCopy = rxMessage;
    rxPending = false;
    portEXIT_CRITICAL(&rxMux);

    Serial.print("BLE RX: ");
    Serial.println(msgCopy);

    showRxOnTFT(msgCopy);

    // Echo back so you can confirm on phone (subscribe to TX notify)
    bleSend("echo: " + msgCopy);

    lastActivity = millis();
  }

  b1.update();
  b2.update();
  b3.update();

  bool f1 = b1.fell();
  bool f2 = b2.fell();
  bool f3 = b3.fell();

  if (f1 || f2 || f3) {
    lastActivity = millis();
    int hrRaw = analogRead(HR_ADC);
    String which = f1 ? "BTN1" : (f2 ? "BTN2" : "BTN3");
    bleSend("Press " + which + " | HR=" + String(hrRaw));
  }

  // Display HR every 250ms
  static uint32_t lastUpdate = 0;
  if (millis() - lastUpdate > 250) {
    lastUpdate = millis();
    int hrRaw = analogRead(HR_ADC);

    tft.fillRect(10, 90, 220, 30, ST77XX_BLACK);
    tft.setCursor(10, 90);
    tft.setTextSize(2);
    tft.setTextColor(ST77XX_WHITE);
    tft.print("HR ADC: ");
    tft.print(hrRaw);
  }

  // Optional BLE HR every 1s
  static uint32_t lastBleHr = 0;
  if (millis() - lastBleHr > 1000) {
    lastBleHr = millis();
    int hrRaw = analogRead(HR_ADC);
    bleSend("HR=" + String(hrRaw));
  }

  if (!bleConnected && (millis() - lastActivity > SLEEP_IDLE_MS)) {
    Serial.println("Sleeping...");
    enterDeepSleep();
    lastActivity = millis();
  }

  delay(10);
}
