#ifdef GL_ES
precision mediump float;
#endif

// ============================================================
//  PERFECT FIFTH FIREWORK — Chromatic multi-wave ray burst
//  Triggered when players' root notes are a perfect fifth apart.
//  Palette: Full chromatic spectrum (hue-cycling) + white bloom.
//  Runtime: ~3 seconds. u_time = seconds since trigger.
// ============================================================

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_alpha;

#define PI      3.14159265358979
#define TWO_PI  6.28318530718

// ---- Hashing & Noise ------------------------------------------
float hash(float n)  { return fract(sin(n) * 43758.5453123); }
float hash2(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float smoothNoise1(float x) {
    float i = floor(x), f = fract(x);
    return mix(hash(i), hash(i+1.0), f*f*(3.0-2.0*f));
}

// 5-octave fBM over 1D — drives organic ray-angle jitter
float fbm1(float x) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * smoothNoise1(x); x *= 2.09; a *= 0.5; }
    return v;
}

// ---- Color ----------------------------------------------------
vec3 hsl2rgb(float h, float s, float l) {
    h = fract(h);
    float c = (1.0 - abs(2.0*l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h*6.0, 2.0) - 1.0));
    float m = l - c*0.5;
    if (h < 1.0/6.0) return vec3(c,x,0) + m;
    if (h < 2.0/6.0) return vec3(x,c,0) + m;
    if (h < 3.0/6.0) return vec3(0,c,x) + m;
    if (h < 4.0/6.0) return vec3(0,x,c) + m;
    if (h < 5.0/6.0) return vec3(x,0,c) + m;
    return vec3(c,0,x) + m;
}

// ---- Geometry -------------------------------------------------
// Inverse-distance glow along a ray segment from origin to 'tip'
float rayGlow(vec2 uv, float angle, float len) {
    vec2 tip = vec2(cos(angle), sin(angle)) * len;
    vec2 pa = uv, ba = tip;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
    float dist = length(pa - ba * h);
    return 0.0022 / max(dist, 0.0007);
}

void main() {
    vec2 uv  = (gl_FragCoord.xy - 0.5*u_resolution) / min(u_resolution.x, u_resolution.y);
    float t  = u_time;

    // Global fade-out envelope
    float envFade = 1.0 - smoothstep(2.0, 3.0, t);
    vec3 col = vec3(0.0);

    // ================================================================
    // WAVE 1 — 44 primary long rays, full-spectrum hue cycling
    // ================================================================
    for (int i = 0; i < 44; i++) {
        float fi      = float(i) / 44.0;
        float angle   = fi * TWO_PI + fbm1(float(i) * 0.71) * 1.1;
        float speed   = 0.28 + hash(float(i) * 0.173) * 0.22;
        float maxLen  = 0.32 + hash(float(i) * 0.239 + 2.0) * 0.42;
        float progress= min(t * speed * 2.8, maxLen);
        float fade    = pow(1.0 - progress/maxLen, 0.55);

        float glow    = rayGlow(uv, angle, progress);
        vec3  rayCol  = hsl2rgb(fi + t*0.04, 1.0, 0.62);
        col += rayCol * glow * fade * envFade;

        // Bright point at ray tip
        vec2 tip  = vec2(cos(angle), sin(angle)) * progress;
        float tipD= length(uv - tip);
        col += vec3(1.0, 0.97, 0.88) * (0.0014 / max(tipD, 0.0005)) * fade * envFade;
    }

    // ================================================================
    // WAVE 2 — 26 medium sparkle trails (delayed 0.3 s)
    // ================================================================
    float t2 = max(t - 0.30, 0.0);
    for (int j = 0; j < 26; j++) {
        float fj    = float(j) / 26.0;
        float angle2= fj * TWO_PI + 0.073 + fbm1(float(j)*0.53 + 9.0) * 0.9;
        float maxL2 = 0.38 + hash(float(j)*0.457 + 5.0) * 0.28;
        float prog2 = min(t2 * 0.62, maxL2);

        float glow2 = rayGlow(uv, angle2, prog2);
        col += hsl2rgb(fj*0.85 + 0.1 + t*0.06, 1.0, 0.68) * glow2 * envFade;
    }

    // ================================================================
    // WAVE 3 — 18 short fast inner sparks (delayed 0.65 s)
    // ================================================================
    float t3 = max(t - 0.65, 0.0);
    for (int k = 0; k < 18; k++) {
        float fk    = float(k) / 18.0;
        float angle3= fk * TWO_PI + fbm1(float(k)*0.83 + 17.0) * 1.3;
        float maxL3 = 0.14 + hash(float(k)*0.619 + 8.0) * 0.18;
        float prog3 = min(t3 * 1.4, maxL3);

        float glow3 = rayGlow(uv, angle3, prog3);
        col += hsl2rgb(fk*0.6 + 0.55 + t*0.08, 1.0, 0.75) * glow3 * envFade;
    }

    // ================================================================
    // CENTRAL WHITE-HOT BLOOM
    // ================================================================
    float r = length(uv);

    // Instantaneous flash at t=0
    float flash  = exp(-t * 4.2) * 0.09 / max(r, 0.007) * exp(-r * 5.0);
    col += vec3(1.0, 0.99, 0.95) * flash * 7.0;

    // Persistent pulsing core (inverse-distance + Gaussian radial falloff)
    float pulse  = 1.0 + 0.4 * sin(t * 14.0 + 0.5);
    float core   = 0.024 / max(r, 0.005) * exp(-r * 9.5) * pulse * envFade;
    col += vec3(1.0, 0.96, 0.82) * core * 4.0;

    // Wide chromatic ambient halo (only at start)
    float haloFd = smoothstep(0.5, 0.0, t) * envFade;
    col += hsl2rgb(fract(t*0.07), 0.9, 0.5) * (0.006 / max(r-0.03, 0.003)) * haloFd;

    // Output — alpha derived from total luminance for natural shape
    gl_FragColor = vec4(col, u_alpha * clamp(length(col) * 0.55, 0.0, 1.0));
}
