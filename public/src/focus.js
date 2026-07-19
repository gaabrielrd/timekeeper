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
			checklist: root.document.querySelector("#focus-mode-checklist"),
			progress: root.document.querySelector("#focus-mode-progress"),
		};
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
	};

	if (root.document.readyState === "loading") {
		root.document.addEventListener("DOMContentLoaded", initialize, { once: true });
	} else {
		initialize();
	}
})(window);
