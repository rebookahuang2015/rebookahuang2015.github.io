#ifdef GL_ES
precision mediump float;
#endif

// ============================================================
//  YIN-YANG VORTEX — Same Root, Different Quality
//  Two orbiting orbs (P1 fiery orange, P2 icy blue) tracing
//  spiral vortex arms. Wisp trails fade behind each orb.
//  Runtime: continuous while chord held.
// ============================================================

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_alpha;

#define PI     3.14159265358979
#define TWO_PI 6.28318530718

float hash(float n)  { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f);
    return mix(mix(hash2(i),          hash2(i+vec2(1,0)), u.x),
               mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)), u.x), u.y);
}
float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise2(p); p *= 2.1; a *= 0.5; }
    return v;
}

void main() {
    vec2  uv  = (gl_FragCoord.xy - 0.5*u_resolution) / min(u_resolution.x, u_resolution.y);
    float t   = u_time;

    float fade = 1.0 - smoothstep(3.2, 4.0, t);
    float fadeIn = smoothstep(0.0, 0.5, t);

    // Orbital parameters
    float orbitR = 0.22;
    float speed  = t * 1.2;   // orbital angular velocity

    vec2 orb1 = vec2(cos(speed),        sin(speed))        * orbitR;  // orange
    vec2 orb2 = vec2(cos(speed + PI),   sin(speed + PI))   * orbitR;  // blue

    vec3 col = vec3(0.0);

    // ================================================================
    // VORTEX SPIRAL ARMS (two counter-rotating bands)
    // ================================================================
    float r   = length(uv);
    float ang = atan(uv.y, uv.x);

    // Orange arm — wraps with orbital phase
    float s1     = fract((ang - speed       - r * 3.8) / TWO_PI);
    float arm1   = smoothstep(0.18, 0.0, abs(s1 - 0.5) * 2.0) * exp(-r * 1.9);
    col += vec3(1.00, 0.45, 0.05) * arm1 * 1.3 * fadeIn * fade;

    // Blue arm — opposite phase
    float s2     = fract((ang - speed - PI  - r * 3.8) / TWO_PI);
    float arm2   = smoothstep(0.18, 0.0, abs(s2 - 0.5) * 2.0) * exp(-r * 1.9);
    col += vec3(0.05, 0.50, 1.00) * arm2 * 1.3 * fadeIn * fade;

    // ================================================================
    // ORB GLOWS — inverse-distance + Gaussian falloff
    // ================================================================
    float d1 = length(uv - orb1);
    float d2 = length(uv - orb2);

    // Orange orb
    col += vec3(1.00, 0.55, 0.00) * (0.028 / max(d1, 0.006)) * exp(-d1 * 4.2) * 3.0 * fade;
    col += vec3(1.00, 0.90, 0.30) * (0.006 / max(d1, 0.003)) * fade;   // hot bright centre

    // Blue orb
    col += vec3(0.05, 0.48, 1.00) * (0.028 / max(d2, 0.006)) * exp(-d2 * 4.2) * 3.0 * fade;
    col += vec3(0.55, 0.92, 1.00) * (0.006 / max(d2, 0.003)) * fade;   // icy bright centre

    // ================================================================
    // WISP TRAILS — 20 past orb positions for each
    // ================================================================
    for (int k = 0; k < 20; k++) {
        float fk    = float(k) / 20.0;
        float pastS = speed - fk * 1.0;            // how far back in time

        // Orange trail
        vec2 past1  = vec2(cos(pastS), sin(pastS)) * orbitR;
        float pd1   = length(uv - past1);
        float wg1   = 0.0038 / max(pd1, 0.0015) * (1.0 - fk) * fade;
        col += vec3(1.0, 0.38, 0.0) * wg1;

        // Blue trail
        vec2 past2  = vec2(cos(pastS + PI), sin(pastS + PI)) * orbitR;
        float pd2   = length(uv - past2);
        float wg2   = 0.0038 / max(pd2, 0.0015) * (1.0 - fk) * fade;
        col += vec3(0.0, 0.38, 1.0) * wg2;
    }

    // ================================================================
    // CENTRAL COLLISION GLOW — brightens when orbs are near
    // ================================================================
    float centreDist = length(uv);
    float centreGlw  = 0.016 / max(centreDist, 0.005) * exp(-centreDist * 9.0) * fade;
    // Pulsing at twice orbital speed (beat frequency)
    float beat = 0.7 + 0.3 * abs(sin(speed * 2.0));
    col += vec3(1.0, 1.0, 1.0) * centreGlw * 2.5 * beat * fadeIn;

    // Outer ambient swirl (fBM for organic turbulence)
    float swirl = fbm2(uv * 2.2 + vec2(t * 0.08, -t * 0.06));
    col += mix(vec3(1.0, 0.35, 0.0), vec3(0.0, 0.35, 1.0),
               smoothstep(-0.1, 0.1, uv.x)) * swirl * 0.15 * fade;

    gl_FragColor = vec4(col, u_alpha * fadeIn * fade * clamp(length(col) * 0.68, 0.0, 1.0));
}
