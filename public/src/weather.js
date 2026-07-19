(function exposeTimekeeperWeather(root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) module.exports = api;
	if (root) root.TimekeeperWeather = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createWeatherApi() {
	const SCRIPT_ID = "weatherwidget-io-js";
	const SCRIPT_SRC = "https://weatherwidget.io/js/widget.min.js";
	const MAX_WIDGETS = 5;
	const FORECAST_URL_PATTERN =
		/^https:\/\/forecast7\.com\/[a-z]{2}\/[a-z0-9-]+\/[a-z0-9-]+\/$/;
	const DEFAULT_WIDGETS = Object.freeze([
		Object.freeze({
			id: "indaial",
			label1: "INDAIAL",
			label2: "SANTA CATARINA",
			forecastUrl: "https://forecast7.com/pt/n26d90n49d24/indaial/",
			enabled: true,
		}),
		Object.freeze({
			id: "maringa",
			label1: "MARINGÁ",
			label2: "PARANÁ",
			forecastUrl: "https://forecast7.com/pt/n23d42n51d93/maringa/",
			enabled: true,
		}),
		Object.freeze({
			id: "sao-paulo",
			label1: "SÃO PAULO",
			label2: "SÃO PAULO",
			forecastUrl: "https://forecast7.com/pt/n23d55n46d63/sao-paulo/",
			enabled: true,
		}),
	]);

	function cloneDefaults() {
		return DEFAULT_WIDGETS.map((widget) => ({ ...widget }));
	}

	function createWidgetId() {
		return globalThis.crypto?.randomUUID?.() || `weather-${Date.now()}`;
	}

	function normalizeWidget(widget, fallbackId = createWidgetId()) {
		if (!widget || typeof widget !== "object") return null;
		const label1 = String(widget.label1 || "").trim().slice(0, 40);
		const label2 = String(widget.label2 || "").trim().slice(0, 40);
		const forecastUrl = String(widget.forecastUrl || "").trim().toLowerCase();
		if (!label1 || !label2 || !FORECAST_URL_PATTERN.test(forecastUrl)) {
			return null;
		}
		const requestedId = String(widget.id || fallbackId).trim().slice(0, 100);
		return {
			id: requestedId || String(fallbackId).slice(0, 100),
			label1,
			label2,
			forecastUrl,
			enabled: widget.enabled !== false,
		};
	}

	function normalizeWidgets(value, useDefaults = true) {
		if (!Array.isArray(value)) return useDefaults ? cloneDefaults() : [];
		const ids = new Set();
		return value
			.slice(0, MAX_WIDGETS)
			.map((widget) => normalizeWidget(widget))
			.filter((widget) => {
				if (!widget || ids.has(widget.id)) return false;
				ids.add(widget.id);
				return true;
			});
	}

	function weatherWidgets(documentRef) {
		return Array.from(documentRef?.querySelectorAll?.(".weatherwidget-io") || []);
	}

	function applyColors(documentRef, primary, secondary) {
		weatherWidgets(documentRef).forEach((widget) => {
			widget.dataset.accent = secondary;
			widget.dataset.suncolor = primary;
		});
	}

	function load(documentRef, restart = false) {
		if (!documentRef?.body || !documentRef.createElement) return null;
		const existing = documentRef.getElementById(SCRIPT_ID);
		if (existing && !restart) return existing;
		if (existing) existing.remove();
		const script = documentRef.createElement("script");
		script.src = SCRIPT_SRC;
		script.id = SCRIPT_ID;
		script.async = true;
		documentRef.body.appendChild(script);
		return script;
	}

	function widgetAnchor(documentRef, widget, colors) {
		const anchor = documentRef.createElement("a");
		anchor.className = "weatherwidget-io";
		anchor.href = widget.forecastUrl;
		anchor.textContent = `${widget.label1} · ${widget.label2}`;
		Object.assign(anchor.dataset, {
			label_1: widget.label1,
			label_2: widget.label2,
			font: "Roboto",
			icons: "Climacons Animated",
			days: "7",
			theme: "pure",
			basecolor: "#17151c",
			accent: colors.secondary,
			textcolor: "#f7f5fa",
			highcolor: "#f7f5fa",
			lowcolor: "#9993a3",
			suncolor: colors.primary,
			cloudfill: "#302c39",
		});
		return anchor;
	}

	function observeCard(card) {
		const status = card.querySelector(".forecast-state");
		const sync = () => {
			if (!card.querySelector("iframe")) return;
			card.classList.remove("is-loading", "is-error");
			if (status) status.hidden = true;
			observer?.disconnect();
		};
		const observer =
			typeof MutationObserver === "function"
				? new MutationObserver(sync)
				: null;
		observer?.observe(card, { childList: true, subtree: true });
		setTimeout(() => {
			if (card.querySelector("iframe")) return;
			card.classList.remove("is-loading");
			card.classList.add("is-error");
			if (status) {
				status.textContent = "Previsão indisponível.";
				status.hidden = false;
			}
			observer?.disconnect();
		}, 10000);
	}

	function render(documentRef, widgets, colors = {}) {
		const container = documentRef?.querySelector?.("#weather-forecasts");
		const empty = documentRef?.querySelector?.("#weather-empty");
		if (!container) return [];
		const normalized = normalizeWidgets(widgets);
		const enabled = normalized.filter((widget) => widget.enabled);
		const safeColors = {
			primary: colors.primary || "#a78bfa",
			secondary: colors.secondary || "#362860",
		};
		const signature = JSON.stringify([enabled, safeColors]);
		if (container.dataset.weatherSignature === signature && container.children.length) {
			load(documentRef);
			return normalized;
		}
		container.dataset.weatherSignature = signature;
		container.replaceChildren();
		if (empty) empty.hidden = enabled.length !== 0;
		for (const widget of enabled) {
			const card = documentRef.createElement("div");
			card.className = "forecast is-loading";
			card.dataset.weatherWidgetId = widget.id;
			const status = documentRef.createElement("span");
			status.className = "forecast-state";
			status.textContent = "Carregando previsão...";
			card.append(widgetAnchor(documentRef, widget, safeColors), status);
			container.append(card);
			observeCard(card);
		}
		if (enabled.length) load(documentRef, true);
		else documentRef.getElementById(SCRIPT_ID)?.remove();
		return normalized;
	}

	return {
		DEFAULT_WIDGETS,
		FORECAST_URL_PATTERN,
		MAX_WIDGETS,
		SCRIPT_ID,
		SCRIPT_SRC,
		applyColors,
		cloneDefaults,
		load,
		normalizeWidget,
		normalizeWidgets,
		render,
		weatherWidgets,
	};
});
