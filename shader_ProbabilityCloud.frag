#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_tension;

// Hash function for pseudo-random noise generation
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 3D Value Noise for smooth organic structures
float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    
    return mix(mix(mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
                   mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
                   mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

// 3D Fractional Brownian Motion (fBM) for cloud density / fractals
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p * frequency);
        p += vec3(1.0, 10.0, 100.0) * 0.12;
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// Inigo Quilez exact Octahedron Signed Distance Field (SDF)
float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    float m = p.x + p.y + p.z - s;
    vec3 q;
         if (3.0 * p.x < p.x + p.y + p.z) q = p.xyz;
    else if (3.0 * p.y < p.x + p.y + p.z) q = p.yzx;
    else if (3.0 * p.z < p.x + p.y + p.z) q = p.zxy;
    else return m * 0.57735027;
      
    float k = clamp(0.5 * (q.z - q.y + s), 0.0, s); 
    return length(vec3(q.x, q.y - s + k, q.z - k)); 
}

// Composite map function that defines space and noise transitions
float map(vec3 p, float tension) {
    // 1. Domain rotation: spins faster as tension (entropy) increases
    float speed = mix(0.4, 2.8, tension);
    float angle = u_time * speed;
    float s = sin(angle);
    float c = cos(angle);
    p.xz *= mat2(c, -s, s, c);
    p.xy *= mat2(cos(angle * 0.6), -sin(angle * 0.6), sin(angle * 0.6), cos(angle * 0.6));
    
    // 2. Crystalline breathing pulse
    float breathing = 1.0 + 0.08 * sin(u_time * 2.2);
    
    // 3. Domain warping using fBM - amplitude scales with tension
    vec3 warpOffset = vec3(
        fbm(p + vec3(0.0, 0.0, u_time * 0.7)),
        fbm(p + vec3(u_time * 0.6, 2.0, 0.0)),
        fbm(p + vec3(1.0, u_time * 0.5, 3.0))
    );
    vec3 warpedP = p + warpOffset * tension * 1.6;
    
    // 4. Base octahedron distance evaluation
    float baseOct = sdOctahedron(warpedP, 0.82 * breathing);
    
    // 5. High-frequency fracturing noise
    float fracNoise = fbm(p * 5.2 + vec3(0.0, u_time * 1.8, 0.0)) - 0.44;
    
    // Smoothly mix between crisp stable octahedron and chaotic dispersing cloud
    return mix(baseOct, baseOct + fracNoise * 0.75, tension);
}

void main() {
    // Center coordinates (-1 to 1) and correct for aspect ratio
    vec2 uv = (gl_FragCoord.xy - u_resolution * 0.5) / min(u_resolution.x, u_resolution.y) * 2.0;
    
    // Raymarching camera
    vec3 ro = vec3(0.0, 0.0, -3.2); // ray origin (positioned backward)
    vec3 rd = normalize(vec3(uv, 1.3)); // ray direction
    
    float t = 0.0;
    float max_dist = 6.0;
    
    // Independent color channel glow accumulators
    float glowR = 0.0;
    float glowG = 0.0;
    float glowB = 0.0;
    
    for (int i = 0; i < 75; i++) {
        vec3 p = ro + rd * t;
        
        // Chromatic split offset: offsets the coordinates for each channel based on tension
        float offset = u_tension * 0.08;
        
        float dR = map(p + vec3(offset, 0.0, 0.0), u_tension);
        float dG = map(p, u_tension);
        float dB = map(p - vec3(offset, 0.0, 0.0), u_tension);
        
        // Accumulate volumetric inverse distance glow
        glowR += 0.0035 / (abs(dR) + 0.015);
        glowG += 0.0035 / (abs(dG) + 0.015);
        glowB += 0.0035 / (abs(dB) + 0.015);
        
        float d = min(min(dR, dG), dB);
        
        // Crisp crystal surface hit: only breaks the ray when tension is low (crystalline state)
        if (d < 0.001 && u_tension < 0.15) {
            break;
        }
        
        t += max(d * 0.48, 0.035);
        if (t > max_dist) break;
    }
    
    // State 1 base color: warm golden-white
    vec3 stableColor = vec3(1.0, 0.90, 0.65);
    
    // Interpolate channels independently to State 2 (chaos deep blue, magenta, red sparks)
    vec3 rColor = mix(stableColor, vec3(1.0, 0.08, 0.18), u_tension);
    vec3 gColor = mix(stableColor, vec3(0.85, 0.02, 0.95), u_tension);
    vec3 bColor = mix(stableColor, vec3(0.04, 0.28, 1.0), u_tension);
    
    vec3 color = vec3(0.0);
    color.r = glowR * rColor.r;
    color.g = glowG * gColor.g;
    color.b = glowB * bColor.b;
    
    // Jagged red sparks (glitching high frequency flicker in red channel)
    float flicker = noise(vec3(u_time * 26.0, 0.0, 0.0));
    if (flicker > 0.76 && u_tension > 0.45) {
        color.r += 0.28 * u_tension * noise(rd * 38.0 + u_time);
    }
    
    // Ambient space base glow
    vec3 spaceColor = vec3(0.015, 0.008, 0.03) * (1.0 - u_tension * 0.4);
    color += spaceColor;
    
    // Volumetric density clamp and gamma correction
    color = clamp(color, 0.0, 1.0);
    color = pow(color, vec3(0.88));
    
    gl_FragColor = vec4(color, 1.0);
}
