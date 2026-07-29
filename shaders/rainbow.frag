#ifdef GL_ES
precision mediump float;
#endif

// ============================================================
//  MAJOR + MINOR RAINBOW — Neon 7-band arc + fBM rain mist
//  Triggered when P1 plays Major and P2 plays Minor (or vice-versa).
//  Palette: True rainbow ROY-G-BIV + blue misty rain at base.
//  Runtime: ~4 seconds. u_time = seconds since trigger.
// ============================================================

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_alpha;

#define PI 3.14159265358979

// ---- Hashing & Noise ------------------------------------------
float hash(float n)  { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash2(i),          hash2(i+vec2(1,0)), u.x),
               mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)), u.x), u.y);
}

// 5-octave fBM 2D — drives rain mist turbulence
float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise2(p); p *= 2.13; a *= 0.5; }
    return v;
}

// True ROY-G-BIV rainbow colours
vec3 rainbowColor(int band) {
    if (band == 0) return vec3(1.00, 0.10, 0.02); // Red
    if (band == 1) return vec3(1.00, 0.52, 0.02); // Orange
    if (band == 2) return vec3(1.00, 0.96, 0.02); // Yellow
    if (band == 3) return vec3(0.10, 1.00, 0.05); // Green
    if (band == 4) return vec3(0.05, 0.35, 1.00); // Blue
    if (band == 5) return vec3(0.35, 0.05, 0.90); // Indigo
    return          vec3(0.72, 0.05, 1.00);        // Violet
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / min(u_resolution.x, u_resolution.y);
    float t = u_time;

    // Lifecycle envelope
    float fadeIn  = smoothstep(0.0, 0.6, t);
    float fadeOut = 1.0 - smoothstep(3.2, 4.0, t);
    float fade    = fadeIn * fadeOut;

    vec3  col       = vec3(0.0);
    vec2  arcCenter = vec2(0.0, -0.72); // arc curvature origin below screen

    // ================================================================
    // 7 RAINBOW BAND ARCS — circular arc SDF via |dist - radius|
    // ================================================================
    for (int i = 0; i < 7; i++) {
        float fi     = float(i);
        float radius = 0.80 + fi * 0.028;  // bands from inner to outer

        float dist   = abs(length(uv - arcCenter) - radius);

        // Only the upper half (where arc is visible)
        float onArc  = step(arcCenter.y, uv.y);

        // Core band (sharp)
        float band   = smoothstep(0.010, 0.0, dist) * onArc;

        // Inverse-distance glow — mandatory post-process bloom per spec
        float glow   = 0.004 / max(dist, 0.0009) * onArc;

        // Temporal shimmer (each band shimmers at a distinct frequency)
        float shimmer = 1.0 + 0.18 * sin(t*4.5 + fi*2.1 + uv.x*6.0);

        vec3  c = rainbowColor(i);
        col += c * (band * 3.5 + glow * 0.7) * shimmer;
    }

    // ================================================================
    // PRISMATIC EDGE SUPER-BLOOM — extra white glow at arc centroid
    // ================================================================
    float midRadius = 0.91;
    float midDist   = abs(length(uv - arcCenter) - midRadius);
    float onArc2    = step(arcCenter.y, uv.y);
    float prism     = pow(0.008 / max(midDist, 0.001), 1.25) * onArc2;
    col += vec3(1.0) * prism * 0.4;

    // ================================================================
    // fBM RAIN MIST — atmospheric scatter below arc base
    // ================================================================
    float mistY    = -0.12;
    float mistMask = smoothstep(0.18, -0.38, uv.y - mistY);
    vec2  mistUV   = vec2(uv.x*3.8 + t*0.06, uv.y*4.2 + t*0.28);
    float mist     = pow(fbm2(mistUV), 2.1) * mistMask;
    col += vec3(0.22, 0.50, 1.0) * mist * 0.5;

    // Vertical rain streaks (high-freq fBM-displaced columns)
    vec2  rainUV  = vec2(uv.x * 20.0 + fbm2(vec2(uv.x*4.0, t*0.4))*0.4, uv.y);
    float rainX   = fract(rainUV.x);
    float streak  = smoothstep(0.04, 0.0, rainX) * smoothstep(-0.45, 0.05, uv.y)
                  * smoothstep(0.05, -0.48, uv.y);
    col += vec3(0.38, 0.68, 1.0) * streak * 0.22 * fade;

    // ================================================================
    // GLOWING SHIMMER DOTS along the arc perimeter
    // ================================================================
    for (int s = 0; s < 16; s++) {
        float fs  = float(s) / 15.0;
        float ang = PI + fs * PI;          // spans π → 2π (upper semicircle)
        float ar  = 0.90;
        vec2  pos = arcCenter + vec2(cos(ang)*ar, sin(ang)*ar);
        float d   = length(uv - pos);
        float sz  = 0.0030 + 0.0020 * sin(t*6.5 + float(s)*1.9);
        float pt  = smoothstep(sz, 0.0, d) * (1.5 + 0.5*sin(t*10.0 + float(s)));
        col += vec3(1.0) * pt;
    }

    gl_FragColor = vec4(col, u_alpha * fade * clamp(length(col)*0.72, 0.0, 1.0));
}
