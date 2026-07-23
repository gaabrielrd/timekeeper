const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
	path.join(__dirname, "../../public/src/soundscapes.js"),
	"utf8",
);

class FakeAudio {
	static playCalls = 0;
	static rejectPlay = false;

	constructor() {
		this.listeners = new Map();
		this.volume = 1;
		this.currentTime = 0;
		this.paused = true;
		this.src = "";
		this.loop = false;
	}

	addEventListener(type, listener) {
		if (!this.listeners.has(type)) this.listeners.set(type, new Set());
		this.listeners.get(type).add(listener);
	}

	removeEventListener(type, listener) {
		this.listeners.get(type)?.delete(listener);
	}

	dispatch(type) {
		this.listeners.get(type)?.forEach((listener) => listener());
	}

	load() {}

	removeAttribute(attribute) {
		if (attribute === "src") this.src = "";
	}

	pause() {
		this.paused = true;
		this.dispatch("pause");
	}

	play() {
		FakeAudio.playCalls += 1;
		if (FakeAudio.rejectPlay) return Promise.reject(new Error("offline"));
		this.paused = false;
		this.dispatch("playing");
		return Promise.resolve();
	}
}

function loadApi() {
	FakeAudio.playCalls = 0;
	FakeAudio.rejectPlay = false;
	const window = { Audio: FakeAudio };
	vm.runInNewContext(source, { window });
	return window.TimekeeperSoundscapes;
}

test("catálogo de paisagens mapeia os arquivos locais sem alarmes", () => {
	const api = loadApi();
	assert.equal(api.catalog.length, 90);
	assert.equal(api.catalog.some((track) => track.src.includes("alarm")), false);
	assert.equal(
		api.catalog.filter((track) => track.category === "rain").length,
		8,
	);
	assert.equal(
		api.catalog.find((track) => track.id === "system:silence")?.src,
		"sounds/silence.wav",
	);
	assert.equal(api.catalog[0].categoryLabel, "Chuva");
});

test("controlador não reproduz automaticamente e expõe controles de sessão", async () => {
	const api = loadApi();
	const controller = api.createController();
	assert.equal(FakeAudio.playCalls, 0);
	assert.equal(controller.snapshot().state, "idle");
	assert.equal(controller.snapshot().volume, 0.2);
	assert.equal(controller.snapshot().loop, true);

	controller.select("rain:light-rain");
	assert.equal(FakeAudio.playCalls, 0);
	assert.equal(controller.snapshot().state, "ready");
	controller.setVolume(0.35);
	assert.equal(controller.snapshot().volume, 0.35);
	assert.equal(controller.snapshot().loop, true);

	await controller.play();
	assert.equal(FakeAudio.playCalls, 1);
	assert.equal(controller.snapshot().state, "playing");
	controller.pause();
	assert.equal(controller.snapshot().state, "paused");
	controller.destroy();
});

test("falha de permissão ou rede vira estado de erro controlado", async () => {
	const api = loadApi();
	const controller = api.createController();
	controller.select("noise:white-noise");
	FakeAudio.rejectPlay = true;
	assert.equal(await controller.play(), false);
	assert.equal(controller.snapshot().state, "error");
	controller.destroy();
});
