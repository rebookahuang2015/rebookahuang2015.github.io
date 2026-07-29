#ifdef GL_ES
precision mediump float;
#endif

// ============================================================
//  BIOLUMINESCENT STORM — Dom7 + Min7
//  Jagged fractal lightning bolt (fractured line SDF + displaced UV)
//  striking a bioluminescent ocean pool (fBM ripples + interference).
//  Palette: Electric blue #00e1ff, teal #00ffd2, deep ocean dark.
//  Runtime: ~4 seconds.
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

// 6-octave fBM 2D — drives organic pool turbulence
float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * noise2(p); p *= 2.17; a *= 0.5; }
    return v;
}

// Fractal lightning: displaces the centerline (x=xOff) using
// multi-scale 1D noise, returns inverse-distance glow at that bolt.
float lightningGlow(vec2 uv, float t, float xOff, float amp) {
    float disp = 0.0;
    disp += noise1(uv.y * 3.0  + t * 5.0)  * 0.09 * amp;
    disp += noise1(uv.y * 9.0  + t * 9.0)  * 0.04 * amp;
    disp += noise1(uv.y * 26.0 + t * 13.0) * 0.018 * amp;
    disp += noise1(uv.y * 70.0 + t * 18.0) * 0.008 * amp;
    float dist = abs(uv.x - xOff - disp);
    return 0.0045 / max(dist, 0.0009);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / min(u_resolution.x, u_resolution.y);
    float t = u_time;

    float boltFade   = 1.0 - smoothstep(1.0, 2.0, t);   // bolt fades after ~1s
    float poolFade   = smoothstep(0.25, 1.2, t);          // pool rises in after 0.25s
    float effectFade = 1.0 - smoothstep(3.2, 4.0, t);

    vec3 col = vec3(0.0);

    // ================================================================
    // LIGHTNING BOLTS — top half of screen only
    // ================================================================
    float boltMask = step(uv.y, 0.52);   // only above screen midpoint

    // Primary centre bolt — bright electric blue
    float bolt = lightningGlow(uv, t, 0.0, 1.0) * boltMask * boltFade;
    col += vec3(0.55, 0.92, 1.0) * bolt * 3.5;

    // Secondary bolt — left branch (lower reach)
    float branchMaskL = step(uv.y, 0.12) * step(-0.18, uv.y);
    float boltL = lightningGlow(uv, t*1.4 + 5.7, -0.07, 0.75) * branchMaskL * boltFade;
    col += vec3(0.35, 0.80, 1.0) * boltL * 2.0;

    // Secondary bolt — right branch
    float boltR = lightningGlow(uv, t*1.8 + 3.2, 0.08, 0.65) * branchMaskL * boltFade;
    col += vec3(0.35, 0.80, 1.0) * boltR * 2.0;

    // Wide diffuse halo around primary bolt
    float haloDisp  = noise1(uv.y * 1.8 + t * 2.5) * 0.12;
    float haloDist  = abs(uv.x - haloDisp);
    float boltHalo  = 0.018 / max(haloDist, 0.007) * boltMask * boltFade;
    col += vec3(0.0, 0.55, 1.0) * boltHalo * 0.30;

    // ================================================================
    // BIOLUMINESCENT POOL — bottom portion
    // ================================================================
    float poolY    = -0.32;
    float poolMask = smoothstep(poolY + 0.04, poolY - 0.04, uv.y);

    // fBM turbulence forms the organic liquid surface
    float liquid = fbm2(uv * vec2(4.5, 2.5) + vec2(t*0.08, t*0.12));

    // Interference ripples from three concentric sources (impact point)
    float rip1 = sin((length(uv - vec2( 0.00, poolY-0.10)) - t*0.85) * 22.0) * 0.5 + 0.5;
    float rip2 = sin((length(uv - vec2( 0.06, poolY-0.13)) - t*0.60) * 28.0) * 0.5 + 0.5;
    float rip3 = sin((length(uv - vec2(-0.04, poolY-0.07)) - t*1.00) * 18.0) * 0.5 + 0.5;
    float ripples = rip1 * rip2 * rip3;

    // Impact bright spot (inverse-distance from bolt strike)
    float impactD   = length(uv - vec2(0.0, poolY));
    float impactGlw = 0.035 / max(impactD, 0.012) * exp(-impactD * 5.0);

    vec3 deepBlue = vec3(0.00, 0.30, 0.55);
    vec3 bioTeal  = vec3(0.00, 1.00, 0.75);
    vec3 poolColor = mix(deepBlue, bioTeal, ripples * liquid);

    col += (poolColor * 1.6 + vec3(0.0, 0.75, 1.0) * impactGlw) * poolMask * poolFade * effectFade;

    // Bioluminescent particles floating up from pool
    for (int p = 0; p < 14; p++) {
        float fp  = float(p) / 14.0;
        float px  = sin(fp * 37.4 + t * 0.45) * 0.28;
        float py  = poolY + fract(fp * 0.73 + t * (0.12 + fp*0.08)) * 0.55;
        float pd  = length(uv - vec2(px, py));
        float ptG = 0.0025 / max(pd, 0.0009);
        col += vec3(0.0, 1.0, 0.78) * ptG * poolFade * effectFade;
    }

    // ================================================================
    // SPLASH DROPLETS at impact (t ≈ 0.1 → 1.8 s)
    // ================================================================
    float splashFade = smoothstep(0.08, 0.5, t) * smoothstep(1.9, 1.0, t);
    for (int s = 0; s < 18; s++) {
        float fs  = float(s) / 18.0;
        float sa  = fs * 6.28318;
        float sr  = (0.08 + hash(float(s)*0.379)*0.14) * min(t*1.6, 1.0);
        float sx  = cos(sa) * sr;
        float sy  = poolY + sin(sa) * sr * 0.35; // elliptical arc
        float sd  = length(uv - vec2(sx, sy));
        float sg  = 0.0020 / max(sd, 0.0008);
        col += vec3(0.0, 0.92, 1.0) * sg * splashFade;
    }

    gl_FragColor = vec4(col, u_alpha * clamp(length(col) * 0.58, 0.0, 1.0));
}
