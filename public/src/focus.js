(function initializeFocusMode(root) {
	"use strict";

	const STORAGE_KEY = "timekeeper:focus-counter";
	const RESTORE_TIMEOUT_MS = 10000;
	const SYNC_INTERVAL_MS = 1000;
	let activeCounterId = "";
	let activeTrigger = null;
	let syncTimer = null;
	let restoreTimer = null;
	let restoreObserver = null;
	let soundController = null;
	let initialized = false;

	function storedCounterId() {
		try {
			return String(root.sessionStorage.getItem(STORAGE_KEY) || "").slice(0, 100);
		} catch {
			return "";
		}
	}

	function storeCounterId(counterId) {
		try {
			if (counterId) root.sessionStorage.setItem(STORAGE_KEY, counterId);
			else root.sessionStorage.removeItem(STORAGE_KEY);
		} catch {
			// O modo continua funcional quando o armazenamento da sessão é bloqueado.
		}
	}

	function focusElements() {
		return {
			view: root.document.querySelector("#focus-mode"),
			close: root.document.querySelector("#focus-mode-close"),
			title: root.document.querySelector("#focus-mode-title"),
			pre: root.document.querySelector("#focus-mode-pre"),
			main: root.document.querySelector("#focus-mode-main"),
			post: root.document.querySelector("#focus-mode-post"),
			media: root.document.querySelector("#focus-mode-media"),
			image: root.document.querySelector("#focus-mode-image"),
			overlay: root.document.querySelector("#focus-mode-overlay"),
			checklist: root.document.querySelector("#focus-mode-checklist"),
			progress: root.document.querySelector("#focus-mode-progress"),
			soundscape: root.document.querySelector("#focus-mode-soundscape"),
			soundSelect: root.document.querySelector("#focus-mode-sound-select"),
			soundToggle: root.document.querySelector("#focus-mode-sound-toggle"),
			soundToggleIcon: root.document.querySelector(
				"#focus-mode-sound-toggle-icon",
			),
			soundToggleLabel: root.document.querySelector(
				"#focus-mode-sound-toggle-label",
			),
			soundVolume: root.document.querySelector("#focus-mode-sound-volume"),
			soundVolumeOutput: root.document.querySelector(
				"#focus-mode-sound-volume-output",
			),
			soundLoop: root.document.querySelector("#focus-mode-sound-loop"),
			soundStatus: root.document.querySelector("#focus-mode-sound-status"),
		};
	}

	function soundTrackStatus(snapshot) {
		if (!snapshot.track) return "Escolha um som";
		if (snapshot.state === "playing") return `Tocando · ${snapshot.track.label}`;
		if (snapshot.state === "error") return "Indisponível offline";
		if (snapshot.state === "loading") return "Carregando…";
		return `Pausado · ${snapshot.track.label}`;
	}

	function renderSoundscape(snapshot) {
		const elements = focusElements();
		if (!elements.soundscape) return;
		if (elements.soundStatus) {
			elements.soundStatus.textContent = soundTrackStatus(snapshot);
		}
		if (elements.soundSelect && snapshot.track) {
			elements.soundSelect.value = snapshot.track.id;
		} else if (elements.soundSelect) {
			elements.soundSelect.value = "";
		}
		if (elements.soundToggle) {
			const isPlaying = snapshot.state === "playing";
			elements.soundToggle.disabled = !snapshot.track;
			elements.soundToggle.setAttribute("aria-pressed", String(isPlaying));
			elements.soundToggle.setAttribute(
				"aria-label",
				isPlaying
					? "Pausar paisagem sonora"
					: "Reproduzir paisagem sonora",
			);
		}
		if (elements.soundToggleIcon) {
			elements.soundToggleIcon.textContent =
				snapshot.state === "playing" ? "pause" : "play_arrow";
		}
		if (elements.soundToggleLabel) {
			elements.soundToggleLabel.textContent =
				snapshot.state === "playing"
					? "Pausar"
					: snapshot.state === "error"
						? "Tentar novamente"
						: "Reproduzir";
		}
		if (elements.soundVolume) {
			elements.soundVolume.value = String(Math.round(snapshot.volume * 100));
		}
		if (elements.soundVolumeOutput) {
			elements.soundVolumeOutput.textContent = `${Math.round(
				snapshot.volume * 100,
			)}%`;
		}
		if (elements.soundLoop) elements.soundLoop.checked = snapshot.loop;
	}

	function populateSoundscapeSelect(elements) {
		const catalog = root.TimekeeperSoundscapes?.catalog || [];
		const categories = root.TimekeeperSoundscapes?.categories || [];
		if (!elements.soundSelect || !catalog.length) return;
		elements.soundSelect.replaceChildren();
		const placeholder = root.document.createElement("option");
		placeholder.value = "";
		placeholder.textContent = "Escolha uma paisagem sonora";
		elements.soundSelect.append(placeholder);
		categories.forEach((category) => {
			const group = root.document.createElement("optgroup");
			group.label = category.label;
			catalog
				.filter((track) => track.category === category.id)
				.forEach((track) => {
					const option = root.document.createElement("option");
					option.value = track.id;
					option.textContent = track.label;
					group.append(option);
				});
			if (group.children.length) elements.soundSelect.append(group);
		});
	}

	function initializeSoundscape() {
		const elements = focusElements();
		if (!elements.soundscape) return;
		if (!root.TimekeeperSoundscapes?.createController) {
			elements.soundscape.hidden = true;
			return;
		}
		soundController = root.TimekeeperSoundscapes.createController();
		if (!soundController) {
			elements.soundscape.hidden = true;
			return;
		}
		populateSoundscapeSelect(elements);
		soundController.setVolume(Number(elements.soundVolume?.value || 60) / 100);
		soundController.subscribe(renderSoundscape);
		elements.soundSelect?.addEventListener("change", () => {
			soundController.select(elements.soundSelect.value);
		});
		elements.soundToggle?.addEventListener("click", () => {
			if (soundController.snapshot().state === "playing") {
				soundController.pause();
			} else {
				soundController.play();
			}
		});
		elements.soundVolume?.addEventListener("input", () => {
			soundController.setVolume(Number(elements.soundVolume.value) / 100);
		});
		elements.soundLoop?.addEventListener("change", () => {
			soundController.setLoop(elements.soundLoop.checked);
		});
	}

	function counterElement(counterId) {
		return Array.from(root.document.querySelectorAll("[data-focus-id]")).find(
			(element) => element.dataset.focusId === counterId,
		);
	}

	function cloneChildren(source, target) {
		target.replaceChildren(
			...Array.from(source?.childNodes || [], (node) => node.cloneNode(true)),
		);
	}

	function syncFocusedMedia(source, elements) {
		const sourceImage = source.querySelector(
			".counter-card-media .counter-card-image",
		);
		const sourceOverlay = source.querySelector(
			".counter-card-media .counter-card-overlay",
		);
		const hasMedia = Boolean(
			sourceImage?.style.backgroundImage && sourceOverlay,
		);
		elements.view.classList.toggle("has-counter-media", hasMedia);
		if (!elements.media || !elements.image || !elements.overlay) return;
		if (!hasMedia) {
			elements.media.hidden = true;
			elements.image.style.removeProperty("background-image");
			elements.image.style.removeProperty("opacity");
			elements.overlay.style.removeProperty("opacity");
			return;
		}
		elements.image.style.backgroundImage = sourceImage.style.backgroundImage;
		elements.image.style.opacity = sourceImage.style.opacity;
		elements.overlay.style.opacity = sourceOverlay.style.opacity;
		elements.media.hidden = false;
	}

	function syncFocusedCounter() {
		if (!activeCounterId) return false;
		const source = counterElement(activeCounterId);
		if (!source) {
			closeFocusMode({ restoreFocus: false });
			return false;
		}

		const elements = focusElements();
		const sourceTitle = source.querySelector(".panel-title");
		const sourcePre = source.querySelector(".panel-pre");
		const sourceMain = source.querySelector(".panel-main");
		const sourcePost = source.querySelector(".panel-post");
		const sourceChecklist = source.querySelector(".counter-card-checklist");
		const sourceProgress = source.querySelector(".progress-bar svg");
		if (!sourceTitle || !sourcePre || !sourceMain || !sourcePost) return false;

		elements.title.textContent = sourceTitle.textContent;
		elements.pre.textContent = sourcePre.textContent;
		cloneChildren(sourceMain, elements.main);
		elements.post.textContent = sourcePost.textContent;
		syncFocusedMedia(source, elements);
		if (sourceChecklist) {
			cloneChildren(sourceChecklist, elements.checklist);
			elements.checklist.hidden = false;
			elements.checklist.querySelectorAll("input, button").forEach((control) => {
				control.disabled = true;
				control.tabIndex = -1;
			});
		} else {
			elements.checklist.replaceChildren();
			elements.checklist.hidden = true;
		}
		if (sourceProgress) {
			elements.progress.replaceChildren(sourceProgress.cloneNode(true));
		} else {
			elements.progress.replaceChildren();
		}

		const counterColor = root
			.getComputedStyle(source)
			.getPropertyValue("--counter-color")
			.trim();
		elements.view.style.setProperty(
			"--focus-counter-color",
			counterColor || "var(--accent)",
		);
		return true;
	}

	function stopRestoreWatch() {
		root.clearTimeout(restoreTimer);
		restoreTimer = null;
		restoreObserver?.disconnect();
		restoreObserver = null;
	}

	function openFocusMode(source, options = {}) {
		if (!source?.dataset.focusId) return;
		const elements = focusElements();
		if (!elements.view) return;

		stopRestoreWatch();
		activeCounterId = source.dataset.focusId;
		activeTrigger = options.trigger || null;
		storeCounterId(activeCounterId);
		syncFocusedCounter();
		root.document.documentElement.removeAttribute("data-focus-restore");
		root.document.body.classList.add("focus-mode-active");
		elements.view.removeAttribute("inert");
		elements.view.setAttribute("aria-hidden", "false");
		root.clearInterval(syncTimer);
		syncTimer = root.setInterval(syncFocusedCounter, SYNC_INTERVAL_MS);
		root.requestAnimationFrame(() => elements.close?.focus({ preventScroll: true }));
	}

	function closeFocusMode(options = {}) {
		const { restoreFocus = true } = options;
		const elements = focusElements();
		soundController?.pause();
		stopRestoreWatch();
		root.clearInterval(syncTimer);
		syncTimer = null;
		activeCounterId = "";
		storeCounterId("");
		root.document.documentElement.removeAttribute("data-focus-restore");
		root.document.body.classList.remove("focus-mode-active");
		elements.view?.setAttribute("aria-hidden", "true");
		elements.view?.setAttribute("inert", "");
		if (restoreFocus && activeTrigger?.isConnected) {
			activeTrigger.focus({ preventScroll: true });
		}
		activeTrigger = null;
	}

	function restoreFocusMode(counterId) {
		const elements = focusElements();
		if (!elements.view || !counterId) {
			root.document.documentElement.removeAttribute("data-focus-restore");
			return;
		}
		elements.title.textContent = "Restaurando contador";
		elements.pre.textContent = "Modo de foco";
		elements.main.textContent = "carregando...";
		elements.post.textContent = "Aguardando os dados desta sessão.";
		elements.view.removeAttribute("inert");
		elements.view.setAttribute("aria-hidden", "false");

		const tryRestore = () => {
			const source = counterElement(counterId);
			if (!source) return false;
			openFocusMode(source);
			return true;
		};
		if (tryRestore()) return;

		restoreObserver = new MutationObserver(tryRestore);
		restoreObserver.observe(root.document.body, { childList: true, subtree: true });
		restoreTimer = root.setTimeout(
			() => closeFocusMode({ restoreFocus: false }),
			RESTORE_TIMEOUT_MS,
		);
	}

	function initialize() {
		if (initialized) return;
		initialized = true;
		const elements = focusElements();
		if (!elements.view) return;
		initializeSoundscape();

		root.document.addEventListener("click", (event) => {
			const trigger = event.target.closest?.("[data-focus-trigger]");
			if (!trigger) return;
			const source = trigger.closest("[data-focus-id]");
			if (source) openFocusMode(source, { trigger });
		});
		elements.close.addEventListener("click", () => closeFocusMode());
		root.document.addEventListener("keydown", (event) => {
			if (
				event.key === "Escape" &&
				(activeCounterId ||
					root.document.documentElement.dataset.focusRestore === "pending")
			) {
				event.preventDefault();
				closeFocusMode();
			}
		});
		restoreFocusMode(storedCounterId());
	}

	root.TimekeeperFocus = {
		close: closeFocusMode,
		open(counterId) {
			const source = counterElement(counterId);
			if (source) openFocusMode(source);
		},
		sync: syncFocusedCounter,
		sound: {
			pause() {
				soundController?.pause();
			},
		},
	};

	if (root.document.readyState === "loading") {
		root.document.addEventListener("DOMContentLoaded", initialize, { once: true });
	} else {
		initialize();
	}
})(window);
