#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_alpha;

// Inigo Quilez's exact mathematically perfect Heart SDF
float sdHeart(vec2 p) {
    p.x = abs(p.x);
    if( p.y+p.x>1.0 ) {
        vec2 q = p - vec2(0.25, 0.75);
        return sqrt(dot(q,q)) - sqrt(2.0)/4.0;
    }
    vec2 r = p - vec2(0.0, 1.0);
    float w = clamp(p.x + p.y, 0.0, 1.0);
    vec2 s = p - 0.5 * w;
    return sqrt(min(dot(r,r), dot(s,s))) * sign(p.x-p.y);
}

void main() {
    // 1. Normalize pixel coordinates (from -1 to 1) and fix aspect ratio
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.y, u_resolution.x);
    
    // 2. Scale and position the heart in the center of the canvas
    uv *= 2.5; 
    uv.y -= 0.5;  // Shift down slightly to center the volume
    uv.y *= -1.0; // Flip Y for standard Cartesian math orientation

    // 3. Calculate distance from the current pixel to the mathematical edge of the heart
    float d = sdHeart(uv);

    // 4. Create the core body of the heart (sharp edge)
    float core = smoothstep(0.02, 0.0, d);

    // 5. Create the Neon Bloom / Glow effect using inverse distance
    float glow = 0.03 / max(d, 0.001); 
    glow = pow(glow, 1.4); // Intensify the light falloff

    // 6. Dual-Color Logic: left=Player1 neon green, right=Player2 hot pink
    vec3 p1Color = vec3(0.1, 1.0, 0.4);   // Player 1 Neon Green
    vec3 p2Color = vec3(1.0, 0.2, 0.6);   // Player 2 Hot Pink
    
    // Smoothly blend the colors across the center X axis
    vec3 baseColor = mix(p1Color, p2Color, smoothstep(-0.1, 0.1, uv.x));

    // Add an internal pulse driven by time
    float pulse = 0.8 + 0.2 * sin(u_time * 5.0);

    // White-hot inner refraction streaks (volumetric illusion)
    float refraction = pow(max(0.0, -d + 0.05), 3.0) * 0.8;
    float innerLight = 0.015 / max(abs(d + 0.08), 0.003); // inner glow ring
    vec3 volColor = baseColor + vec3(0.6, 0.6, 0.6) * refraction + vec3(1.0) * innerLight * 0.3;

    // Combine the core, the glow, and a bright white-hot center
    vec3 finalColor = (volColor * glow * pulse) + (core * vec3(0.8));

    // 7. Output to screen — u_alpha allows instant lifecycle kill
    gl_FragColor = vec4(finalColor, u_alpha * smoothstep(1.0, 0.0, d - 0.5)); 
}
