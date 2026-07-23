(function initializeSoundscapes(root) {
	"use strict";

	const CATEGORY_LABELS = Object.freeze({
		rain: "Chuva",
		nature: "Natureza",
		binaural: "Binaural",
		noise: "Ruído",
		places: "Lugares",
		animals: "Animais",
		things: "Objetos",
		transport: "Transporte",
		urban: "Urbano",
		system: "Sistema",
	});
	const CATEGORY_ORDER = Object.freeze([
		"rain",
		"nature",
		"binaural",
		"noise",
		"places",
		"animals",
		"things",
		"transport",
		"urban",
		"system",
	]);
	const FILES_BY_CATEGORY = Object.freeze({
		rain: [
		"heavy-rain.mp3",
		"light-rain.mp3",
		"rain-on-car-roof.mp3",
		"rain-on-leaves.mp3",
		"rain-on-tent.mp3",
		"rain-on-umbrella.mp3",
		"rain-on-window.mp3",
		"thunder.mp3",
	],
	nature: [
		"campfire.mp3",
		"droplets.mp3",
		"howling-wind.mp3",
		"jungle.mp3",
		"river.mp3",
		"walk-in-snow.mp3",
		"walk-on-gravel.mp3",
		"walk-on-leaves.mp3",
		"waterfall.mp3",
		"waves.mp3",
		"wind-in-trees.mp3",
		"wind.mp3",
	],
	binaural: [
		"binaural-alpha.wav",
		"binaural-beta.wav",
		"binaural-delta.wav",
		"binaural-gamma.wav",
		"binaural-theta.wav",
	],
	noise: ["brown-noise.wav", "pink-noise.wav", "white-noise.wav"],
	places: [
		"airport.mp3",
		"cafe.mp3",
		"carousel.mp3",
		"church.mp3",
		"construction-site.mp3",
		"crowded-bar.mp3",
		"laboratory.mp3",
		"laundry-room.mp3",
		"library.mp3",
		"night-village.mp3",
		"office.mp3",
		"restaurant.mp3",
		"subway-station.mp3",
		"supermarket.mp3",
		"temple.mp3",
		"underwater.mp3",
	],
	animals: [
		"beehive.mp3",
		"birds.mp3",
		"cat-purring.mp3",
		"chickens.mp3",
		"cows.mp3",
		"crickets.mp3",
		"crows.mp3",
		"dog-barking.mp3",
		"frog.mp3",
		"horse-gallop.mp3",
		"owl.mp3",
		"seagulls.mp3",
		"sheep.mp3",
		"whale.mp3",
		"wolf.mp3",
		"woodpecker.mp3",
	],
	things: [
		"boiling-water.mp3",
		"bubbles.mp3",
		"ceiling-fan.mp3",
		"clock.mp3",
		"dryer.mp3",
		"keyboard.mp3",
		"morse-code.mp3",
		"paper.mp3",
		"singing-bowl.mp3",
		"slide-projector.mp3",
		"tuning-radio.mp3",
		"typewriter.mp3",
		"vinyl-effect.mp3",
		"washing-machine.mp3",
		"wind-chimes.mp3",
		"windshield-wipers.mp3",
	],
	transport: [
		"airplane.mp3",
		"inside-a-train.mp3",
		"rowing-boat.mp3",
		"sailboat.mp3",
		"submarine.mp3",
		"train.mp3",
	],
	urban: [
		"ambulance-siren.mp3",
		"busy-street.mp3",
		"crowd.mp3",
		"fireworks.mp3",
		"highway.mp3",
		"road.mp3",
		"traffic.mp3",
	],
	system: ["silence.wav"],
	});

	function humanize(fileName) {
		return fileName
			.replace(/\.[^.]+$/, "")
			.split("-")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");
	}

	const CATALOG = Object.freeze(
		CATEGORY_ORDER.flatMap((category) =>
			FILES_BY_CATEGORY[category].map((fileName) =>
				Object.freeze({
					id: `${category}:${fileName.replace(/\.[^.]+$/, "")}`,
					category,
					categoryLabel: CATEGORY_LABELS[category],
					label: humanize(fileName),
					src: `sounds/${category === "system" ? "" : `${category}/`}${fileName}`,
				}),
			),
		),
	);

	function createController() {
		if (typeof root.Audio !== "function") return null;

		const audio = new root.Audio();
		audio.preload = "none";
		audio.volume = 0.6;
		let current = null;
		let state = "idle";
		let loop = false;
		const listeners = new Set();

		function snapshot() {
			return Object.freeze({
				track: current,
				state,
				loop,
				volume: audio.volume,
			});
		}

		function emit() {
			const next = snapshot();
			listeners.forEach((listener) => listener(next));
		}

		function setState(nextState) {
			state = nextState;
			emit();
		}

		function select(trackId) {
			const nextTrack = CATALOG.find((track) => track.id === trackId) || null;
			audio.pause();
			loop = Boolean(loop);
			audio.loop = loop;
			audio.currentTime = 0;
			current = nextTrack;
			if (!nextTrack) {
				audio.removeAttribute("src");
				audio.load();
				setState("idle");
				return snapshot();
			}
			audio.src = nextTrack.src;
			setState("ready");
			return snapshot();
		}

		async function play() {
			if (!current) return false;
			setState("loading");
			try {
				await audio.play();
				setState("playing");
				return true;
			} catch {
				setState("error");
				return false;
			}
		}

		function pause() {
			audio.pause();
			if (current) setState("paused");
		}

		function setVolume(value) {
			const nextVolume = Math.max(0, Math.min(1, Number(value) || 0));
			audio.volume = nextVolume;
			emit();
		}

		function setLoop(value) {
			loop = Boolean(value);
			audio.loop = loop;
			emit();
		}

		function onPlaying() {
			setState("playing");
		}
		function onPause() {
			if (current && state !== "error") setState("paused");
		}
		function onEnded() {
			if (!loop) setState("paused");
		}
		function onError() {
			setState("error");
		}
		audio.addEventListener("playing", onPlaying);
		audio.addEventListener("pause", onPause);
		audio.addEventListener("ended", onEnded);
		audio.addEventListener("error", onError);

		return {
			catalog: CATALOG,
			subscribe(listener) {
				if (typeof listener !== "function") return () => {};
				listeners.add(listener);
				listener(snapshot());
				return () => listeners.delete(listener);
			},
			select,
			play,
			pause,
			setVolume,
			setLoop,
			snapshot,
			destroy() {
				pause();
				listeners.clear();
				audio.removeEventListener("playing", onPlaying);
				audio.removeEventListener("pause", onPause);
				audio.removeEventListener("ended", onEnded);
				audio.removeEventListener("error", onError);
				audio.removeAttribute("src");
				audio.load();
			},
		};
	}

	root.TimekeeperSoundscapes = Object.freeze({
		catalog: CATALOG,
		categories: Object.freeze(
			CATEGORY_ORDER.map((id) =>
				Object.freeze({ id, label: CATEGORY_LABELS[id] }),
			),
		),
		createController,
	});
})(window);
