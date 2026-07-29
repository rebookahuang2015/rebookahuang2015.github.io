#ifdef GL_ES
precision mediump float;
#endif

// ============================================================
//  SHATTER — Major Second clash (e.g. C + D, interval 2 semitones)
//  8 crystal shard triangles (IQ triangle SDF) expand from a
//  central impact point with rotation. Crackling radial lines
//  and a central impact flash complete the effect.
//  Palette: P1 neon-green ↔ P2 hot-pink shards.
//  Runtime: ~2.5 seconds.
// ============================================================

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_alpha;

#define PI     3.14159265358979
#define TWO_PI 6.28318530718

float hash(float n) { return fract(sin(n) * 43758.5453); }

// IQ's exact triangle SDF
float sdTriangle(vec2 p, vec2 a, vec2 b, vec2 c) {
    vec2 e0 = b - a, e1 = c - b, e2 = a - c;
    vec2 v0 = p - a, v1 = p - b, v2 = p - c;
    vec2 pq0 = v0 - e0 * clamp(dot(v0,e0)/dot(e0,e0), 0.0, 1.0);
    vec2 pq1 = v1 - e1 * clamp(dot(v1,e1)/dot(e1,e1), 0.0, 1.0);
    vec2 pq2 = v2 - e2 * clamp(dot(v2,e2)/dot(e2,e2), 0.0, 1.0);
    float s  = sign(e0.x*e2.y - e0.y*e2.x);
    vec2 d   = min(min(vec2(dot(pq0,pq0), s*(v0.x*e0.y - v0.y*e0.x)),
                       vec2(dot(pq1,pq1), s*(v1.x*e1.y - v1.y*e1.x))),
                       vec2(dot(pq2,pq2), s*(v2.x*e2.y - v2.y*e2.x)));
    return -sqrt(d.x) * sign(d.y);
}

// Segment glow helper
float segGlow(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
    float d = length(pa - ba * h);
    return 0.0014 / max(d, 0.0005);
}

// 2×2 rotation matrix
mat2 rot2(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }

void main() {
    vec2  uv = (gl_FragCoord.xy - 0.5*u_resolution) / min(u_resolution.x, u_resolution.y);
    float t  = u_time;

    float effectFade = 1.0 - smoothstep(1.5, 2.5, t);
    float fadeIn     = smoothstep(0.0, 0.12, t);

    vec3 col = vec3(0.0);

    // ================================================================
    // 8 CRYSTAL SHARDS — triangle SDF, flying outward + rotating
    // ================================================================
    for (int i = 0; i < 8; i++) {
        float fi = float(i) / 8.0;

        // Launch angle (evenly spaced + small per-shard jitter)
        float launchAng = fi * TWO_PI + hash(float(i) * 0.371) * 0.45;
        float speed     = 0.16 + hash(float(i) * 0.519) * 0.18;
        float progress  = min(t * speed * 3.2, 1.0);

        // Outward travel distance
        float travelR = progress * (0.22 + hash(float(i)*0.253) * 0.18);
        vec2 shardCtr = vec2(cos(launchAng), sin(launchAng)) * travelR;

        // Spin over time
        float spinRate = (hash(float(i)*0.617) - 0.5) * 4.0;
        float rot      = hash(float(i)*0.283) * TWO_PI + t * spinRate;

        // Transform pixel into shard-local space
        vec2 localUV = rot2(-rot) * (uv - shardCtr);

        // Triangle vertices (asymmetric for natural look)
        float sz  = 0.048 + hash(float(i)*0.739) * 0.062;
        float asp = 0.28  + hash(float(i)*0.481) * 0.42;
        vec2 va   = vec2(0.0,           -sz * 2.1);
        vec2 vb   = vec2(-sz * asp,      sz);
        vec2 vc   = vec2( sz * (asp+0.15), sz);

        float d = sdTriangle(localUV, va, vb, vc);

        // Translucent interior fill (fades as shard moves)
        float fill = smoothstep(0.0, -0.008, d) * (1.0 - progress * 0.65);

        // Sharp edge glow — inverse distance (mandatory bloom per spec)
        float edge = 0.0030 / max(abs(d), 0.0007);

        // Colour: alternate green / pink per shard, softly
        float cMix   = step(0.5, fract(float(i) * 0.5));
        vec3 shardCol= mix(vec3(0.05, 1.0, 0.45),   // P1 neon green
                           vec3(1.00, 0.18, 0.58),   // P2 hot pink
                           cMix);

        float shardAlpha = effectFade * fadeIn * (1.0 - progress * 0.5);
        col += shardCol * (edge * 1.8 + fill * 0.4) * shardAlpha;

        // Bright tip spark at the sharp apex
        vec2 tipWorld = shardCtr + rot2(rot) * va;
        float tipD    = length(uv - tipWorld);
        col += vec3(1.0) * (0.0016 / max(tipD, 0.0007)) * shardAlpha;
    }

    // ================================================================
    // 14 CRACKLING LINES from centre (radial fracture pattern)
    // ================================================================
    for (int j = 0; j < 14; j++) {
        float fj      = float(j) / 14.0;
        float crackA  = fj * TWO_PI + hash(float(j)*0.451) * 0.65;
        float crackL  = (0.09 + hash(float(j)*0.283)*0.14) * min(t * 3.8, 1.0);
        vec2  crackTip= vec2(cos(crackA), sin(crackA)) * crackL;
        float cg      = segGlow(uv, vec2(0.0), crackTip) * effectFade * fadeIn;
        col += mix(vec3(0.15, 1.0, 0.55), vec3(1.0, 0.25, 0.65), fj) * cg;
    }

    // ================================================================
    // CENTRAL IMPACT FLASH + BLOOM
    // ================================================================
    float r     = length(uv);
    float flash = exp(-t * 6.5) * 0.045 / max(r, 0.006) * exp(-r * 4.5);
    col += vec3(1.0, 0.97, 0.88) * flash * 6.0;

    // Residual glow ring at impact site
    float impactRing = abs(r - 0.05);
    float ringGlow   = 0.004 / max(impactRing, 0.002) * exp(-t * 3.0) * fadeIn;
    col += vec3(1.0, 0.85, 0.5) * ringGlow * 2.5;

    gl_FragColor = vec4(col, u_alpha * effectFade * fadeIn * clamp(length(col) * 0.72, 0.0, 1.0));
}
