#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>

#define TFT_CS   12
#define TFT_RST  27
#define TFT_DC   14

Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);

#define FACE_GREEN  0xA7F0  // light green

// ADXL345 (I2C)
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);

// -------------------- Layout constants --------------------
static const uint8_t labelSize = 1;
static const uint8_t valueSize = 2;

// XYZ row (kept small so it fits comfortably)
static const uint8_t xyzSize   = 1;
static const int16_t xyzY      = 308;

// -------------------- Low-pass filter settings --------------------
// Exponential moving average: y[n] = y[n-1] + alpha*(x[n]-y[n-1])
// alpha in (0,1): smaller = smoother but more lag. Try 0.10 to 0.30.
static float alpha = 0.18f;

static bool  filtInit = false;
static float fx = 0.0f, fy = 0.0f, fz = 0.0f;

// Optional: small deadband so tiny jitter doesn't cause constant redraw
static const float deadband = 0.02f; // m/s^2 change threshold

// -------------------- Center helper --------------------
void drawCenteredText(const char *txt, int16_t y, uint8_t size, uint16_t color) {
  int16_t x1, y1;
  uint16_t w, h;
  tft.setTextSize(size);
  tft.setTextColor(color, ST77XX_BLACK);
  tft.getTextBounds((char*)txt, 0, 0, &x1, &y1, &w, &h);
  int16_t x = (tft.width() - w) / 2;
  tft.setCursor(x, y);
  tft.print(txt);
}

// -------------------- Text helpers --------------------
int16_t textWidth(const char *txt, uint8_t size) {
  int16_t x1, y1;
  uint16_t w, h;
  tft.setTextSize(size);
  tft.getTextBounds((char*)txt, 0, 0, &x1, &y1, &w, &h);
  return w;
}

void printLeft(const char *txt, int16_t x, int16_t y, uint8_t size, uint16_t color) {
  tft.setTextSize(size);
  tft.setTextColor(color, ST77XX_BLACK);
  tft.setCursor(x, y);
  tft.print(txt);
}

void printCenterFixedBox(const char *txt, int16_t boxLeft, int16_t boxWidth, int16_t y,
                         uint8_t size, uint16_t color) {
  int16_t w = textWidth(txt, size);
  int16_t x = boxLeft + (boxWidth - w) / 2;
  if (x < boxLeft) x = boxLeft;
  tft.setTextSize(size);
  tft.setTextColor(color, ST77XX_BLACK);
  tft.setCursor(x, y);
  tft.print(txt);
}

void printRightFixedBox(const char *txt, int16_t boxLeft, int16_t boxWidth, int16_t y,
                        uint8_t size, uint16_t color) {
  int16_t w = textWidth(txt, size);
  int16_t x = boxLeft + boxWidth - w;
  if (x < boxLeft) x = boxLeft;
  tft.setTextSize(size);
  tft.setTextColor(color, ST77XX_BLACK);
  tft.setCursor(x, y);
  tft.print(txt);
}

// -------------------- Draw static UI once --------------------
void drawWatchFaceStatic() {
  tft.fillScreen(ST77XX_BLACK);
  const int16_t w = tft.width();

  // Face
  tft.fillCircle(60, 45, 10, ST77XX_WHITE);
  tft.fillCircle(w - 60, 45, 10, ST77XX_WHITE);
  tft.fillRoundRect((w - 120) / 2, 80, 120, 10, 5, ST77XX_WHITE);
  tft.drawFastHLine(0, 135, w, ST77XX_WHITE);

  drawCenteredText("Mingo", 155, 2, FACE_GREEN);
  drawCenteredText("15:19", 180, 4, FACE_GREEN);

  // Row 1 (Steps/BPM/Distance) using fixed 3 columns to avoid overlap
  const int16_t colW = w / 3; // 80
  int16_t baseY = 238;
  int16_t valY  = baseY + 16;

  printLeft("Steps", 10, baseY, labelSize, FACE_GREEN);
  printLeft("379",   10, valY,  valueSize, FACE_GREEN);

  printCenterFixedBox("BPM",      colW * 1, colW, baseY, labelSize, FACE_GREEN);
  printRightFixedBox ("Distance", colW * 2, colW, baseY, labelSize, FACE_GREEN);

  printCenterFixedBox("70",     colW * 1, colW, valY, valueSize, FACE_GREEN);
  printRightFixedBox ("288.4",  colW * 2, colW, valY, valueSize, FACE_GREEN);
}

// -------------------- Update XYZ row only --------------------
void updateXYZRow(float x, float y, float z) {
  const int16_t w = tft.width();

  // Clear row area
  tft.fillRect(0, xyzY - 2, w, (xyzSize * 8) + 6, ST77XX_BLACK);

  char xTxt[16], yTxt[16], zTxt[16];
  snprintf(xTxt, sizeof(xTxt), "X: %.1f", x);
  snprintf(yTxt, sizeof(yTxt), "Y: %.1f", y);
  snprintf(zTxt, sizeof(zTxt), "Z: %.1f", z);

  // Fixed 3 equal columns
  const int16_t colW = w / 3; // 80px
  const int16_t margin = 6;

  // Left: left aligned
  printLeft(xTxt, margin, xyzY, xyzSize, FACE_GREEN);

  // Center: centered in middle third
  printCenterFixedBox(yTxt, colW * 1, colW, xyzY, xyzSize, FACE_GREEN);

  // Right: right aligned in last third
  printRightFixedBox(zTxt, colW * 2, colW - margin, xyzY, xyzSize, FACE_GREEN);
}

// -------------------- Low-pass filter function --------------------
void lowPassUpdate(float x, float y, float z, float &ox, float &oy, float &oz) {
  if (!filtInit) {
    // Initialize filter to first reading to avoid "ramping" from 0
    fx = x; fy = y; fz = z;
    filtInit = true;
  } else {
    fx = fx + alpha * (x - fx);
    fy = fy + alpha * (y - fy);
    fz = fz + alpha * (z - fz);
  }
  ox = fx; oy = fy; oz = fz;
}

void setup() {
  // LCD
  tft.init(240, 320);
  tft.setRotation(0);

  // I2C (ESP32 default SDA=21, SCL=22)
  Wire.begin(21, 22);

  // ADXL345 init
  if (!accel.begin()) {
    tft.fillScreen(ST77XX_BLACK);
    drawCenteredText("ADXL345 FAIL", 150, 2, ST77XX_WHITE);
    while (1) delay(10);
  }

  accel.setRange(ADXL345_RANGE_4_G);

  // Draw UI once
  drawWatchFaceStatic();
  updateXYZRow(0, 0, 0);
}

void loop() {
  sensors_event_t event;
  accel.getEvent(&event);

  // Raw values (m/s^2)
  float rx = event.acceleration.x;
  float ry = event.acceleration.y;
  float rz = event.acceleration.z;

  // Low-pass filtered
  float sx, sy, sz;
  lowPassUpdate(rx, ry, rz, sx, sy, sz);

  // Optional deadband: only redraw if it changed enough
  static float lastX = 0, lastY = 0, lastZ = 0;
  if (fabsf(sx - lastX) > deadband || fabsf(sy - lastY) > deadband || fabsf(sz - lastZ) > deadband) {
    updateXYZRow(sx, sy, sz);
    lastX = sx; lastY = sy; lastZ = sz;
  }

  delay(50); // ~20 updates/sec
}