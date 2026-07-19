const test = require("node:test");
const assert = require("node:assert/strict");
const {
	DEFAULT_WIDGETS,
	MAX_WIDGETS,
	fetchCondition,
	forecastCoordinates,
	normalizeWidget,
	normalizeWidgets,
	weatherCondition,
	weatherRequestUrl,
} = require("../../public/src/weather.js");

test("URL Forecast7 expõe coordenadas positivas e negativas", () => {
	assert.deepEqual(
		forecastCoordinates(
			"https://forecast7.com/pt/n26d90n49d24/indaial/",
		),
		{ latitude: -26.9, longitude: -49.24 },
	);
	assert.deepEqual(
		forecastCoordinates(
			"https://forecast7.com/en/40d71n74d01/new-york/",
		),
		{ latitude: 40.71, longitude: -74.01 },
	);
	assert.deepEqual(
		forecastCoordinates("https://forecast7.com/en/23d8190d41/dhaka/"),
		{ latitude: 23.81, longitude: 90.41 },
	);
});

test("códigos WMO mapeiam atmosferas e noite com prioridade segura", () => {
	assert.equal(weatherCondition(0, 1), "clear");
	assert.equal(weatherCondition(0, 0), "night");
	assert.equal(weatherCondition(3, 0), "cloudy");
	assert.equal(weatherCondition(45, 1), "fog");
	assert.equal(weatherCondition(63, 1), "rain");
	assert.equal(weatherCondition(75, 1), "snow");
	assert.equal(weatherCondition(95, 0), "storm");
	assert.equal(weatherCondition(120, 1), null);
});

test("consulta Open-Meteo usa somente condição atual e normaliza resposta", async () => {
	const widget = DEFAULT_WIDGETS[0];
	const requestUrl = new URL(weatherRequestUrl(widget));
	assert.equal(requestUrl.hostname, "api.open-meteo.com");
	assert.equal(requestUrl.searchParams.get("latitude"), "-26.9");
	assert.equal(requestUrl.searchParams.get("longitude"), "-49.24");
	assert.equal(requestUrl.searchParams.get("current"), "weather_code,is_day");
	const calls = [];
	const result = await fetchCondition(widget, async (url, options) => {
		calls.push({ url, options });
		return {
			ok: true,
			async json() {
				return { current: { weather_code: 82, is_day: 1 } };
			},
		};
	});
	assert.deepEqual(result, { condition: "rain", isDay: 1, weatherCode: 82 });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].options.cache, "no-store");
});

test("clima mantém as três cidades atuais como padrão", () => {
	const defaults = normalizeWidgets(undefined);
	assert.equal(defaults.length, 3);
	assert.deepEqual(
		defaults.map((widget) => widget.id),
		DEFAULT_WIDGETS.map((widget) => widget.id),
	);
	assert.notEqual(defaults[0], DEFAULT_WIDGETS[0]);
});

test("widget aceita somente URL completa do Forecast7", () => {
	assert.ok(
		normalizeWidget({
			id: "curitiba",
			label1: "CURITIBA",
			label2: "PARANÁ",
			forecastUrl: "https://forecast7.com/pt/n25d43n49d27/curitiba/",
			enabled: true,
		}),
	);
	assert.equal(
		normalizeWidget({
			label1: "EXTERNO",
			label2: "TESTE",
			forecastUrl: "https://example.com/weather/",
		}),
		null,
	);
});

test("lista limita cinco cidades e remove IDs duplicados", () => {
	const widgets = Array.from({ length: MAX_WIDGETS + 2 }, (_, index) => ({
		id: index < 2 ? "duplicado" : `city-${index}`,
		label1: `CITY ${index}`,
		label2: "TEST",
		forecastUrl: "https://forecast7.com/pt/n26d90n49d24/indaial/",
		enabled: index % 2 === 0,
	}));
	const normalized = normalizeWidgets(widgets, false);
	assert.equal(normalized.length, MAX_WIDGETS - 1);
	assert.equal(new Set(normalized.map((widget) => widget.id)).size, normalized.length);
});

test("lista vazia permanece vazia", () => {
	assert.deepEqual(normalizeWidgets([], true), []);
});

test("ID vazio recebe fallback válido", () => {
	const widget = normalizeWidget(
		{
			id: "   ",
			label1: "RECIFE",
			label2: "PERNAMBUCO",
			forecastUrl: "https://forecast7.com/pt/n8d05n34d88/recife/",
			enabled: true,
		},
		"fallback-id",
	);
	assert.equal(widget.id, "fallback-id");
});
