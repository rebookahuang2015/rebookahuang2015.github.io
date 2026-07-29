#ifdef GL_ES
precision mediump float;
#endif

// ============================================================
//  SOLAR ECLIPSE — Major + Maj7 (Sun ☀️ + Crescent Moon 🌙)
//  Black moon disc covers glowing sun. Corona spikes, diamond ring,
//  starfield appears as background dims. Chromatic lunar limb.
//  Runtime: ~4 seconds.
// ============================================================

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_alpha;

#define PI     3.14159265358979
#define TWO_PI 6.28318530718

float hash(float n)  { return fract(sin(n) * 43758.5453); }
float noise1(float x) {
    float i = floor(x), f = fract(x);
    return mix(hash(i), hash(i+1.0), f*f*(3.0-2.0*f));
}
// fBM 1D — corona spike modulation
float fbm1(float x) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise1(x); x *= 2.1; a *= 0.5; }
    return v;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / min(u_resolution.x, u_resolution.y);
    float t = u_time;

    float fadeIn  = smoothstep(0.0, 0.5, t);
    float fadeOut = 1.0 - smoothstep(3.3, 4.0, t);
    float fade    = fadeIn * fadeOut;

    vec2  moonPos = vec2(0.0, 0.18);   // eclipse positioned upper-centre
    float moonR   = 0.115;
    float moonD   = length(uv - moonPos);

    vec3 col = vec3(0.0);

    // ================================================================
    // DEEP-SPACE BACKGROUND DIMMING
    // ================================================================
    col += vec3(0.010, 0.008, 0.025) * fade * 4.0; // dark ambient tint

    // ================================================================
    // OUTER DIFFUSE CORONA HALO
    // ================================================================
    float coronaDist = moonD - moonR;
    float outerHalo  = pow(0.08 / max(coronaDist + 0.05, 0.01), 1.4) * fade;
    outerHalo = min(outerHalo, 1.5);
    col += vec3(0.22, 0.16, 0.04) * outerHalo * 0.6;

    // ================================================================
    // INNER CORONA — inverse-distance ring glow
    // ================================================================
    float coronaGlow = 0.025 / max(coronaDist, 0.004) * exp(-coronaDist * 3.5) * fade;
    col += vec3(0.85, 0.72, 0.30) * coronaGlow * 3.5;
    col += vec3(1.00, 0.92, 0.55) * coronaGlow * 1.8;

    // ================================================================
    // 18 CORONA SPIKE RAYS (angle-based SDF)
    // ================================================================
    float ang = atan(uv.y - moonPos.y, uv.x - moonPos.x);
    for (int i = 0; i < 18; i++) {
        float fi       = float(i) / 18.0;
        float rayAng   = fi * TWO_PI;
        float angToDiff= abs(mod(ang - rayAng + PI, TWO_PI) - PI);
        float rayW     = 0.035 + fbm1(fi * 7.3 + t * 0.55) * 0.09;
        float rayShape = smoothstep(rayW, 0.0, angToDiff);
        float rayLen   = 0.065 + fbm1(fi * 3.7 + t * 0.35) * 0.13;
        float rayMask  = smoothstep(moonR + rayLen, moonR, coronaDist);
        // Each ray is tinted slightly from gold → white
        float rHue     = fi * 0.08;
        vec3  rCol     = mix(vec3(0.9, 0.75, 0.2), vec3(1.0, 0.97, 0.75), fi);
        col += rCol * rayShape * rayMask * coronaDist * fade * 1.2;
    }

    // ================================================================
    // DIAMOND RING EFFECT — one bright arc-point rotating slowly
    // ================================================================
    float diamondAng = PI * 0.72 + t * 0.28;
    vec2  diamondPos = moonPos + vec2(cos(diamondAng), sin(diamondAng)) * moonR;
    float diamondD   = length(uv - diamondPos);
    float diamond    = 0.007 / max(diamondD, 0.002) * fade;
    col += vec3(1.0, 0.98, 0.88) * diamond * 5.0;

    // ================================================================
    // CHROMATIC LIMB FRINGE at moon edge (blue-shift)
    // ================================================================
    float fringeDist = abs(moonD - moonR);
    float fringe     = smoothstep(0.007, 0.0, fringeDist) * fade;
    col += vec3(0.0, 0.45, 1.0) * fringe * 0.7;

    // ================================================================
    // STARFIELD — becomes visible as background dims
    // ================================================================
    float starFade = smoothstep(0.18, 1.0, t) * fadeOut;
    for (int s = 0; s < 24; s++) {
        float fs   = float(s);
        vec2 sPos  = vec2(hash(fs*0.317) - 0.5, hash(fs*0.573+1.0) - 0.5) * 1.7;
        float sD   = length(uv - sPos);
        float sSz  = 0.0018 + hash(fs*0.419) * 0.0028;
        float sG   = smoothstep(sSz, 0.0, sD) * (0.55 + 0.45*sin(t*2.2 + fs*1.9));
        col += vec3(0.85, 0.90, 1.00) * sG * starFade;
    }

    // ================================================================
    // BLACK MOON DISC — mask everything inside moon radius
    // ================================================================
    float moonEdge = smoothstep(moonR + 0.003, moonR, moonD);
    col = col * (1.0 - moonEdge) + vec3(0.004, 0.003, 0.010) * moonEdge;

    gl_FragColor = vec4(col, u_alpha * fade * clamp(length(col)*0.55 + moonEdge*0.5, 0.0, 1.0));
}
