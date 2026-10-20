varying vec3 vDir;

void main() {
  vDir = position; // sphere is centred on the camera every frame
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // push to the far plane
}
