const STYLE_MODES = Object.freeze({
	nebula: 0,
	grid: 1,
	singularity: 2,
	prism: 3,
	vortex: 4,
});

export const WEBGL_BACKGROUND_STYLES = Object.freeze(Object.keys(STYLE_MODES));

const VERTEX_SHADER = `
	attribute vec2 a_position;

	void main() {
		gl_Position = vec4(a_position, 0.0, 1.0);
	}
`;

const FRAGMENT_SHADER = `
	precision mediump float;

	uniform vec2 u_resolution;
	uniform float u_time;
	uniform float u_intensity;
	uniform vec3 u_color_a;
	uniform vec3 u_color_b;
	uniform int u_mode;

	#define PI 3.14159265359

	float hash21(vec2 point) {
		point = fract(point * vec2(123.34, 456.21));
		point += dot(point, point + 45.32);
		return fract(point.x * point.y);
	}

	float valueNoise(vec2 point) {
		vec2 cell = floor(point);
		vec2 local = fract(point);
		local = local * local * (3.0 - 2.0 * local);
		return mix(
			mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
			mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + 1.0), local.x),
			local.y
		);
	}

	float fbm(vec2 point) {
		float result = 0.0;
		float amplitude = 0.5;
		for (int octave = 0; octave < 5; octave++) {
			result += amplitude * valueNoise(point);
			point = point * 2.03 + vec2(17.1, 9.2);
			amplitude *= 0.5;
		}
		return result;
	}

	mat2 rotate2d(float angle) {
		float sine = sin(angle);
		float cosine = cos(angle);
		return mat2(cosine, -sine, sine, cosine);
	}

	vec3 nebula(vec2 uv, float time) {
		vec2 drift = rotate2d(time * 0.035) * uv;
		float cloud = fbm(drift * 1.8 + vec2(time * 0.055, -time * 0.034));
		float detail = fbm(drift * 3.6 - vec2(time * 0.025, time * 0.04));
		float ribbon = smoothstep(0.18, 0.92, cloud + detail * 0.42 - length(uv) * 0.22);
		float stars = step(0.992, hash21(floor((uv + 3.0) * 105.0)));
		vec3 color = mix(u_color_b * 0.08, u_color_a * 0.74, cloud);
		color += mix(u_color_a, u_color_b, detail) * ribbon * 0.66;
		color += vec3(stars) * (0.32 + u_intensity * 0.36);
		return color;
	}

	vec3 quantumGrid(vec2 uv, float time) {
		float depth = max(0.16, abs(uv.y + 0.12));
		vec2 projected = vec2(uv.x / depth, 1.0 / depth);
		projected.y += time * 0.32;
		vec2 lines = abs(fract(projected * vec2(2.6, 0.62)) - 0.5);
		float grid = 1.0 - smoothstep(0.012, 0.065, min(lines.x, lines.y));
		float horizon = exp(-9.0 * abs(uv.y + 0.12));
		float pulse = 0.5 + 0.5 * sin(projected.y * 0.8 - time * 1.7);
		float node = smoothstep(0.91, 0.995, hash21(floor(projected * 2.6))) * grid;
		vec3 color = mix(u_color_a * 0.12, u_color_b * 0.72, pulse);
		color *= grid * (0.46 + u_intensity * 0.56);
		color += mix(u_color_b, u_color_a, pulse) * horizon * 0.38;
		color += vec3(node) * 0.42;
		return color;
	}

	vec3 singularity(vec2 uv, float time) {
		vec2 warped = uv;
		float radius = length(warped);
		float angle = atan(warped.y, warped.x);
		float lens = 0.028 / max(0.035, abs(radius - 0.38));
		float accretion = sin(angle * 5.0 - time * 0.9 + radius * 26.0);
		float ring = exp(-92.0 * abs(radius - 0.38)) * (0.72 + 0.28 * accretion);
		float outerRing = exp(-34.0 * abs(radius - 0.57)) * 0.23;
		float dust = fbm(vec2(angle * 1.4 + time * 0.08, radius * 9.0 - time * 0.12));
		float stars = step(0.994, hash21(floor((uv + 2.0) * 118.0)));
		vec3 color = mix(u_color_a, u_color_b, 0.5 + 0.5 * accretion);
		color *= (ring + outerRing * dust) * (0.7 + u_intensity * 0.48);
		color += mix(u_color_b, u_color_a, dust) * lens * 0.016;
		color += vec3(stars) * smoothstep(0.5, 0.8, radius) * 0.24;
		color *= smoothstep(0.22, 0.34, radius);
		return color;
	}

	vec3 prismFlow(vec2 uv, float time) {
		vec2 flow = uv;
		flow.y += sin(flow.x * 2.4 + time * 0.32) * 0.18;
		float waveA = sin(flow.x * 5.2 - flow.y * 2.1 + time * 0.8);
		float waveB = sin(flow.x * -2.7 + flow.y * 6.1 - time * 0.54);
		float caustic = pow(0.5 + 0.5 * sin((waveA + waveB) * 3.2), 6.0);
		float ribbonA = exp(-8.0 * abs(flow.y - sin(flow.x * 1.7 + time * 0.25) * 0.34));
		float ribbonB = exp(-11.0 * abs(flow.y + sin(flow.x * 1.25 - time * 0.31) * 0.48));
		vec3 color = u_color_a * ribbonA + u_color_b * ribbonB;
		color += mix(u_color_a, u_color_b, 0.5 + 0.5 * waveA) * caustic * 0.34;
		return color * (0.52 + u_intensity * 0.58);
	}

	vec3 chronologicalVortex(vec2 uv, float time) {
		float radius = length(uv);
		float angle = atan(uv.y, uv.x);
		float spiral = sin(angle * 7.0 - radius * 23.0 + time * 0.74);
		float spokes = pow(abs(sin(angle * 12.0 + time * 0.18)), 18.0);
		float rings = pow(abs(sin(radius * 34.0 - time * 0.62)), 13.0);
		float core = exp(-4.6 * radius);
		float mask = 1.0 - smoothstep(0.12, 1.28, radius);
		vec3 color = mix(u_color_a, u_color_b, 0.5 + 0.5 * spiral);
		color *= (spiral * 0.14 + 0.18 + rings * 0.52 + spokes * 0.18) * mask;
		color += mix(u_color_b, u_color_a, radius) * core * 0.32;
		return color * (0.58 + u_intensity * 0.54);
	}

	void main() {
		vec2 resolution = max(u_resolution, vec2(1.0));
		vec2 uv = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
		float time = u_time;
		vec3 color;

		if (u_mode == 0) {
			color = nebula(uv, time);
		} else if (u_mode == 1) {
			color = quantumGrid(uv, time);
		} else if (u_mode == 2) {
			color = singularity(uv, time);
		} else if (u_mode == 3) {
			color = prismFlow(uv, time);
		} else {
			color = chronologicalVortex(uv, time);
		}

		float vignette =
			1.0 - smoothstep(0.24, 1.72, length(uv * vec2(0.78, 1.0)));
		color *= 0.42 + vignette * 0.72;
		color = 1.0 - exp(-color);
		gl_FragColor = vec4(color, 1.0);
	}
`;

function compileShader(gl, type, source) {
	const shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const details = gl.getShaderInfoLog(shader) || "erro desconhecido";
		gl.deleteShader(shader);
		throw new Error(`Falha ao compilar shader WebGL: ${details}`);
	}
	return shader;
}

function createProgram(gl) {
	const program = gl.createProgram();
	const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
	const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	gl.deleteShader(vertex);
	gl.deleteShader(fragment);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const details = gl.getProgramInfoLog(program) || "erro desconhecido";
		gl.deleteProgram(program);
		throw new Error(`Falha ao vincular shader WebGL: ${details}`);
	}
	return program;
}

function normalizedColor(value, fallback) {
	const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
	const channels = match
		? match.slice(1).map((channel) => Number.parseInt(channel, 16) / 255)
		: fallback;
	return new Float32Array(channels);
}

function clamp(value, minimum, maximum, fallback) {
	const number = Number(value);
	return Number.isFinite(number)
		? Math.max(minimum, Math.min(maximum, number))
		: fallback;
}

export function createWebGLBackground(canvas, motionQuery) {
	if (!canvas) return { configure() {} };

	let gl;
	let program;
	try {
		gl = canvas.getContext("webgl", {
			alpha: true,
			antialias: false,
			depth: false,
			powerPreference: "low-power",
			premultipliedAlpha: false,
			stencil: false,
		});
		if (!gl) throw new Error("WebGL não está disponível neste navegador.");
		program = createProgram(gl);
	} catch (error) {
		canvas.dataset.webglUnavailable = "true";
		console.warn(error.message);
		return { configure() {} };
	}

	const positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
		gl.STATIC_DRAW,
	);

	const locations = {
		position: gl.getAttribLocation(program, "a_position"),
		resolution: gl.getUniformLocation(program, "u_resolution"),
		time: gl.getUniformLocation(program, "u_time"),
		intensity: gl.getUniformLocation(program, "u_intensity"),
		colorA: gl.getUniformLocation(program, "u_color_a"),
		colorB: gl.getUniformLocation(program, "u_color_b"),
		mode: gl.getUniformLocation(program, "u_mode"),
	};
	const state = {
		active: false,
		colorA: normalizedColor("#7c3aed", [0.49, 0.23, 0.93]),
		colorB: normalizedColor("#0ea5e9", [0.05, 0.65, 0.91]),
		frame: null,
		intensity: 0.55,
		mode: 0,
		speed: 0.55,
		startedAt: performance.now(),
	};

	function resize() {
		const rectangle = canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
		const width = Math.max(1, Math.round(rectangle.width * dpr));
		const height = Math.max(1, Math.round(rectangle.height * dpr));
		if (canvas.width === width && canvas.height === height) return;
		canvas.width = width;
		canvas.height = height;
		gl.viewport(0, 0, width, height);
	}

	function clear() {
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	function draw(now) {
		resize();
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
		gl.enableVertexAttribArray(locations.position);
		gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
		gl.uniform2f(locations.resolution, canvas.width, canvas.height);
		gl.uniform1f(
			locations.time,
			((now - state.startedAt) / 1000) * (0.28 + state.speed * 1.12),
		);
		gl.uniform1f(locations.intensity, state.intensity);
		gl.uniform3fv(locations.colorA, state.colorA);
		gl.uniform3fv(locations.colorB, state.colorB);
		gl.uniform1i(locations.mode, state.mode);
		gl.drawArrays(gl.TRIANGLES, 0, 6);
	}

	function stop(clearCanvas = true) {
		if (state.frame !== null) {
			window.cancelAnimationFrame(state.frame);
			state.frame = null;
		}
		if (clearCanvas) clear();
	}

	function loop(now) {
		state.frame = null;
		if (!state.active || document.hidden || motionQuery.matches) return;
		draw(now);
		state.frame = window.requestAnimationFrame(loop);
	}

	function sync() {
		stop(!state.active);
		if (!state.active) return;
		draw(performance.now());
		if (!document.hidden && !motionQuery.matches) {
			state.frame = window.requestAnimationFrame(loop);
		}
	}

	function configure(settings) {
		state.active =
			settings.enabled === true &&
			Object.prototype.hasOwnProperty.call(STYLE_MODES, settings.style);
		state.mode = STYLE_MODES[settings.style] ?? 0;
		state.colorA = normalizedColor(settings.colorA, [0.49, 0.23, 0.93]);
		state.colorB = normalizedColor(settings.colorB, [0.05, 0.65, 0.91]);
		state.speed = clamp(settings.speed, 20, 100, 55) / 100;
		state.intensity = clamp(settings.intensity, 15, 100, 55) / 100;
		sync();
	}

	window.addEventListener("resize", sync);
	document.addEventListener("visibilitychange", sync);
	if (typeof motionQuery.addEventListener === "function") {
		motionQuery.addEventListener("change", sync);
	} else {
		motionQuery.addListener(sync);
	}
	canvas.addEventListener("webglcontextlost", () => {
		canvas.dataset.webglUnavailable = "true";
		stop(false);
	});

	return { configure };
}
