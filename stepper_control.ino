#include <Stepper.h>

// Define stepper motor characteristics
const int STEPS_PER_REV = 200;  // 57BYGH420 has 200 steps per revolution
const int MOTOR_SPEED = 60;     // Speed in RPM

// Define stepper motor pins
const int IN1 = 8;
const int IN2 = 9;
const int IN3 = 10;
const int IN4 = 11;

// Initialize stepper motor
Stepper stepper(STEPS_PER_REV, IN1, IN2, IN3, IN4);

// Variables for timing and control
unsigned long startTime = 0;
bool isRotating = false;
const unsigned long ROTATION_DURATION = 3000; // 3 seconds in milliseconds
int totalSteps = 0;  // Track total steps moved
float currentAngle = 0.0;  // Track current angle

void setup() {
  // Set motor speed
  stepper.setSpeed(MOTOR_SPEED);
  
  // Start serial communication
  Serial.begin(9600);
  sendDebugInfo();
}

void loop() {
  // Check if there's incoming serial data
  if (Serial.available() > 0) {
    char command = Serial.read();
    
    switch(command) {
      case 'F': // Face detected
        if (!isRotating) {
          startTime = millis();
          isRotating = true;
          sendDebugInfo();
        }
        break;
      case 'R': // Manual rotate right
        rotateSteps(10);  // Rotate 10 steps clockwise
        break;
      case 'L': // Manual rotate left
        rotateSteps(-10); // Rotate 10 steps counterclockwise
        break;
      case 'D': // Request debug info
        sendDebugInfo();
        break;
    }
  }
  
  // If motor is rotating and within 3-second window
  if (isRotating && (millis() - startTime < ROTATION_DURATION)) {
    rotateSteps(1); // Rotate clockwise one step
  } else if (isRotating && (millis() - startTime >= ROTATION_DURATION)) {
    isRotating = false;
    sendDebugInfo();
  }
}

// Function to rotate a specific number of steps
void rotateSteps(int steps) {
  stepper.step(steps);
  totalSteps += steps;
  currentAngle = (totalSteps % STEPS_PER_REV) * (360.0 / STEPS_PER_REV);
  if (currentAngle < 0) currentAngle += 360.0;
  sendDebugInfo();
}

// Function to send debug information via Serial
void sendDebugInfo() {
  String debugInfo = String("DEBUG,") + 
                    String(totalSteps) + "," +
                    String(currentAngle) + "," +
                    String(isRotating) + "," +
                    String(MOTOR_SPEED);
  Serial.println(debugInfo);
} 