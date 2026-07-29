attribute vec3 aPosition;

void main() {
  // Pass the vertex position straight through for fullscreen quad rendering
  gl_Position = vec4(aPosition, 1.0);
}
