let faceMesh;
let video;
let faces = [];
let options = { maxFaces: 3, refineLandmarks: false, flipHorizontal: false };
let audioIn;
let volume = 0;
let targetVolume = 0;
let currentVolume = 0;
let volumeRampSpeed = 0.02; // Controls how fast volume changes
let clapThreshold = 0.1; // Volume threshold for detecting a clap
let currentAudio = 0; // Keep track of the current audio being played
let audios = [];
let filter;
let fadeSpeed = 0.01; // Control speed of fade in/out
let fadeDirection = 1; // 1 for fade in, -1 for fade out
let minFreq, maxFreq, currentFreq;
let randomFreqRange = false; // Flag to randomly change frequency range
let randomFadeSpeed = false; // Flag to randomly change fade speed
let filterResonance = 20;
let bassOnly = true; // Start with bass-only audio
let bassFilter;
let serial; // Serial communication object
let lastFaceState = false; // Track previous face detection state

// Debug information variables
let motorDebugInfo = {
  totalSteps: 0,
  currentAngle: 0,
  isRotating: false,
  motorSpeed: 0
};

function preload() {
  // Load the faceMesh model
  faceMesh = ml5.faceMesh(options);
  audios[0] = loadSound("taloki.mp3"); 
  audios[1] = loadSound("tetakere.mp3"); 
  audios[2] = loadSound("tuki.mp3"); 

}

function setup() {
  createCanvas(640, 480);
  
  // Create control buttons
  createControlButtons();
  
  // Create the webcam video and hide it
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  
  // Initialize serial communication
  serial = new p5.SerialPort();
  serial.open('/dev/tty.usbmodem1101');
  
  // Setup serial event handlers
  serial.on('data', gotSerialData);
  
  // Request initial debug info
  setTimeout(() => {
    serial.write('D');
  }, 1000);
  
  // Start detecting faces from the webcam video
  faceMesh.detectStart(video, gotFaces);

  // Setup microphone input for clap detection
  audioIn = new p5.AudioIn();
  audioIn.start();

  // Create a LowPass filter for bass-only audio
  bassFilter = new p5.LowPass();
  bassFilter.freq(300); // Set the cutoff frequency to 150 Hz for bass-only
  bassFilter.res(filterResonance);

    // Add a gain to boost bass output
    bassGain = new p5.Gain();
    bassGain.amp(7);

  // Create a LowPass filter (you can switch to HighPass by changing this line)
  setRandomFrequencyRange(); // Set initial random frequency range
  filter = new p5.LowPass();
  filter.freq(500); // Set the cutoff frequency
  filter.res(10); // Set the resonance (affects how sharp the cutoff is)
  
    // Start the first audio in bass-only mode
  startBassOnlyAudio();
}

function createControlButtons() {
  // Create container div for buttons
  const buttonContainer = createDiv('');
  buttonContainer.position(10, 500);
  buttonContainer.style('display', 'flex');
  buttonContainer.style('gap', '10px');
  
  // Create rotate left button
  const btnLeft = createButton('Rotate Left');
  btnLeft.parent(buttonContainer);
  btnLeft.mousePressed(() => serial.write('L'));
  btnLeft.style('padding', '10px');
  
  // Create rotate right button
  const btnRight = createButton('Rotate Right');
  btnRight.parent(buttonContainer);
  btnRight.mousePressed(() => serial.write('R'));
  btnRight.style('padding', '10px');
  
  // Create debug info request button
  const btnDebug = createButton('Update Debug Info');
  btnDebug.parent(buttonContainer);
  btnDebug.mousePressed(() => serial.write('D'));
  btnDebug.style('padding', '10px');
}

function gotSerialData() {
  let data = serial.readStringUntil('\n');
  if (data) {
    data = data.trim();
    if (data.startsWith('DEBUG')) {
      const parts = data.split(',');
      if (parts.length === 5) {
        motorDebugInfo = {
          totalSteps: parseInt(parts[1]),
          currentAngle: parseFloat(parts[2]),
          isRotating: parts[3] === "1",
          motorSpeed: parseInt(parts[4])
        };
      }
    }
  }
}

function draw() {
  // Draw the webcam video
  image(video, 0, 0, width, height);

  // Check if faces exist in frame
  if (faces.length > 0) {
    for (let i = 0; i < faces.length; i++) {
      let face = faces[i];

      // Draw bounding box
      rect(face.box.xMin, face.box.yMin, face.box.width, face.box.height);
    }
  }

  // Get the microphone's volume (to detect claps)
  volume = audioIn.getLevel();

  // Check if the volume exceeds the threshold, indicating a clap
  if (volume > clapThreshold) {
    // Switch between sounds when a clap is detected
    console.log("Clap!");
    switchAudio();
  }

  // Update volume smoothly
  updateVolume();

  // Apply fade effect to the filter (this is responsible for the frequency fade)
  fadeFilter();

  // Draw debug information
  drawDebugInfo();
}

function drawDebugInfo() {
  // Set text properties
  textSize(14);
  fill(255);
  stroke(0);
  strokeWeight(2);
  
  // Create debug text
  const debugText = [
    `Total Steps: ${motorDebugInfo.totalSteps}`,
    `Current Angle: ${motorDebugInfo.currentAngle.toFixed(2)}°`,
    `Motor Status: ${motorDebugInfo.isRotating ? 'Rotating' : 'Stopped'}`,
    `Motor Speed: ${motorDebugInfo.motorSpeed} RPM`
  ];
  
  // Draw debug information
  let y = 20;
  for (let text of debugText) {
    // Draw text background
    fill(0, 128);
    noStroke();
    rect(10, y - 15, textWidth(text) + 20, 20, 5);
    
    // Draw text
    fill(255);
    text(text, 20, y);
    y += 25;
  }
}

// Callback function for when faceMesh outputs data
function gotFaces(results) {
  faces = results;
  
  // Check for face state change
  let currentFaceState = faces.length > 0;
  
  // If face state changed
  if (currentFaceState !== lastFaceState) {
    if (currentFaceState) {
      // Face appeared
      serial.write('F'); // Send face detection signal to Arduino
      fadeDirection = 1;
      bassOnly = false;
      console.log("Face detected: Switching to full audio.");
      switchToFullAudio();
    } else {
      // Face disappeared
      fadeDirection = -1;
      bassOnly = true;
      console.log('No face detected: Returning to bass-only audio.');
      startBassOnlyAudio();
    }
  }
  
  // Update last face state
  lastFaceState = currentFaceState;
}

// Function to smoothly update volume
function updateVolume() {
  // Smoothly interpolate current volume to target volume
  currentVolume = lerp(currentVolume, targetVolume, volumeRampSpeed);
  
  // Apply the volume to all audio tracks
  audios.forEach(audio => {
    audio.setVolume(currentVolume);
  });
}

// Function to start bass-only audio
function startBassOnlyAudio() {
  targetVolume = 1.0; // Set target volume to full
  audios[currentAudio].disconnect(); // Disconnect audio from the default output
  audios[currentAudio].connect(bassFilter); // Connect to the bass-only filter
  audios[currentAudio].play(); // Start audio immediately
  console.log("Bass-only audio started.");
}

// Function to switch to full audio
function switchToFullAudio() {
  targetVolume = 1.0; // Set target volume to full
  // Disconnect current audio from bass filter and apply full-range filter
  audios[currentAudio].disconnect();
  audios[currentAudio].connect(filter); // Route through full-range filter
  audios[currentAudio].play(); // Start full-range audio immediately
  console.log("Full audio started.");
}

// Modify switchAudio function to maintain volume transitions
function switchAudio() {
  // Store the current volume
  let prevVolume = currentVolume;
  
  // Stop the current audio if it's playing
  if (audios[currentAudio].isPlaying()) {
    audios[currentAudio].stop();
  }

  // Increment to the next audio clip
  currentAudio = (currentAudio + 1) % audios.length;

  // Disconnect the current audio from the default output
  audios[currentAudio].disconnect();

  if (bassOnly) {
    audios[currentAudio].connect(bassFilter);
  } else {
    audios[currentAudio].connect(filter);
  }

  // Start the new audio and set its volume to match the previous
  audios[currentAudio].play();
  audios[currentAudio].setVolume(prevVolume);
}

// Function to gradually fade the filter's frequency with randomness
function fadeFilter() {
  // Randomize fade speed
  if (randomFadeSpeed && frameCount % 200 === 0) {
    fadeSpeed = random(0.05, 0.1); // Randomize the fade speed every few frames
  }

  // Randomize frequency range when fade direction changes
  if (randomFreqRange && fadeDirection === -1) {
    setRandomFrequencyRange(); // Set new random frequency range when fading out
  }

  if (fadeDirection == 1) {
    // Fade in: Increase frequency from minFreq to maxFreq
    currentFreq = lerp(currentFreq, maxFreq, fadeSpeed);
    if (currentFreq >= maxFreq - 10) {
      // Stop fading in when the maxFreq is reached
      fadeDirection = -1; // Change direction to fade out
    }
  } else {
    // Fade out: Decrease frequency from maxFreq to minFreq
    currentFreq = lerp(currentFreq, minFreq, fadeSpeed);
    if (currentFreq <= minFreq + 10) {
      // Stop fading out when the minFreq is reached
      fadeDirection = 1; // Change direction to fade in
    }
  }
  // Set the filter's frequency to the new value
  filter.freq(currentFreq);
}

// Function to set a random frequency range for the fade
function setRandomFrequencyRange() {
  minFreq = random(200, 800); // Random minimum frequency
  maxFreq = random(minFreq + 400, 2000); // Random maximum frequency
  currentFreq = minFreq; // Start from the minimum frequency
}
