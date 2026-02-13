#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_ADXL345_U.h>

/* --- CALIBRATION --- */
const float ALPHA = 0.94;           // Slightly faster tracking of gravity
const float NEW_THRESH_UP  = 2.8;   // INCREASED: Requires a stronger impact (was 1.5)
const float NEW_THRESH_LOW = 1.2;   // INCREASED: Higher floor to prevent jitter (was 0.8)
const int   MIN_STEP_TIME  = 300;   // DEBOUNCE: Minimum ms between steps (approx. 3 steps/sec max)

Adafruit_ADXL345_Unified accel = Adafruit_ADXL345_Unified(12345);

float x_avg = 0, y_avg = 0, z_avg = 0; 
int stepsOld = 0;
int stepsNew = 0;
bool stateOld = false;
bool stateNew = false;
unsigned long lastStepTime = 0;     // Tracks when the last "New Step" occurred

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  if(!accel.begin()) { while(1); }
  
  accel.setRange(ADXL345_RANGE_8_G); 

  sensors_event_t event;
  accel.getEvent(&event);
  x_avg = event.acceleration.x; 
  y_avg = event.acceleration.y; 
  z_avg = event.acceleration.z;
}

void loop() {
  sensors_event_t event;
  accel.getEvent(&event);

  // 1. Filtering
  x_avg = (ALPHA * x_avg) + ((1.0 - ALPHA) * event.acceleration.x);
  y_avg = (ALPHA * y_avg) + ((1.0 - ALPHA) * event.acceleration.y);
  z_avg = (ALPHA * z_avg) + ((1.0 - ALPHA) * event.acceleration.z);
  
  float total_raw = sqrt(pow(event.acceleration.x, 2) + pow(event.acceleration.y, 2) + pow(event.acceleration.z, 2));
  float total_new = sqrt(pow(event.acceleration.x - x_avg, 2) + pow(event.acceleration.y - y_avg, 2) + pow(event.acceleration.z - z_avg, 2));

  // 2. OLD LOGIC (Keep as a baseline)
  if (total_raw > 12.0 && !stateOld) { // Bumped to 12.0 for better raw accuracy
    stepsOld++; 
    stateOld = true;
  } else if (total_raw < 10.5) { 
    stateOld = false; 
  }

  // 3. NEW LOGIC (Improved Sensitivity & Debounce)
  unsigned long currentTime = millis();
  
  if (total_new > NEW_THRESH_UP && !stateNew) {
    // Check if enough time has passed since the last step
    if (currentTime - lastStepTime > MIN_STEP_TIME) {
      stepsNew++;
      lastStepTime = currentTime; 
      stateNew = true; // Lock the trigger
    }
  } else if (total_new < NEW_THRESH_LOW) {
    stateNew = false; // Reset only when motion drops below the lower threshold
  }

  // --- SERIAL OUTPUT ---
  Serial.print("FilteredMag:");
  Serial.print(total_new);
  Serial.print(",");

  Serial.print("OldSteps:");
  Serial.print(stepsOld);
  Serial.print(",");

  Serial.print("NewSteps");
  Serial.println(stepsNew);

  delay(40); // Slightly faster sampling for better peak detection
}