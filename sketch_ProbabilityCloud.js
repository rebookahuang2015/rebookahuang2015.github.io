/**
 * Gesture Symphony — The Statistical Probability Cloud p5.js Wrapper
 * 
 * This sketch sets up a p5.js canvas in WEBGL mode, loads the custom
 * raymarched GLSL fragment shader, and manages the smooth transition
 * of the harmonic tension parameter (u_tension).
 */

let probabilityShader;

// The target tension we want to interpolate toward (0.0 = stable crystal, 1.0 = chaotic cloud)
// You can map this variable to chord probability or collaborative metrics!
let targetTension = 0.0;

// The current tension value interpolated smoothly in the draw loop
let currentTension = 0.0;

function preload() {
  // Load the matching vertex and fragment shaders
  probabilityShader = loadShader('shader_ProbabilityCloud.vert', 'shader_ProbabilityCloud.frag');
}

function setup() {
  // Set up the canvas in WEBGL mode for shader execution
  createCanvas(windowWidth, windowHeight, WEBGL);
  noStroke();
}

function draw() {
  background(0);

  // --- INTERACTION / TESTING CONTROL ---
  // For testing convenience: Map the mouse X position to targetTension
  // Moving the mouse from left to right will transition the shader from State 1 to State 2.
  // Click/tap the screen to toggle automated target values if mouse is not moving.
  if (mouseIsPressed) {
    targetTension = 1.0;
  } else if (mouseX !== 0) {
    targetTension = constrain(mouseX / width, 0.0, 1.0);
  }

  // --- SMOOTH INTERPOLATION (lerp) ---
  // Eases currentTension toward targetTension at 8% per frame
  currentTension = lerp(currentTension, targetTension, 0.08);

  // --- SHADER UNIFORM SETUP ---
  // Activate the shader
  shader(probabilityShader);

  // Pass uniforms to the fragment shader
  probabilityShader.setUniform('u_resolution', [width, height]);
  probabilityShader.setUniform('u_time', millis() / 1000.0);
  probabilityShader.setUniform('u_tension', currentTension);

  // Draw a fullscreen quad (rectangle covering the WEBGL canvas coordinate space)
  rect(-width / 2, -height / 2, width, height);
}

function windowResized() {
  // Handle window resizing dynamically
  resizeCanvas(windowWidth, windowHeight);
}

function keyPressed() {
  // Press keys 0 through 9 to trigger absolute tension values immediately
  if (key >= '0' && key <= '9') {
    targetTension = float(key) / 9.0;
    console.log(`Target Tension set manually via key to: ${targetTension.toFixed(2)}`);
  }
}
