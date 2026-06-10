/**
 * WebGL2 GPU Renderer for isochrone computation
 * Executes the per-pixel travel-time calculation entirely on the GPU as a fragment shader,
 * replacing the CPU worker loop for real-time rendering performance.
 */

import { BAND_STOPS, NUM_BANDS } from './color-scale';

// ─── Shaders ────────────────────────────────────────────────────────────────

// Palette block generated from BAND_STOPS so GPU and CPU paths share one palette
const GLSL_STOPS = BAND_STOPS.map((c, i) =>
    `    stops[${i}] = vec3(${(c[0] / 255).toFixed(4)}, ${(c[1] / 255).toFixed(4)}, ${(c[2] / 255).toFixed(4)});`
).join('\n');

const VERTEX_SHADER_SRC = /* glsl */`#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    // Map clip-space [-1,1] to UV [0,1]
    // v_uv.y=0 → bottom of canvas → south; v_uv.y=1 → top → north
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER_SRC = /* glsl */`#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 v_uv;
out vec4 fragColor;

// Station data: packed as RGBA32F, one texel per station
// r = lat, g = lng, b = travelTimeSec, a = unused
uniform sampler2D u_stations;
uniform int u_numStations;

// Walking time grid (R32F, -1 = not reachable)
uniform sampler2D u_walkingGrid;
uniform bool u_hasWalkingGrid;
uniform float u_wgNorth;
uniform float u_wgSouth;
uniform float u_wgEast;
uniform float u_wgWest;

// Obstacle mask (RGBA8 – alpha > 0 = obstacle/water)
uniform sampler2D u_obstacles;
uniform bool u_hasObstacles;

// Map bounds (geographic)
uniform float u_north;
uniform float u_south;
uniform float u_east;
uniform float u_west;

// Travel parameters
uniform vec2  u_origin;       // (lat, lng) of the trip origin
uniform float u_walkSpeed;    // metres per second
uniform float u_maxTime;      // minutes – colour scale maximum
uniform float u_opacity;      // layer opacity 0–1
uniform float u_revealTime;   // minutes – reveal animation frontier (< 0 = disabled)

// ─── Constants ───────────────────────────────────────────────────────────────
const float PI          = 3.14159265358979323846;
const float EARTH_R     = 6371000.0;
const float EXIT_FACTOR = 1.4; // walking-time multiplier from station to pixel

// ─── Helpers ─────────────────────────────────────────────────────────────────

float haversine(float lat1, float lon1, float lat2, float lon2) {
    float dLat = (lat2 - lat1) * PI / 180.0;
    float dLon = (lon2 - lon1) * PI / 180.0;
    float sLat = sin(dLat * 0.5);
    float sLon = sin(dLon * 0.5);
    float a = sLat * sLat + cos(lat1 * PI / 180.0) * cos(lat2 * PI / 180.0) * sLon * sLon;
    return EARTH_R * 2.0 * atan(sqrt(a), sqrt(max(1.0 - a, 0.0)));
}

// Returns walking-grid time in seconds, or -1.0 if outside grid / unavailable.
float walkingGridTime(float lat, float lng) {
    if (!u_hasWalkingGrid) return -1.0;
    float u = (lng - u_wgWest)  / (u_wgEast  - u_wgWest);
    float v = (lat - u_wgSouth) / (u_wgNorth - u_wgSouth);
    if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) return -1.0;
    float t = texture(u_walkingGrid, vec2(u, v)).r;
    return t >= 0.0 ? t : -1.0;
}

// Maps travel time (minutes) to an RGBA colour matching the JS getColor() palette,
// with anti-aliased topographic contour lines at band boundaries.
// Returns transparent black for times >= maxTime.
// NOTE: contains fwidth() — must be reached in uniform control flow.
vec4 timeToColor(float minutes) {
    float frac = clamp(minutes / u_maxTime, 0.0, 1.0);
    float pos  = min(frac * ${NUM_BANDS}.0, ${NUM_BANDS}.0 - 1e-4);
    float band = floor(pos);
    float t    = fract(pos);

    vec3 stops[${NUM_BANDS + 1}];
${GLSL_STOPS}
    stops[${NUM_BANDS}] = stops[${NUM_BANDS - 1}]; // clamped fallback

    int b = int(band);
    vec3 col = mix(stops[b], stops[b + 1], t);

    // ── Hypsometric depth (mirrors getColor() in color-scale.ts) ─────────
    float sat = 1.0 + 0.15 * max(1.0 - pos, 0.0);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = lum + (col - lum) * sat;
    float depth = 1.0 - 0.2 * (pos / ${NUM_BANDS}.0);

    // ── Topographic contours ─────────────────────────────────────────────
    // aa ≈ band-units per screen pixel. Clamped: the time field jumps at
    // walking-grid edges and station handoffs, where an unclamped fwidth
    // blooms the edge detection into jagged spurious strokes.
    float aa = clamp(fwidth(pos), 1e-4, 0.06);
    float d  = abs(fract(pos + 0.5) - 0.5);     // distance to nearest band edge
    float line = (1.0 - smoothstep(aa * 0.8, aa * 1.8, d)) * step(0.2, pos);

    // Outer reachability edge gets the strongest stroke — the "coastline"
    float outer = 1.0 - smoothstep(0.0, aa * 2.5, (1.0 - frac) * ${NUM_BANDS}.0);
    float stroke = max(line * 0.85, outer);

    col = mix(col, col * 0.55, stroke);
    float alpha = min(u_opacity * depth + stroke * 0.25, 1.0);

    if (minutes >= u_maxTime) return vec4(0.0);
    return vec4(col, alpha);
}

// ─── Main ────────────────────────────────────────────────────────────────────

void main() {
    // --- Obstacle check (water / buildings) ----------------------------------
    // Resolved at the end (no early return) so fwidth() in timeToColor() is
    // evaluated in uniform control flow across each 2×2 quad.
    bool obstacle = false;
    if (u_hasObstacles) {
        obstacle = texture(u_obstacles, v_uv).a > 0.4;
    }

    // --- Geographic coordinates of this fragment -----------------------------
    float lat = mix(u_south, u_north, v_uv.y);
    float lng  = mix(u_west,  u_east,  v_uv.x);

    // --- Baseline: direct walking time from origin ---------------------------
    float minTimeSec;

    float gridTime = walkingGridTime(lat, lng);
    if (gridTime >= 0.0) {
        minTimeSec = gridTime;
    } else {
        float directDist = haversine(u_origin.x, u_origin.y, lat, lng);
        minTimeSec = directDist / u_walkSpeed;
    }

    // --- Transit time: scan visible stations ---------------------------------
    // The station texture is a 1-D RGBA32F strip (width = next-pow-2 ≥ numStations).
    int stW = textureSize(u_stations, 0).x;
    float invW = 1.0 / float(stW);

    int nSt = min(u_numStations, 8192);
    for (int i = 0; i < nSt; i++) {
        // Read station: (lat, lng, timeSec, _)
        vec4 s = texture(u_stations, vec2((float(i) + 0.5) * invW, 0.5));
        float sLat = s.r;
        float sLon = s.g;
        float sSec = s.b;

        // Quick bounding-box reject (≈ 5.5 km at mid-latitudes)
        if (abs(sLat - lat) + abs(sLon - lng) > 0.05) continue;

        // Exit-walk time from station → pixel with 1.4× penalty for intersections
        float exitDist = haversine(lat, lng, sLat, sLon);
        float total    = sSec + (exitDist / u_walkSpeed) * EXIT_FACTOR;

        if (total < minTimeSec) minTimeSec = total;
    }

    float minutes = minTimeSec / 60.0;
    vec4 color = timeToColor(minutes);

    // --- Reveal animation: wave expands outward from the origin in time-space
    if (u_revealTime >= 0.0) {
        float behind = u_revealTime - minutes;       // > 0 once the wave has passed
        color.a *= smoothstep(0.0, 1.5, behind);     // soft leading edge
        float wave = 1.0 - smoothstep(0.0, 2.0, abs(behind - 0.75));
        color.rgb = mix(color.rgb, vec3(1.0), wave * 0.45); // glowing wavefront
    }

    fragColor = obstacle ? vec4(0.0) : color;
}`;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WebGLRenderParams {
    width: number;
    height: number;
    origin: [number, number];
    bounds: { north: number; south: number; east: number; west: number };
    activeStations: Array<{ lat: number; lon: number; time: number }>;
    opacity: number;
    maxTime: number;
    walkSpeedMps: number;
    obstacleCanvas?: HTMLCanvasElement | null;
    walkingGrid?: {
        data: number[];
        size: number;
        bounds: { north: number; south: number; east: number; west: number };
    } | null;
}

// ─── WebGLRenderer ───────────────────────────────────────────────────────────

export class WebGLRenderer {
    private readonly offscreen: HTMLCanvasElement;
    private readonly gl: WebGL2RenderingContext | null;
    private program: WebGLProgram | null = null;
    private vao: WebGLVertexArrayObject | null = null;
    private stationTex: WebGLTexture | null = null;
    private obstacleTex: WebGLTexture | null = null;
    private walkingTex: WebGLTexture | null = null;
    private uniforms: Map<string, WebGLUniformLocation | null> = new Map();
    // LINEAR filtering on float textures needs OES_texture_float_linear (missing on many mobile GPUs)
    private floatLinear: boolean = false;
    private lastParams: WebGLRenderParams | null = null;

    constructor() {
        this.offscreen = document.createElement('canvas');
        this.gl = this.offscreen.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true, // allow drawImage after gl.drawArrays
            antialias: false
        });

        if (this.gl) {
            this._init();
        } else {
            console.warn('[WebGLRenderer] WebGL2 not supported – falling back to CPU worker');
        }
    }

    get isSupported(): boolean {
        return this.gl !== null && this.program !== null;
    }

    // ── Initialisation ────────────────────────────────────────────────────────

    private _init(): void {
        const gl = this.gl!;

        this.floatLinear = !!gl.getExtension('OES_texture_float_linear');

        const vs = this._compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
        const fs = this._compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
        if (!vs || !fs) return;

        const prog = gl.createProgram()!;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);

        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('[WebGLRenderer] Program link error:', gl.getProgramInfoLog(prog));
            return;
        }

        this.program = prog;
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        // Full-screen quad (triangle strip)
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const vbo = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        this.vao = gl.createVertexArray()!;
        gl.bindVertexArray(this.vao);
        const posLoc = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // Cache uniform locations
        const names = [
            'u_stations', 'u_numStations',
            'u_walkingGrid', 'u_hasWalkingGrid',
            'u_wgNorth', 'u_wgSouth', 'u_wgEast', 'u_wgWest',
            'u_obstacles', 'u_hasObstacles',
            'u_north', 'u_south', 'u_east', 'u_west',
            'u_origin', 'u_walkSpeed', 'u_maxTime', 'u_opacity',
            'u_revealTime'
        ];
        for (const n of names) {
            this.uniforms.set(n, gl.getUniformLocation(prog, n));
        }

        // Allocate placeholder textures (1×1 pixels)
        this.stationTex  = this._emptyTex(gl.RGBA32F, gl.RGBA, gl.FLOAT, 1, 1, new Float32Array(4));
        this.obstacleTex = this._emptyTex(gl.RGBA8,   gl.RGBA, gl.UNSIGNED_BYTE, 1, 1, new Uint8Array(4));
        this.walkingTex  = this._emptyTex(gl.R32F,    gl.RED,  gl.FLOAT, 1, 1, new Float32Array(1));
    }

    private _compileShader(type: number, src: string): WebGLShader | null {
        const gl = this.gl!;
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('[WebGLRenderer] Shader compile error:', gl.getShaderInfoLog(shader), '\nSource:', src.substring(0, 500));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    private _emptyTex(
        internalFmt: number, fmt: number, type: number,
        w: number, h: number,
        pixels: ArrayBufferView
    ): WebGLTexture {
        const gl = this.gl!;
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, fmt, type, pixels);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }

    // ── Texture uploads ────────────────────────────────────────────────────────

    private _uploadStations(stations: Array<{ lat: number; lon: number; time: number }>): void {
        const gl = this.gl!;
        const n = stations.length;
        if (n === 0) return;

        // Pad width to next power-of-2 (≥ n)
        let w = 1;
        while (w < n) w <<= 1;

        const data = new Float32Array(w * 4);
        for (let i = 0; i < n; i++) {
            data[i * 4]     = stations[i].lat;
            data[i * 4 + 1] = stations[i].lon;
            data[i * 4 + 2] = stations[i].time;
            data[i * 4 + 3] = 0;
        }

        gl.bindTexture(gl.TEXTURE_2D, this.stationTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, 1, 0, gl.RGBA, gl.FLOAT, data);
    }

    private _uploadObstacles(obstacleCanvas: HTMLCanvasElement | null): void {
        const gl = this.gl!;
        gl.bindTexture(gl.TEXTURE_2D, this.obstacleTex);
        if (obstacleCanvas) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, obstacleCanvas);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        }
    }

    private _uploadWalkingGrid(
        wg: { data: number[]; size: number } | null
    ): void {
        const gl = this.gl!;
        gl.bindTexture(gl.TEXTURE_2D, this.walkingTex);
        if (wg) {
            const data = new Float32Array(wg.data);
            const s = wg.size;
            const filter = this.floatLinear ? gl.LINEAR : gl.NEAREST;
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, s, s, 0, gl.RED, gl.FLOAT, data);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([-1]));
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    render(params: WebGLRenderParams): void {
        if (!this.isSupported) return;
        const gl = this.gl!;

        const { width, height, activeStations,
                obstacleCanvas = null, walkingGrid = null } = params;

        // Resize offscreen canvas and viewport if needed
        if (this.offscreen.width !== width || this.offscreen.height !== height) {
            this.offscreen.width  = width;
            this.offscreen.height = height;
            gl.viewport(0, 0, width, height);
        }

        // Upload data textures
        this._uploadStations(activeStations);
        this._uploadObstacles(obstacleCanvas);
        this._uploadWalkingGrid(walkingGrid);

        this.lastParams = params;
        this._draw(params, -1);
    }

    /**
     * Redraws the last-rendered frame with a reveal frontier (minutes).
     * Cheap — skips all texture uploads, so it can run per animation frame.
     */
    redrawReveal(revealTime: number): void {
        if (!this.isSupported || !this.lastParams) return;
        this._draw(this.lastParams, revealTime);
    }

    private _draw(params: WebGLRenderParams, revealTime: number): void {
        const gl = this.gl!;

        const { origin, bounds, activeStations,
                opacity, maxTime, walkSpeedMps,
                obstacleCanvas = null, walkingGrid = null } = params;

        // Clear
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Bind textures
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.stationTex);
        gl.uniform1i(this.uniforms.get('u_stations')!, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.walkingTex);
        gl.uniform1i(this.uniforms.get('u_walkingGrid')!, 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.obstacleTex);
        gl.uniform1i(this.uniforms.get('u_obstacles')!, 2);

        // Set uniforms
        gl.uniform1i(this.uniforms.get('u_numStations')!,  activeStations.length);
        gl.uniform1i(this.uniforms.get('u_hasWalkingGrid')!, walkingGrid ? 1 : 0);
        gl.uniform1i(this.uniforms.get('u_hasObstacles')!,  obstacleCanvas ? 1 : 0);

        gl.uniform2f(this.uniforms.get('u_origin')!, origin[0], origin[1]);
        gl.uniform1f(this.uniforms.get('u_north')!,  bounds.north);
        gl.uniform1f(this.uniforms.get('u_south')!,  bounds.south);
        gl.uniform1f(this.uniforms.get('u_east')!,   bounds.east);
        gl.uniform1f(this.uniforms.get('u_west')!,   bounds.west);
        gl.uniform1f(this.uniforms.get('u_walkSpeed')!, walkSpeedMps);
        gl.uniform1f(this.uniforms.get('u_maxTime')!,   maxTime);
        gl.uniform1f(this.uniforms.get('u_opacity')!,   opacity);
        gl.uniform1f(this.uniforms.get('u_revealTime')!, revealTime);

        if (walkingGrid) {
            const wb = walkingGrid.bounds;
            gl.uniform1f(this.uniforms.get('u_wgNorth')!, wb.north);
            gl.uniform1f(this.uniforms.get('u_wgSouth')!, wb.south);
            gl.uniform1f(this.uniforms.get('u_wgEast')!,  wb.east);
            gl.uniform1f(this.uniforms.get('u_wgWest')!,  wb.west);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.bindVertexArray(null);

        // Flush to ensure pixels are ready for drawImage
        gl.flush();
    }

    /** Returns the offscreen canvas containing the latest rendered frame. */
    getCanvas(): HTMLCanvasElement {
        return this.offscreen;
    }

    dispose(): void {
        if (!this.gl) return;
        const gl = this.gl;
        if (this.stationTex)  gl.deleteTexture(this.stationTex);
        if (this.obstacleTex) gl.deleteTexture(this.obstacleTex);
        if (this.walkingTex)  gl.deleteTexture(this.walkingTex);
        if (this.program)     gl.deleteProgram(this.program);
        if (this.vao)         gl.deleteVertexArray(this.vao);
    }
}
