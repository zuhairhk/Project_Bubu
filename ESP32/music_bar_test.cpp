#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <math.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include "driver/rtc_io.h"
#include "driver/gpio.h"

// ===================== Accelerometer (ADXL345) =====================
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>

// ===================== Custom face bitmap =====================
#include "face.h"   // FACE_W, FACE_H, face_bitmap[]

// ===================== BLE (NimBLE) =====================
#include <NimBLEDevice.h>

/* ===================== USER PARAMETERS ===================== */

// Default UI at power-up:
// false = watch face mode
// true  = debug mode
static const bool START_IN_DEBUG_MODE = false;

// Allow pressing all 3 buttons together to toggle mode
static const bool ENABLE_DEBUG_CHORD_TOGGLE = true;

// How long all 3 buttons must be held to toggle mode
static const uint32_t DEBUG_CHORD_HOLD_MS = 800;

/* ===================== Step detection calibration ===================== */
const float ALPHA = 0.94;
const float NEW_THRESH_UP  = 2.8;
const float NEW_THRESH_LOW = 1.2;
const int   MIN_STEP_TIME  = 300;

Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);

float x_avg = 0, y_avg = 0, z_avg = 0;
int stepsOld = 0;
int stepsNew = 0;
bool stateOld = false;
bool stateNew = false;
unsigned long lastStepTime = 0;

// For display/debug
float lastAx = 0.0f, lastAy = 0.0f, lastAz = 0.0f;

/* ===================== TFT pins ===================== */
#define TFT_MOSI 35
#define TFT_SCLK 36
#define TFT_CS   34
#define TFT_DC   5
#define TFT_RST  4
#define TFT_BL   21

/* ===================== I2C pins ===================== */
#define I2C_SDA  8
#define I2C_SCL  9

/* ===================== Heart sensor ===================== */
#define HR_ADC   1

/* ===================== Buttons (active-low) ===================== */
#define BTN1     6
#define BTN2     7
#define BTN3     2

static const uint32_t DEBOUNCE_MS   = 35;
static const uint32_t SLEEP_IDLE_MS = 10UL * 60UL * 1000UL;
static const uint32_t RTC_QUIET_MS  = 800;

/* ===================== Display object ===================== */
Adafruit_ST7789 tft = Adafruit_ST7789(&SPI, TFT_CS, TFT_DC, TFT_RST);

static void screenOff() { digitalWrite(TFT_BL, LOW); }
static void screenOn()  { digitalWrite(TFT_BL, HIGH); }

/* ===================== BLE UUIDs ===================== */
static const char* BLE_NAME = "Commubu";
static NimBLEUUID SERVICE_UUID("6E400001-B5A3-F393-E0A9-E50E24DCCA9E");
static NimBLEUUID CHAR_UUID_RX("6E400002-B5A3-F393-E0A9-E50E24DCCA9E");
static NimBLEUUID CHAR_UUID_TX("6E400003-B5A3-F393-E0A9-E50E24DCCA9E");

static NimBLEServer*         bleServer = nullptr;
static NimBLECharacteristic* txChar    = nullptr;
static NimBLECharacteristic* rxChar    = nullptr;
static volatile bool bleConnected = false;

static portMUX_TYPE rxMux = portMUX_INITIALIZER_UNLOCKED;
static volatile bool rxPending = false;
static String rxMessage;

/* ===================== UI mode ===================== */
enum UiMode {
  UI_WATCH = 0,
  UI_DEBUG = 1
};

static UiMode uiMode = START_IN_DEBUG_MODE ? UI_DEBUG : UI_WATCH;

/* ===================== Watch-face colors/layout ===================== */
#define FACE_GREEN  0xA7F0

static const uint8_t labelSize = 1;
static const uint8_t valueSize = 2;

/* ===================== Music bar ===================== */
static String currentSong = "Let It Happen - Tame Impala";

static const uint8_t musicTextSize = 2;
static const int16_t musicBarTopY = 288;
static const int16_t musicBarTextY = 293;   // moved slightly up
static const int16_t musicBarHeight = 32;

static const int16_t musicTextX = 6;
static const int16_t musicTextW = 240 - musicTextX - 4;

static int16_t musicScrollX = 0;
static uint32_t lastMusicScrollMs = 0;
static const uint32_t MUSIC_SCROLL_INTERVAL_MS = 160; // slower scroll
static const int16_t MUSIC_SCROLL_STEP = 2;
static const int16_t MUSIC_GAP_PX = 24;               // gap before restart

/* ===================== Heart-rate processing ===================== */
static const uint32_t HR_SAMPLE_MS  = 10;    // 100 Hz
static const uint32_t HR_MIN_IBI_MS = 300;   // max ~200 BPM
static const uint32_t HR_MAX_IBI_MS = 2000;  // min ~30 BPM

float hrDc = 0.0f;
float hrLp = 0.0f;
float hrPrev = 0.0f;
float hrThresh = 25.0f;
float hrPeak = 0.0f;
bool hrArmed = true;

uint32_t lastHrSampleMs = 0;
uint32_t lastBeatMs = 0;
int currentBPM = 0;
int hrRawLatest = 0;

static const int BPM_AVG_COUNT = 5;
int bpmHist[BPM_AVG_COUNT] = {0};
int bpmHistIdx = 0;
int bpmHistUsed = 0;

/* ===================== Cached watch UI values ===================== */
static int lastDrawnSteps = -1;
static int lastDrawnBPM = -999;
static int lastDrawnADC = -99999;
static String lastDrawnSong = "";
static bool watchRxVisible = false;
static String lastWatchRx = "";

/* ===================== Helpers ===================== */
static int averageBPM(int newBpm) {
  bpmHist[bpmHistIdx] = newBpm;
  bpmHistIdx = (bpmHistIdx + 1) % BPM_AVG_COUNT;
  if (bpmHistUsed < BPM_AVG_COUNT) bpmHistUsed++;

  long sum = 0;
  for (int i = 0; i < bpmHistUsed; i++) sum += bpmHist[i];
  return (int)(sum / bpmHistUsed);
}

static void resetHeartState() {
  hrDc = 0.0f;
  hrLp = 0.0f;
  hrPrev = 0.0f;
  hrThresh = 25.0f;
  hrPeak = 0.0f;
  hrArmed = true;
  lastBeatMs = 0;
  currentBPM = 0;
  hrRawLatest = 0;

  for (int i = 0; i < BPM_AVG_COUNT; i++) bpmHist[i] = 0;
  bpmHistIdx = 0;
  bpmHistUsed = 0;
}

static void invalidateWatchCache() {
  lastDrawnSteps = -1;
  lastDrawnBPM = -999;
  lastDrawnADC = -99999;
  lastDrawnSong = "";
  watchRxVisible = false;
  lastWatchRx = "";
  musicScrollX = 0;
}

static void bleSend(const String& msg) {
  if (!txChar) return;
  txChar->setValue(msg.c_str());
  if (bleConnected) txChar->notify();
}

/* ===================== Text helpers ===================== */
int16_t textWidth(const char *txt, uint8_t size) {
  int16_t x1, y1;
  uint16_t w, h;
  tft.setTextSize(size);
  tft.getTextBounds((char*)txt, 0, 0, &x1, &y1, &w, &h);
  return w;
}

static int16_t stringWidth(const String& txt, uint8_t size) {
  int16_t x1, y1;
  uint16_t w, h;
  tft.setTextSize(size);
  tft.getTextBounds(txt.c_str(), 0, 0, &x1, &y1, &w, &h);
  return (int16_t)w;
}

void drawCenteredText(const char *txt, int16_t y, uint8_t size, uint16_t color) {
  int16_t w = textWidth(txt, size);
  tft.setTextSize(size);
  tft.setTextColor(color, ST77XX_BLACK);
  tft.setCursor((tft.width() - w) / 2, y);
  tft.print(txt);
}

void printLeft(const char *txt, int16_t x, int16_t y, uint8_t size, uint16_t color) {
  tft.setTextSize(size);
  tft.setTextColor(color, ST77XX_BLACK);
  tft.setCursor(x, y);
  tft.print(txt);
}

void printCenterFixedBox(const char *txt, int16_t boxLeft, int16_t boxWidth,
                         int16_t y, uint8_t size, uint16_t color) {
  int16_t w = textWidth(txt, size);
  int16_t x = boxLeft + (boxWidth - w) / 2;
  tft.setTextSize(size);
  tft.setTextColor(color, ST77XX_BLACK);
  tft.setCursor(x, y);
  tft.print(txt);
}

void printRightFixedBox(const char *txt, int16_t boxLeft, int16_t boxWidth,
                        int16_t y, uint8_t size, uint16_t color) {
  int16_t w = textWidth(txt, size);
  int16_t x = boxLeft + boxWidth - w;
  tft.setTextSize(size);
  tft.setTextColor(color, ST77XX_BLACK);
  tft.setCursor(x, y);
  tft.print(txt);
}

/* ===================== BLE callbacks ===================== */
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
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  bleServer = NimBLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  NimBLEService* svc = bleServer->createService(SERVICE_UUID);

  txChar = svc->createCharacteristic(
    CHAR_UUID_TX,
    NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
  );
  txChar->setValue("boot");

  rxChar = svc->createCharacteristic(
    CHAR_UUID_RX,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  rxChar->setCallbacks(new RxCallbacks());

  svc->start();

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
}

/* ===================== Debounced button ===================== */
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
  bool pressed() const { return stableState == LOW; }
};

DebouncedButton b1, b2, b3;

/* ===================== TFT init ===================== */
static void initTFT() {
  screenOff();

  pinMode(TFT_CS, OUTPUT);  digitalWrite(TFT_CS, HIGH);
  pinMode(TFT_DC, OUTPUT);  digitalWrite(TFT_DC, HIGH);
  pinMode(TFT_RST, OUTPUT); digitalWrite(TFT_RST, HIGH);

  SPI.begin(TFT_SCLK, -1, TFT_MOSI, TFT_CS);

  tft.init(240, 320);
  tft.setRotation(0);   // portrait
  tft.setSPISpeed(20000000);

  tft.fillScreen(ST77XX_BLACK);

  screenOn();
  delay(5);
}

/* ===================== Watch-face UI ===================== */
static void drawFaceRegion() {
  tft.drawRGBBitmap(0, 0, face_bitmap, FACE_W, FACE_H);
  tft.drawFastHLine(0, FACE_H, tft.width(), ST77XX_WHITE);
}

static void drawMusicBarFrame() {
  tft.fillRect(0, musicBarTopY, tft.width(), musicBarHeight, ST77XX_BLACK);
  tft.drawFastHLine(0, musicBarTopY, tft.width(), ST77XX_WHITE);
}

static void drawWatchStatsLabels() {
  const int16_t w = tft.width();
  const int16_t colW = w / 3;
  const int16_t baseY = 238;

  printLeft("Steps", 10, baseY, labelSize, FACE_GREEN);
  printCenterFixedBox("BPM", colW * 1, colW, baseY, labelSize, FACE_GREEN);
  printRightFixedBox("ADC", colW * 2, colW, baseY, labelSize, FACE_GREEN);
}

static void drawWatchStatsValues(bool force = false) {
  if (!force &&
      lastDrawnSteps == stepsNew &&
      lastDrawnBPM == currentBPM &&
      lastDrawnADC == hrRawLatest) {
    return;
  }

  const int16_t w = tft.width();
  const int16_t colW = w / 3;
  const int16_t valY  = 254;

  tft.fillRect(0, valY - 2, tft.width(), 22, ST77XX_BLACK);

  char sBuf[16], bBuf[16], aBuf[16];
  snprintf(sBuf, sizeof(sBuf), "%d", stepsNew);
  if (currentBPM > 0) snprintf(bBuf, sizeof(bBuf), "%d", currentBPM);
  else snprintf(bBuf, sizeof(bBuf), "--");
  snprintf(aBuf, sizeof(aBuf), "%d", hrRawLatest);

  printLeft(sBuf, 10, valY, valueSize, FACE_GREEN);
  printCenterFixedBox(bBuf, colW * 1, colW, valY, valueSize, FACE_GREEN);
  printRightFixedBox(aBuf, colW * 2, colW, valY, valueSize, FACE_GREEN);

  lastDrawnSteps = stepsNew;
  lastDrawnBPM = currentBPM;
  lastDrawnADC = hrRawLatest;
}

static void drawWatchRxArea(const String& msg) {
  tft.fillRect(0, 274, 240, 12, ST77XX_BLACK);
  tft.setCursor(6, 275);
  tft.setTextSize(1);
  tft.setTextColor(FACE_GREEN, ST77XX_BLACK);
  tft.print("RX: ");

  String clipped = msg;
  if (clipped.length() > 26) clipped = clipped.substring(0, 26);
  tft.print(clipped);

  watchRxVisible = true;
  lastWatchRx = clipped;
}

static void clearWatchRxArea() {
  tft.fillRect(0, 274, 240, 12, ST77XX_BLACK);
  watchRxVisible = false;
  lastWatchRx = "";
}

static void updateMusicBar(bool force = false) {
  static int16_t textW = 0;

  if (force || currentSong != lastDrawnSong) {
    musicScrollX = 0;
    textW = stringWidth(currentSong, musicTextSize);
    lastDrawnSong = currentSong;
    lastMusicScrollMs = millis();
  }

  uint32_t now = millis();

  if (textW <= musicTextW) {
    if (!force) return;

    // Clear the full visible song band
    tft.fillRect(0, musicBarTopY + 2, tft.width(), musicBarHeight - 4, ST77XX_BLACK);

    tft.setTextWrap(false);
    tft.setTextSize(musicTextSize);
    tft.setTextColor(FACE_GREEN, ST77XX_BLACK);
    tft.setCursor(musicTextX, musicBarTextY);
    tft.print(currentSong);
    return;
  }

  if (!force && (now - lastMusicScrollMs < MUSIC_SCROLL_INTERVAL_MS)) {
    return;
  }

  if (!force) {
    lastMusicScrollMs = now;
    musicScrollX += MUSIC_SCROLL_STEP;

    // restart once full text + gap has moved through
    if (musicScrollX > (textW + MUSIC_GAP_PX)) {
      musicScrollX = 0;
    }
  }

  // Clear the full row so no pixels remain on the left
  tft.fillRect(0, musicBarTopY + 2, tft.width(), musicBarHeight - 4, ST77XX_BLACK);

  tft.setTextWrap(false);
  tft.setTextSize(musicTextSize);
  tft.setTextColor(FACE_GREEN, ST77XX_BLACK);

  // Draw one copy only
  int16_t drawX = musicTextX - musicScrollX;
  tft.setCursor(drawX, musicBarTextY);
  tft.print(currentSong);
}

static void drawWatchFaceStatic() {
  tft.fillScreen(ST77XX_BLACK);

  drawFaceRegion();

  drawCenteredText("Commubu", 155, 2, FACE_GREEN);
  drawCenteredText("--:--", 180, 4, FACE_GREEN);

  drawWatchStatsLabels();
  drawWatchStatsValues(true);

  tft.fillRect(0, 274, 240, 12, ST77XX_BLACK);
  drawMusicBarFrame();
  updateMusicBar(true);
}

/* ===================== Debug UI ===================== */
static void showRxOnTFT_Debug(const String& msg) {
  tft.fillRect(0, 190, 240, 50, ST77XX_BLACK);
  tft.setTextWrap(false);

  tft.setCursor(10, 195);
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_GREEN);
  tft.print("RX:");

  tft.setCursor(10, 210);
  tft.setTextColor(ST77XX_WHITE);

  String clipped = msg;
  if (clipped.length() > 32) clipped = clipped.substring(0, 32);
  tft.print(clipped);
}

static void drawDebugUI(const char* wakeStr) {
  tft.fillScreen(ST77XX_BLACK);

  tft.setTextWrap(false);
  tft.setTextColor(ST77XX_WHITE);

  tft.setTextSize(2);
  tft.setCursor(10, 10);
  tft.print("Debug mode");

  tft.setTextSize(1);
  tft.setCursor(10, 38);
  tft.print("Wake: ");
  tft.print(wakeStr);

  tft.setTextSize(2);
  tft.setCursor(10, 65);
  tft.print("BPM: ");
  if (currentBPM > 0) tft.print(currentBPM);
  else tft.print("--");

  tft.setTextSize(1);
  tft.setCursor(10, 92);
  tft.print("ADC: ");
  tft.print(hrRawLatest);

  tft.setTextSize(2);
  tft.setCursor(10, 118);
  tft.print("Steps: ");
  tft.print(stepsNew);

  tft.setTextSize(1);
  tft.setCursor(10, 148);
  tft.print("X: "); tft.print(lastAx, 1);
  tft.setCursor(10, 160);
  tft.print("Y: "); tft.print(lastAy, 1);
  tft.setCursor(10, 172);
  tft.print("Z: "); tft.print(lastAz, 1);

  tft.fillRect(0, 190, 240, 50, ST77XX_BLACK);
  tft.setCursor(10, 195);
  tft.setTextColor(ST77XX_GREEN);
  tft.print("RX: (waiting...)");

  tft.setCursor(10, 255);
  tft.setTextColor(ST77XX_WHITE);
  tft.print("Hold BTN1+BTN2+BTN3");
  tft.setCursor(10, 268);
  tft.print("to toggle mode");
}

static void updateDebugHRonTFT() {
  static int lastDbgBpm = -999;
  static int lastDbgAdc = -99999;

  if (lastDbgBpm == currentBPM && lastDbgAdc == hrRawLatest) return;

  tft.fillRect(10, 65, 220, 40, ST77XX_BLACK);

  tft.setCursor(10, 65);
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_WHITE);
  tft.print("BPM: ");
  if (currentBPM > 0) tft.print(currentBPM);
  else tft.print("--");

  tft.setCursor(10, 92);
  tft.setTextSize(1);
  tft.print("ADC: ");
  tft.print(hrRawLatest);

  lastDbgBpm = currentBPM;
  lastDbgAdc = hrRawLatest;
}

static void updateDebugStepsOnTFT() {
  static int lastDbgSteps = -1;
  if (lastDbgSteps == stepsNew) return;

  tft.fillRect(10, 118, 220, 20, ST77XX_BLACK);
  tft.setCursor(10, 118);
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_WHITE);
  tft.print("Steps: ");
  tft.print(stepsNew);

  lastDbgSteps = stepsNew;
}

static void updateDebugAccelOnTFT() {
  static float prevX = 9999.0f, prevY = 9999.0f, prevZ = 9999.0f;

  if (fabsf(prevX - lastAx) < 0.1f &&
      fabsf(prevY - lastAy) < 0.1f &&
      fabsf(prevZ - lastAz) < 0.1f) {
    return;
  }

  tft.fillRect(10, 148, 220, 32, ST77XX_BLACK);
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(10, 148);
  tft.print("X: "); tft.print(lastAx, 1);
  tft.setCursor(10, 160);
  tft.print("Y: "); tft.print(lastAy, 1);
  tft.setCursor(10, 172);
  tft.print("Z: "); tft.print(lastAz, 1);

  prevX = lastAx;
  prevY = lastAy;
  prevZ = lastAz;
}

/* ===================== UI dispatch ===================== */
static void redrawCurrentUI(const char* wakeStr) {
  if (uiMode == UI_DEBUG) {
    drawDebugUI(wakeStr);
  } else {
    invalidateWatchCache();
    drawWatchFaceStatic();
  }
}

static void showRxOnTFT(const String& msg) {
  if (uiMode == UI_DEBUG) {
    showRxOnTFT_Debug(msg);
  } else {
    drawWatchRxArea(msg);
  }
}

/* ===================== Wake helpers ===================== */
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
    if (r1 == 0 || r2 == 0 || r3 == 0) return false;
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

/* ===================== Accelerometer ===================== */
static bool initAccel() {
  if (!accel.begin()) {
    Serial.println("ADXL345 not found!");
    return false;
  }
  accel.setRange(ADXL345_RANGE_8_G);

  sensors_event_t event;
  accel.getEvent(&event);
  x_avg = event.acceleration.x;
  y_avg = event.acceleration.y;
  z_avg = event.acceleration.z;

  lastAx = event.acceleration.x;
  lastAy = event.acceleration.y;
  lastAz = event.acceleration.z;

  Serial.println("ADXL345 OK");
  return true;
}

static void accelStepUpdate(bool& didNewStep) {
  didNewStep = false;

  sensors_event_t event;
  accel.getEvent(&event);

  lastAx = event.acceleration.x;
  lastAy = event.acceleration.y;
  lastAz = event.acceleration.z;

  x_avg = (ALPHA * x_avg) + ((1.0f - ALPHA) * event.acceleration.x);
  y_avg = (ALPHA * y_avg) + ((1.0f - ALPHA) * event.acceleration.y);
  z_avg = (ALPHA * z_avg) + ((1.0f - ALPHA) * event.acceleration.z);

  float total_raw = sqrtf(event.acceleration.x * event.acceleration.x +
                          event.acceleration.y * event.acceleration.y +
                          event.acceleration.z * event.acceleration.z);

  float dx = event.acceleration.x - x_avg;
  float dy = event.acceleration.y - y_avg;
  float dz = event.acceleration.z - z_avg;

  float total_new = sqrtf(dx * dx + dy * dy + dz * dz);

  if (total_raw > 12.0f && !stateOld) {
    stepsOld++;
    stateOld = true;
  } else if (total_raw < 10.5f) {
    stateOld = false;
  }

  unsigned long currentTime = millis();
  if (total_new > NEW_THRESH_UP && !stateNew) {
    if (currentTime - lastStepTime > (unsigned long)MIN_STEP_TIME) {
      stepsNew++;
      lastStepTime = currentTime;
      stateNew = true;
      didNewStep = true;
    }
  } else if (total_new < NEW_THRESH_LOW) {
    stateNew = false;
  }
}

/* ===================== Heart rate ===================== */
static void updateHeartRate() {
  uint32_t now = millis();
  if (now - lastHrSampleMs < HR_SAMPLE_MS) return;
  lastHrSampleMs = now;

  int raw = analogRead(HR_ADC);
  hrRawLatest = raw;

  hrDc = 0.995f * hrDc + 0.005f * raw;
  float ac = raw - hrDc;

  hrLp = 0.85f * hrLp + 0.15f * ac;

  float mag = fabsf(hrLp);
  if (mag > hrPeak) hrPeak = mag;
  hrPeak *= 0.995f;

  float adaptive = hrPeak * 0.50f;
  if (adaptive < 18.0f) adaptive = 18.0f;
  if (adaptive > 120.0f) adaptive = 120.0f;
  hrThresh = adaptive;

  bool risingCross = (hrPrev < hrThresh && hrLp >= hrThresh);

  if (risingCross && hrArmed) {
    uint32_t ibi = now - lastBeatMs;

    if (lastBeatMs != 0 && ibi >= HR_MIN_IBI_MS && ibi <= HR_MAX_IBI_MS) {
      int bpm = (int)(60000.0f / ibi);
      if (bpm >= 40 && bpm <= 190) {
        currentBPM = averageBPM(bpm);
      }
    }

    lastBeatMs = now;
    hrArmed = false;
  }

  if (hrLp < (0.5f * hrThresh)) {
    hrArmed = true;
  }

  hrPrev = hrLp;

  if (lastBeatMs != 0 && (now - lastBeatMs) > 3000) {
    currentBPM = 0;
  }
}

/* ===================== Mode toggle by 3-button chord ===================== */
static void handleModeToggleChord(const char* wakeStr) {
  if (!ENABLE_DEBUG_CHORD_TOGGLE) return;

  static bool chordLatched = false;
  static uint32_t chordStartMs = 0;

  bool allPressed = b1.pressed() && b2.pressed() && b3.pressed();

  if (allPressed) {
    if (chordStartMs == 0) {
      chordStartMs = millis();
    }

    if (!chordLatched && (millis() - chordStartMs >= DEBUG_CHORD_HOLD_MS)) {
      uiMode = (uiMode == UI_DEBUG) ? UI_WATCH : UI_DEBUG;
      chordLatched = true;

      redrawCurrentUI(wakeStr);

      if (uiMode == UI_DEBUG) bleSend("UI mode: DEBUG");
      else bleSend("UI mode: WATCH");

      Serial.print("UI toggled to: ");
      Serial.println(uiMode == UI_DEBUG ? "DEBUG" : "WATCH");
    }
  } else {
    chordStartMs = 0;
    chordLatched = false;
  }
}

/* ===================== Setup ===================== */
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
  initAccel();

  initBLE();
  bleSend("Commubu booted");

  resetHeartState();

  for (int i = 0; i < 100; i++) {
    updateHeartRate();
    delay(10);
  }

  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  const char* causeStr = wakeCauseToStr(cause);

  Serial.print("Wake cause: ");
  Serial.println(causeStr);

  redrawCurrentUI(causeStr);
  bleSend(String("Wake: ") + causeStr + " | BPM=" + String(currentBPM));
}

/* ===================== Loop ===================== */
void loop() {
  static uint32_t lastActivity = millis();
  static esp_sleep_wakeup_cause_t cachedCause = esp_sleep_get_wakeup_cause();
  static const char* causeStr = wakeCauseToStr(cachedCause);

  updateHeartRate();

  if (rxPending) {
    String msgCopy;
    portENTER_CRITICAL(&rxMux);
    msgCopy = rxMessage;
    rxPending = false;
    portEXIT_CRITICAL(&rxMux);

    Serial.print("BLE RX: ");
    Serial.println(msgCopy);

    showRxOnTFT(msgCopy);
    bleSend("echo: " + msgCopy);

    lastActivity = millis();
  }

  b1.update();
  b2.update();
  b3.update();

  handleModeToggleChord(causeStr);

  if (b1.fell() || b2.fell() || b3.fell()) {
    lastActivity = millis();
    bleSend("Button press | BPM=" + String(currentBPM));
  }

  static uint32_t lastAccel = 0;
  if (millis() - lastAccel >= 40) {
    lastAccel = millis();
    bool didStep = false;
    accelStepUpdate(didStep);

    if (uiMode == UI_DEBUG) updateDebugAccelOnTFT();

    if (didStep) {
      if (uiMode == UI_DEBUG) updateDebugStepsOnTFT();
      else drawWatchStatsValues(false);

      lastActivity = millis();
      bleSend("Step! count=" + String(stepsNew));
    }
  }

  // Update main stats more slowly to reduce flicker
  static uint32_t lastStatsUi = 0;
  if (millis() - lastStatsUi >= 250) {
    lastStatsUi = millis();

    if (uiMode == UI_DEBUG) {
      updateDebugHRonTFT();
      updateDebugStepsOnTFT();
    } else {
      drawWatchStatsValues(false);
    }
  }

  // Update bottom scrolling text more slowly
  if (uiMode == UI_WATCH) {
    updateMusicBar(false);
  }

  static uint32_t lastBleHr = 0;
  if (millis() - lastBleHr > 1000) {
    lastBleHr = millis();
    bleSend("BPM=" + String(currentBPM) + " ADC=" + String(hrRawLatest));
  }

  if (!bleConnected && (millis() - lastActivity > SLEEP_IDLE_MS)) {
    Serial.println("Sleeping...");
    enterDeepSleep();
    lastActivity = millis();
  }

  delay(2);
}