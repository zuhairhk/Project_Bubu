#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>

// I'll keep these here so I can turn them off if the serial monitor gets too messy
#define DO_RAW_CALC 
#define DO_DYN_CALC

Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);

// switch pins
int s1 = 12; // for the sqrt(x2+y2+z2) one
int s2 = 14; // for the dynamic one with gravity removed

// filter stuff from the diagram
float x_filt = 0;
float y_filt = 0;
float z_filt = 0;
float a = 0.98; // alpha constant

void setup(void) {
  Serial.begin(115200);
  
  pinMode(s1, INPUT_PULLUP);
  pinMode(s2, INPUT_PULLUP);

  if(!accel.begin()) {
    Serial.println("sensor failed lol");
    while(1);
  }
  
  accel.setRange(ADXL345_RANGE_16_G);
}

void loop(void) {
  sensors_event_t event;
  accel.getEvent(&event);

  // getting raw values
  float x = event.acceleration.x;
  float y = event.acceleration.y;
  float z = event.acceleration.z;

  // LPF - gravity vector calculation (the 0.98 * avg + 0.02 * instantaneous)
  x_filt = (a * x_filt) + ((1.0 - a) * x);
  y_filt = (a * y_filt) + ((1.0 - a) * y);
  z_filt = (a * z_filt) + ((1.0 - a) * z);

  // check if switches are pressed (to ground)
  bool btn1 = digitalRead(s1) == LOW;
  bool btn2 = digitalRead(s2) == LOW;

  #ifdef DO_RAW_CALC
  if(btn1){
    // Initial Equation: A_total = sqrt(X^2 + Y^2 + Z^2)
    float raw_mag = sqrt((x*x) + (y*y) + (z*z));
    Serial.print("Raw_Mag: ");
    Serial.print(raw_mag);
    Serial.print("  ");
  }
  #endif

  #ifdef DO_DYN_CALC
  if(btn2){
    // Dynamic Magnitude: sqrt((X-Xavg)^2 + (Y-Yavg)^2 + (Z-Zavg)^2)
    // this removes the 9.8 gravity noise
    float dx = x - x_filt;
    float dy = y - y_filt;
    float dz = z - z_filt;
    float dyn_mag = sqrt((dx*dx) + (dy*dy) + (dz*dz));
    
    Serial.print("Dyn_Mag: ");
    Serial.print(dyn_mag);
  }
  #endif

  // only print a newline if we are actually printing data
  if(btn1 || btn2){
    Serial.println(""); 
  }

  delay(50); // sampling rate... might need to adjust this for actual walking
}