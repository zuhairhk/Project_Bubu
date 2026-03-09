#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include "driver/rtc_io.h"   // RTC GPIO helpers (wake pins)
#include "driver/gpio.h"     // GPIO hold for deep sleep (backlight)

// ---- TFT (ST7789) ----
#define TFT_MOSI 35   // SPI MO
#define TFT_SCLK 36   // SPI SCK
#define TFT_CS   34
#define TFT_DC   5
#define TFT_RST  4
#define TFT_BL   21   // BL enable (HIGH=on, LOW=off)

// ---- I2C ----
#define I2C_SDA  8
#define I2C_SCL  9

// ---- Heart sensor (analog) ----
#define HR_ADC   1    // A0 / GPIO1

// ---- Buttons (active-low) ----
#define BTN1     6
#define BTN2     7
#define BTN3     2

// ---------------- Debounce + sleep timing ----------------
static const uint32_t DEBOUNCE_MS   = 35;     // typical 20–60ms
static const uint32_t SLEEP_IDLE_MS = 2000;   // idle time before sleeping
static const uint32_t RTC_QUIET_MS  = 800;    // must be HIGH this long before sleeping

struct DebouncedButton {
  uint8_t pin;
  bool stableState;          // debounced state (HIGH idle, LOW pressed)
  bool lastStableState;      // previous debounced state
  bool lastRaw;              // last raw read
  uint32_t lastChangeMs;     // when raw last changed

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

// Create display object
Adafruit_ST7789 tft = Adafruit_ST7789(&SPI, TFT_CS, TFT_DC, TFT_RST);

static void screenOff() { digitalWrite(TFT_BL, LOW); }
static void screenOn()  { digitalWrite(TFT_BL, HIGH); }

static void initTFT() {
  // Keep BL OFF during init to avoid visible flicker
  screenOff();

  // Put control pins in safe states early
  pinMode(TFT_CS, OUTPUT);  digitalWrite(TFT_CS, HIGH); // deselect TFT
  pinMode(TFT_DC, OUTPUT);  digitalWrite(TFT_DC, HIGH);
  pinMode(TFT_RST, OUTPUT); digitalWrite(TFT_RST, HIGH);

  // Init SPI
  SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);

  // Init ST7789
  tft.init(240, 320);
  tft.setRotation(1);
  // NOTE: series resistors on SCLK/MOSI/DC/CS/RST + lower SPI speed reduce wake flicker/back-power artifacts.
  tft.setSPISpeed(20000000);  // 20 MHz

  // Clear BEFORE turning on backlight
  tft.fillScreen(ST77XX_BLACK);

  // Now turn on the backlight
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
}

static const char* wakeCauseToStr(esp_sleep_wakeup_cause_t cause) {
  switch (cause) {
    case ESP_SLEEP_WAKEUP_EXT1: return "EXT1 (buttons)";
    case ESP_SLEEP_WAKEUP_TIMER: return "TIMER";
    case ESP_SLEEP_WAKEUP_UNDEFINED: return "POWERON/RESET";
    default: return "OTHER";
  }
}

// -------- EXT1 wake diagnostics --------
static void printExt1Status() {
  uint64_t st = esp_sleep_get_ext1_wakeup_status();
  if (st == 0) {
    Serial.println("EXT1 status: 0 (no pin reported)");
    return;
  }
  Serial.print("EXT1 wake status mask: 0x");
  Serial.println((uint32_t)st, HEX);

  if (st & (1ULL << BTN1)) Serial.println(" -> BTN1 was LOW");
  if (st & (1ULL << BTN2)) Serial.println(" -> BTN2 was LOW");
  if (st & (1ULL << BTN3)) Serial.println(" -> BTN3 was LOW");
}

// -------- RTC wake-pin setup --------
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
    rtc_gpio_pullup_en(p);      // keep HIGH when unpressed
    rtc_gpio_pulldown_dis(p);
    rtc_gpio_hold_en(p);        // keep config during deep sleep
  }
}

// Require all RTC button levels HIGH continuously for ms
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
  // 1) Turn backlight off
  screenOff();
  delay(5);

  // 2) HOLD backlight LOW through deep sleep (prevents it popping back on)
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, LOW);
  gpio_hold_en((gpio_num_t)TFT_BL);
  gpio_deep_sleep_hold_en();

  // 3) Hi-Z TFT pins to reduce back-power paths
  pinMode(TFT_CS,   INPUT);
  pinMode(TFT_DC,   INPUT);
  pinMode(TFT_RST,  INPUT);
  pinMode(TFT_MOSI, INPUT);
  pinMode(TFT_SCLK, INPUT);

  // 4) Clear wake sources and configure RTC wake pins
  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  configureRtcWakePins();
  delay(20);

  // 5) Quiet window: ALL wake pins must be HIGH or we would wake instantly
  if (!rtcButtonsAllHighFor(RTC_QUIET_MS)) {
    Serial.println("Sleep aborted: wake pin LOW/noisy (would wake instantly).");

    // Release holds so you can continue running normally
    gpio_deep_sleep_hold_dis();
    gpio_hold_dis((gpio_num_t)TFT_BL);
    screenOn();
    return;
  }

  // 6) EXT1 wake on ANY LOW
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

  // Keep SPI pins quiet on boot to reduce flicker
  pinMode(TFT_BL, OUTPUT);  digitalWrite(TFT_BL, LOW);
  pinMode(TFT_CS, OUTPUT);  digitalWrite(TFT_CS, HIGH);
  pinMode(TFT_DC, OUTPUT);  digitalWrite(TFT_DC, HIGH);
  pinMode(TFT_RST, OUTPUT); digitalWrite(TFT_RST, HIGH);
  pinMode(TFT_MOSI, OUTPUT); digitalWrite(TFT_MOSI, LOW);
  pinMode(TFT_SCLK, OUTPUT); digitalWrite(TFT_SCLK, LOW);


  // IMPORTANT: release any deep-sleep holds from the previous sleep cycle
  gpio_deep_sleep_hold_dis();
  gpio_hold_dis((gpio_num_t)TFT_BL);

  // Buttons (active-low) + debouncers
  b1.begin(BTN1);
  b2.begin(BTN2);
  b3.begin(BTN3);

  // BL control
  pinMode(TFT_BL, OUTPUT);
  screenOff(); // start OFF to avoid boot flash

  // I2C init
  Wire.begin(I2C_SDA, I2C_SCL);

  // ADC setup
  analogReadResolution(12);
  analogSetPinAttenuation(HR_ADC, ADC_11db);

  // TFT init
  initTFT();

  // Wake reason
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  const char* causeStr = wakeCauseToStr(cause);

  Serial.print("Wake cause: ");
  Serial.println(causeStr);
  if (cause == ESP_SLEEP_WAKEUP_EXT1) {
    printExt1Status();
  }

  // Read HR once for demo
  int hrRaw = analogRead(HR_ADC);
  drawUI("TinyS3[D] Watch UI", hrRaw, causeStr);
}

void loop() {
  static uint32_t lastActivity = millis();

  // Update debouncers
  b1.update();
  b2.update();
  b3.update();

  // Activity on debounced press edge
  if (b1.fell() || b2.fell() || b3.fell()) {
    lastActivity = millis();
  }

  // Update HR reading periodically while awake
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

  // Sleep after idle
  if (millis() - lastActivity > SLEEP_IDLE_MS) {
    Serial.println("Sleeping...");
    enterDeepSleep();
    lastActivity = millis(); // if aborted, avoid spamming
  }

  delay(10);
}
