(function exposeTimekeeperWeather(root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) module.exports = api;
	if (root) root.TimekeeperWeather = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createWeatherApi() {
	const SCRIPT_ID = "weatherwidget-io-js";
	const SCRIPT_SRC = "https://weatherwidget.io/js/widget.min.js";
	const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
	const MAX_WIDGETS = 5;
	const WEATHER_CONDITION_REFRESH_MS = 15 * 60 * 1000;
	const FORECAST_URL_PATTERN =
		/^https:\/\/forecast7\.com\/[a-z]{2}\/[a-z0-9-]+\/[a-z0-9-]+\/$/;
	const FORECAST_COORDINATE_PATTERN =
		/^([np]?)(\d{1,2})d(\d{2})([np]?)(\d{1,3})d(\d{2})$/;
	const conditionCache = new Map();
	const cardWidgets = new WeakMap();
	const effectObservers = new WeakMap();
	const refreshTimers = new WeakMap();
	const visibilityDocuments = new WeakSet();
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

	function forecastCoordinates(value) {
		let url;
		try {
			url = new URL(String(value || ""));
		} catch {
			return null;
		}
		if (url.protocol !== "https:" || url.hostname !== "forecast7.com") {
			return null;
		}
		const coordinateToken = url.pathname.split("/").filter(Boolean)[1] || "";
		const match = coordinateToken.match(FORECAST_COORDINATE_PATTERN);
		if (!match) return null;
		const coordinate = (sign, degrees, decimals) => {
			const valueNumber = Number(`${degrees}.${decimals}`);
			return sign === "n" ? -valueNumber : valueNumber;
		};
		const latitude = coordinate(match[1], match[2], match[3]);
		const longitude = coordinate(match[4], match[5], match[6]);
		if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
		return { latitude, longitude };
	}

	function weatherCondition(weatherCode, isDay = 1) {
		const code = Number(weatherCode);
		if (!Number.isInteger(code) || code < 0 || code > 99) return null;
		if ([95, 96, 99].includes(code)) return "storm";
		if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
		if (
			[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(
				code,
			)
		) {
			return "rain";
		}
		if ([45, 48].includes(code)) return "fog";
		if (Number(isDay) === 0 && [0, 1, 2].includes(code)) return "night";
		if ([0, 1].includes(code)) return "clear";
		return "cloudy";
	}

	function normalizeConditionPayload(payload) {
		const weatherCode = Number(payload?.current?.weather_code);
		const isDay = Number(payload?.current?.is_day);
		const condition = weatherCondition(weatherCode, isDay);
		if (!condition || ![0, 1].includes(isDay)) return null;
		return { condition, isDay, weatherCode };
	}

	function weatherRequestUrl(widget) {
		const coordinates = forecastCoordinates(widget?.forecastUrl || widget);
		if (!coordinates) return null;
		const url = new URL(OPEN_METEO_URL);
		url.searchParams.set("latitude", String(coordinates.latitude));
		url.searchParams.set("longitude", String(coordinates.longitude));
		url.searchParams.set("current", "weather_code,is_day");
		url.searchParams.set("timezone", "auto");
		url.searchParams.set("forecast_days", "1");
		return url.toString();
	}

	async function fetchCondition(widget, fetchImpl = globalThis.fetch) {
		const requestUrl = weatherRequestUrl(widget);
		if (!requestUrl || typeof fetchImpl !== "function") return null;
		try {
			const response = await fetchImpl(requestUrl, { cache: "no-store" });
			if (!response?.ok) return null;
			return normalizeConditionPayload(await response.json());
		} catch {
			return null;
		}
	}

	function cachedCondition(widget, force = false) {
		const requestUrl = weatherRequestUrl(widget);
		if (!requestUrl) return Promise.resolve(null);
		const cached = conditionCache.get(requestUrl);
		if (!force && cached && cached.expiresAt > Date.now()) {
			return cached.promise;
		}
		const promise = fetchCondition(widget);
		conditionCache.set(requestUrl, {
			expiresAt: Date.now() + WEATHER_CONDITION_REFRESH_MS,
			promise,
		});
		return promise;
	}

	function atmosphereLayer(documentRef) {
		const atmosphere = documentRef.createElement("div");
		atmosphere.className = "forecast-atmosphere";
		atmosphere.setAttribute("aria-hidden", "true");
		for (let index = 0; index < 12; index += 1) {
			const particle = documentRef.createElement("i");
			particle.style.setProperty("--particle-index", String(index));
			particle.style.setProperty(
				"--particle-x",
				`${7 + ((index * 23) % 88)}%`,
			);
			particle.style.setProperty(
				"--particle-y",
				`${12 + (index % 5) * 15}%`,
			);
			particle.style.setProperty(
				"--particle-delay",
				`${-((index * 0.73) % 6).toFixed(2)}s`,
			);
			particle.style.setProperty(
				"--rain-duration",
				`${(0.8 + (index % 5) * 0.13).toFixed(2)}s`,
			);
			particle.style.setProperty(
				"--snow-duration",
				`${(3.2 + (index % 6) * 0.48).toFixed(2)}s`,
			);
			particle.style.setProperty(
				"--star-duration",
				`${(2.8 + (index % 4) * 0.7).toFixed(2)}s`,
			);
			atmosphere.append(particle);
		}
		return atmosphere;
	}

	async function hydrateWeatherEffect(card, force = false) {
		const widget = cardWidgets.get(card);
		if (!widget || card.dataset.weatherEffectLoading === "true") return;
		if (!force && card.dataset.weatherCondition !== "pending") return;
		card.dataset.weatherEffectLoading = "true";
		const result = await cachedCondition(widget, force);
		if (!card.isConnected) return;
		delete card.dataset.weatherEffectLoading;
		if (!result) {
			card.dataset.weatherCondition = "unavailable";
			return;
		}
		card.dataset.weatherCondition = result.condition;
		card.dataset.weatherIsDay = String(result.isDay);
		card.dataset.weatherCode = String(result.weatherCode);
	}

	function setWeatherEffectPlayback(card, running) {
		const state = running ? "running" : "paused";
		const atmosphere = card.querySelector(".forecast-atmosphere");
		atmosphere?.style.setProperty("--weather-animation-state", state);
		atmosphere
			?.querySelectorAll("i")
			.forEach((particle) => (particle.style.animationPlayState = state));
	}

	function weatherEffectObserver(documentRef) {
		if (effectObservers.has(documentRef)) {
			return effectObservers.get(documentRef);
		}
		const Observer = documentRef.defaultView?.IntersectionObserver;
		if (typeof Observer !== "function") return null;
		const observer = new Observer(
			(entries) => {
				for (const entry of entries) {
					const visible = entry.isIntersecting && entry.intersectionRatio > 0;
					entry.target.dataset.weatherVisible = String(visible);
					setWeatherEffectPlayback(
						entry.target,
						visible && documentRef.visibilityState !== "hidden",
					);
					if (visible) hydrateWeatherEffect(entry.target);
				}
			},
			{ rootMargin: "0px", threshold: 0.01 },
		);
		effectObservers.set(documentRef, observer);
		return observer;
	}

	function observeWeatherEffect(documentRef, card, widget) {
		cardWidgets.set(card, widget);
		card.dataset.weatherCondition = "pending";
		card.dataset.weatherVisible = "false";
		card.prepend(atmosphereLayer(documentRef));
		const observer = weatherEffectObserver(documentRef);
		if (observer) observer.observe(card);
		else {
			card.dataset.weatherVisible = "true";
			hydrateWeatherEffect(card);
		}
	}

	function syncWeatherPageVisibility(documentRef) {
		const container = documentRef.querySelector?.("#weather-forecasts");
		const pageVisible = documentRef.visibilityState !== "hidden";
		if (container) {
			container.dataset.weatherPageVisible = String(pageVisible);
			for (const card of container.querySelectorAll?.(".forecast") || []) {
				setWeatherEffectPlayback(
					card,
					pageVisible && card.dataset.weatherVisible === "true",
				);
			}
		}
	}

	function bindWeatherPageVisibility(documentRef) {
		if (visibilityDocuments.has(documentRef)) return;
		visibilityDocuments.add(documentRef);
		documentRef.addEventListener?.("visibilitychange", () =>
			syncWeatherPageVisibility(documentRef),
		);
	}

	function stopWeatherEffects(documentRef) {
		effectObservers.get(documentRef)?.disconnect();
		effectObservers.delete(documentRef);
		const timer = refreshTimers.get(documentRef);
		if (timer != null) documentRef.defaultView?.clearInterval(timer);
		refreshTimers.delete(documentRef);
	}

	function startWeatherRefresh(documentRef) {
		const view = documentRef.defaultView;
		if (!view?.setInterval) return;
		const previous = refreshTimers.get(documentRef);
		if (previous != null) view.clearInterval(previous);
		const timer = view.setInterval(() => {
			const cards = documentRef.querySelectorAll?.(".forecast") || [];
			for (const card of cards) {
				if (card.dataset.weatherVisible === "true") {
					hydrateWeatherEffect(card, true);
				}
			}
		}, WEATHER_CONDITION_REFRESH_MS);
		refreshTimers.set(documentRef, timer);
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
		stopWeatherEffects(documentRef);
		container.dataset.weatherSignature = signature;
		container.replaceChildren();
		bindWeatherPageVisibility(documentRef);
		syncWeatherPageVisibility(documentRef);
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
			observeWeatherEffect(documentRef, card, widget);
			observeCard(card);
		}
		if (enabled.length) {
			load(documentRef, true);
			startWeatherRefresh(documentRef);
		}
		else documentRef.getElementById(SCRIPT_ID)?.remove();
		return normalized;
	}

	return {
		DEFAULT_WIDGETS,
		FORECAST_URL_PATTERN,
		MAX_WIDGETS,
		OPEN_METEO_URL,
		SCRIPT_ID,
		SCRIPT_SRC,
		applyColors,
		cloneDefaults,
		fetchCondition,
		forecastCoordinates,
		load,
		normalizeWidget,
		normalizeWidgets,
		normalizeConditionPayload,
		render,
		weatherCondition,
		weatherRequestUrl,
		weatherWidgets,
	};
});
