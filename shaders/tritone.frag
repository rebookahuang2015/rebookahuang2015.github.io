#ifdef GL_ES
precision mediump float;
#endif

// ============================================================
//  TRITONE GLITCH — B + F (interval 6 semitones)
//  A jagged, vibrating digital fissure splits the center line.
//  UV displacement via multi-scale fBM warps coordinates.
//  Chromatic aberration (R/G/B sampled at offset UVs).
//  Shifting cyan + magenta palette — structurally unlike all others.
//  Runtime: ~3 seconds.
// ============================================================

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_alpha;

// ---- Hashing & Noise ------------------------------------------
float hash(float n)  { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise1(float x) {
    float i = floor(x), f = fract(x);
    return mix(hash(i), hash(i+1.0), f*f*(3.0-2.0*f));
}
float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f);
    return mix(mix(hash2(i),          hash2(i+vec2(1,0)), u.x),
               mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)), u.x), u.y);
}
float fbm1(float x) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise1(x); x *= 2.13; a *= 0.5; }
    return v;
}
float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise2(p); p *= 2.07; a *= 0.5; }
    return v;
}

// ---- Fissure: inverse-distance glow to the displaced center column ---
float fissureGlow(vec2 uv, float t, float seed) {
    // Multi-scale noise displaces the fissure left/right
    float disp  = fbm1(uv.y * 3.5  + t * 3.2 + seed)        * 0.12;
    disp       += fbm1(uv.y * 11.0 + t * 7.4 + seed * 2.1)  * 0.05;
    disp       += fbm1(uv.y * 34.0 + t * 12.0 + seed * 4.9) * 0.022;
    float dist  = abs(uv.x - disp);
    return 0.0052 / max(dist, 0.0009);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / min(u_resolution.x, u_resolution.y);
    float t = u_time;

    float severity   = 1.0 - smoothstep(1.4, 2.6, t); // fissure strongest at start
    float effectFade = 1.0 - smoothstep(2.2, 3.0, t);

    // ================================================================
    // CHROMATIC ABERRATION — sample fissure at R, G, B UV offsets
    // This is the mandatory "prismatic" split required by the spec.
    // ================================================================
    float aberr = 0.010 * severity;

    float fR = fissureGlow(uv + vec2( aberr, 0.0), t, 0.00);
    float fG = fissureGlow(uv,                      t, 0.07);
    float fB = fissureGlow(uv + vec2(-aberr, 0.0), t, 0.14);

    // Compose: cyan on left (R=0, G+B strong), magenta on right (R+B strong)
    vec3 col = vec3(fR * 0.5 + fG * 0.05,
                    fG * 0.08,
                    fB * 0.75 + fG * 0.35);

    // Centremost glow — pure cyan overlay
    col += vec3(0.0, 1.0, 1.0) * fG * 0.55;
    col += vec3(1.0, 0.0, 1.0) * fR * 0.25; // magenta bloom

    // ================================================================
    // WIDE BACKGROUND GLOW HALO (behind the fissure)
    // ================================================================
    float haloDisp = fbm1(uv.y * 1.8 + t * 1.9) * 0.18;
    float haloDist = abs(uv.x - haloDisp);
    float halo     = 0.014 / max(haloDist, 0.006) * severity;
    col += vec3(0.0, 0.45, 0.8) * halo * 0.28;   // cyan side
    col += vec3(0.8, 0.0, 0.55) * halo * 0.28;   // magenta side

    // ================================================================
    // DIGITAL SCANLINE BLOCK GLITCHES
    // ================================================================
    float lineY     = floor(uv.y * 26.0) / 26.0;
    float blockNoise = noise2(vec2(lineY * 7.9, t * 9.5));
    float inBlock   = step(0.91, blockNoise);

    // Horizontal offset of each glitch block
    float blockOff  = (noise1(t * 13.0 + lineY * 4.2) - 0.5) * 0.32;
    float inXRange  = step(abs(uv.x - blockOff * 0.5), 0.42); // limit to center region

    float glitchAmt = inBlock * inXRange * severity;
    vec3  glitchCol = mix(vec3(0.0, 1.0, 1.0), vec3(1.0, 0.0, 1.0),
                          noise2(vec2(lineY, t)));
    col += glitchCol * glitchAmt * 0.55;

    // ================================================================
    // FLOATING DATA CORRUPTION PARTICLES (cyan ↔ magenta)
    // ================================================================
    for (int i = 0; i < 12; i++) {
        float fi  = float(i);
        float px  = (hash(fi * 0.317) - 0.5) * 0.22;
        float py  = fract(hash(fi * 0.573 + 1.0) + t * (0.08 + hash(fi*0.219)*0.10)) - 0.5;
        float pd  = length(uv - vec2(px, py));
        float pg  = 0.0030 / max(pd, 0.0013);
        float colT= fi / 12.0;
        col += mix(vec3(0.0,1.0,1.0), vec3(1.0,0.0,1.0), colT) * pg * severity;
    }

    gl_FragColor = vec4(col, u_alpha * effectFade * clamp(length(col) * 0.68, 0.0, 1.0));
}
