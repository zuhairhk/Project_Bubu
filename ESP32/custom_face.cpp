#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>

#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>

#include "face.h"   // FACE_W, FACE_H, face_bitmap[]

#define TFT_CS   12
#define TFT_RST  27
#define TFT_DC   14

Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_RST);

#define FACE_GREEN  0xA7F0  // light green

// ---------------- ADXL345 ----------------
Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);

// ---------------- Layout constants ----------------
static const uint8_t labelSize = 1;
static const uint8_t valueSize = 2;

// XYZ row
static const uint8_t xyzSize = 1;
static const int16_t xyzY    = 308;

// ---------------- Low-pass filter ----------------
static float alpha = 0.18f;
static bool  filtInit = false;
static float fx = 0, fy = 0, fz = 0;
static const float deadband = 0.02f;

// ---------------- Text helpers ----------------
int16_t textWidth(const char *txt, uint8_t size) {
  int16_t x1, y1;
  uint16_t w, h;
  tft.setTextSize(size);
  tft.getTextBounds((char*)txt, 0, 0, &x1, &y1, &w, &h);
  return w;
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

// ---------------- Face drawing ----------------
void drawFaceRegion() {
  // Draw bitmap face covering full top region
  tft.drawRGBBitmap(0, 0, face_bitmap, FACE_W, FACE_H);

  // Divider line below face
  tft.drawFastHLine(0, FACE_H, tft.width(), ST77XX_WHITE);
}

// ---------------- Static UI ----------------
void drawWatchFaceStatic() {
  tft.fillScreen(ST77XX_BLACK);

  drawFaceRegion();

  // Center overlays
  drawCenteredText("Name", 155, 2, FACE_GREEN);
  drawCenteredText("15:19", 180, 4, FACE_GREEN);

  // Stats row
  const int16_t w = tft.width();
  const int16_t colW = w / 3;

  int16_t baseY = 238;
  int16_t valY  = baseY + 16;

  printLeft("Steps", 10, baseY, labelSize, FACE_GREEN);
  printLeft("379",   10, valY,  valueSize, FACE_GREEN);

  printCenterFixedBox("BPM",      colW * 1, colW, baseY, labelSize, FACE_GREEN);
  printRightFixedBox ("Distance", colW * 2, colW, baseY, labelSize, FACE_GREEN);

  printCenterFixedBox("70",    colW * 1, colW, valY, valueSize, FACE_GREEN);
  printRightFixedBox ("288.4", colW * 2, colW, valY, valueSize, FACE_GREEN);
}

// ---------------- XYZ update ----------------
void updateXYZRow(float x, float y, float z) {
  tft.fillRect(0, xyzY - 2, tft.width(), (xyzSize * 8) + 6, ST77XX_BLACK);

  char xs[16], ys[16], zs[16];
  snprintf(xs, sizeof(xs), "X: %.1f", x);
  snprintf(ys, sizeof(ys), "Y: %.1f", y);
  snprintf(zs, sizeof(zs), "Z: %.1f", z);

  const int16_t colW = tft.width() / 3;
  const int16_t margin = 6;

  printLeft(xs, margin, xyzY, xyzSize, FACE_GREEN);
  printCenterFixedBox(ys, colW * 1, colW, xyzY, xyzSize, FACE_GREEN);
  printRightFixedBox(zs, colW * 2, colW - margin, xyzY, xyzSize, FACE_GREEN);
}

// ---------------- Low-pass filter ----------------
void lowPassUpdate(float x, float y, float z, float &ox, float &oy, float &oz) {
  if (!filtInit) {
    fx = x; fy = y; fz = z;
    filtInit = true;
  } else {
    fx += alpha * (x - fx);
    fy += alpha * (y - fy);
    fz += alpha * (z - fz);
  }
  ox = fx; oy = fy; oz = fz;
}

// ---------------- Setup / Loop ----------------
void setup() {
  tft.init(240, 320);
  tft.setRotation(0);

  Wire.begin(21, 22);

  if (!accel.begin()) {
    tft.fillScreen(ST77XX_BLACK);
    drawCenteredText("ADXL345 FAIL", 150, 2, ST77XX_WHITE);
    while (1);
  }

  accel.setRange(ADXL345_RANGE_4_G);

  drawWatchFaceStatic();
  updateXYZRow(0, 0, 0);
}

void loop() {
  sensors_event_t e;
  accel.getEvent(&e);

  float sx, sy, sz;
  lowPassUpdate(e.acceleration.x,
                e.acceleration.y,
                e.acceleration.z,
                sx, sy, sz);

  static float lx = 0, ly = 0, lz = 0;
  if (fabsf(sx - lx) > deadband ||
      fabsf(sy - ly) > deadband ||
      fabsf(sz - lz) > deadband) {

    updateXYZRow(sx, sy, sz);
    lx = sx; ly = sy; lz = sz;
  }

  delay(50);
}
