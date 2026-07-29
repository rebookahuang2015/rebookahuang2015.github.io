#ifdef GL_ES
precision mediump float;
#endif

// ============================================================
//  TIME FREEZE — Sus4 + Sus2
//  A crystallised frozen-time environment: hexagonal ice-crystal
//  lattice, polar radial spokes, concentric resonance rings, and
//  fBM frost caustics. Releases with reverse-gravity thaw scatter.
//  Palette: Icy cyan / cold white — structurally unlike all others.
//  Runtime: ~3.5 seconds.
// ============================================================

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_alpha;

#define PI 3.14159265358979

float hash(float n)  { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f*f*(3.0-2.0*f);
    return mix(mix(hash2(i),          hash2(i+vec2(1,0)), u.x),
               mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)), u.x), u.y);
}
float fbm2(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise2(p); p *= 2.09; a *= 0.5; }
    return v;
}

// Hexagonal tiling: returns distance to nearest hex centre
float hexDist(vec2 p, float scale) {
    p *= scale;
    vec2 r = vec2(1.0, 1.732051);
    vec2 h = r * 0.5;
    vec2 a = mod(p,       r) - h;
    vec2 b = mod(p - h,   r) - h;
    return sqrt(min(dot(a,a), dot(b,b)));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5*u_resolution) / min(u_resolution.x, u_resolution.y);
    float t = u_time;

    float frozenStr  = 1.0 - smoothstep(0.9, 2.2, t);   // ice is strongest at start
    float effectFade = 1.0 - smoothstep(2.5, 3.5, t);
    float fadeIn     = smoothstep(0.0, 0.28, t);

    vec3 col = vec3(0.0);

    // ================================================================
    // POLAR RADIAL SPOKES — fine lines radiating from centre
    // ================================================================
    float r   = length(uv);
    float ang = atan(uv.y, uv.x);

    float spokeCount = 20.0;
    // sin(angle * spokeCount/2) gives evenly-spaced peaks
    float spoke = pow(abs(sin(ang * spokeCount * 0.5)), 55.0);   // very thin
    float spokeGlow = spoke / max(r * 0.85 + 0.08, 0.05) * frozenStr;
    col += vec3(0.20, 0.75, 1.00) * spokeGlow * 0.45 * fadeIn;

    // ================================================================
    // CONCENTRIC RESONANCE RINGS
    // ================================================================
    float ringSpacing = 0.11;
    // Slightly animated rings (drift inward at thaw)
    float ringOffset  = t * 0.018;
    float ring        = abs(fract(r / ringSpacing + ringOffset) - 0.5) * 2.0;
    float ringGlow    = 0.06 / max(1.0 - ring + 0.01, 0.002) * frozenStr * fadeIn;
    col += vec3(0.15, 0.65, 1.00) * ringGlow * 0.30;

    // ================================================================
    // HEXAGONAL CRYSTAL LATTICE
    // ================================================================
    float hexVal  = hexDist(uv, 6.5);
    float hexLine = smoothstep(0.10, 0.06, hexVal);                  // face edges
    float hexGlow = 0.006 / max(hexVal, 0.006) * frozenStr * fadeIn; // edge glow
    col += vec3(0.35, 0.90, 1.00) * (hexLine * 0.30 + hexGlow * 0.55);

    // ================================================================
    // fBM FROST CAUSTIC TEXTURE
    // ================================================================
    float ice     = pow(fbm2(uv * 4.8 + vec2(t * 0.015, 0.0)), 2.8);
    col += vec3(0.45, 0.82, 1.00) * ice * 0.28 * frozenStr * fadeIn;

    float caustic = pow(fbm2(uv * 9.2 + vec2(0.0, t * 0.08)), 3.2);
    col += vec3(0.80, 0.96, 1.00) * caustic * 0.45 * frozenStr * fadeIn;

    // ================================================================
    // FROZEN VORTEX SPIRAL at centre (very slowly rotating)
    // ================================================================
    float spiralAng  = ang - r * 4.5 + t * 0.12;   // barely moves — "time stopped"
    float spiral     = abs(sin(spiralAng * 5.0)) * exp(-r * 3.2);
    col += vec3(0.55, 0.92, 1.00) * spiral * 0.55 * frozenStr * fadeIn;

    // Glowing icy eye at the very centre
    float centreGlw = 0.014 / max(r, 0.005) * exp(-r * 6.5) * frozenStr * fadeIn;
    col += vec3(0.82, 0.97, 1.00) * centreGlw * 3.5;

    // ================================================================
    // THAW RELEASE: reverse-gravity crystal shards scatter UPWARD
    // ================================================================
    float thawStart = 0.85, thawEnd = 2.4;
    float thaw = smoothstep(thawStart, thawEnd, t) * (1.0 - smoothstep(thawEnd, 3.5, t));
    if (thaw > 0.001) {
        for (int i = 0; i < 22; i++) {
            float fi  = float(i);
            float px  = (hash(fi * 0.317) - 0.5) * 0.9;
            float baseY = -0.4 + hash(fi * 0.573 + 1.0) * 0.3;
            // Fly upward as thaw progresses
            float py  = baseY - (t - thawStart) * (0.18 + hash(fi * 0.219) * 0.28);
            float pd  = length(uv - vec2(px, py));
            float pg  = 0.0022 / max(pd, 0.0010);
            col += vec3(0.60, 0.92, 1.00) * pg * thaw;
        }
    }

    gl_FragColor = vec4(col, u_alpha * effectFade * fadeIn * clamp(length(col) * 0.88, 0.0, 1.0));
}
