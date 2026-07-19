const test = require("node:test");
const assert = require("node:assert/strict");
const {
	DASHBOARD_SECTION_IDS,
	buildCalendarProjection,
	buildOccurrences,
	buildTimelineProjection,
	filterOccurrences,
	groupOccurrences,
	normalizedOccurrence,
	timelineGroupKey,
} = require("../../public/src/occurrences.js");

test("calendário mensal cria grade civil e destaca hoje", () => {
	const projection = buildCalendarProjection(
		{
			payments: [new Date(2026, 6, 15, 0, 30)],
			counters: [
				{
					id: "release",
					name: "Release",
					type: "fixed",
					startAtMs: new Date(2026, 6, 14, 9).getTime(),
					endAtMs: new Date(2026, 6, 16, 10).getTime(),
				},
			],
		},
		{
			month: new Date(2026, 6, 1),
			actualTime: new Date(2026, 6, 15, 12),
		},
	);
	assert.equal(projection.days[0].key, "2026-06-28");
	assert.equal(projection.days.at(-1).key, "2026-08-01");
	assert.equal(projection.days.find((day) => day.isToday)?.key, "2026-07-15");
	assert.deepEqual(
		projection.days
			.filter((day) =>
				day.occurrences.some((item) => item.sourceId === "release"),
			)
			.map((day) => day.key),
		["2026-07-14", "2026-07-15", "2026-07-16"],
	);
});

test("calendário semanal usa sete dias e preserva recorrência noturna", () => {
	const projection = buildCalendarProjection(
		{
			counters: [
				{
					id: "overnight",
					name: "Plantão",
					type: "recurring",
					startTime: "22:00",
					endTime: "06:00",
					daysOfWeek: [1],
				},
			],
		},
		{
			month: new Date(2026, 6, 22, 12),
			actualTime: new Date(2026, 6, 22, 12),
			weekOnly: true,
		},
	);
	assert.equal(projection.days.length, 7);
	assert.deepEqual(
		projection.days
			.filter((day) => day.occurrences.length > 0)
			.map((day) => day.key),
		["2026-07-20", "2026-07-21"],
	);
});

test("calendário usa a data local mesmo próximo da meia-noite", () => {
	const previousTimezone = process.env.TZ;
	process.env.TZ = "America/Sao_Paulo";
	try {
		const payment = new Date(2026, 6, 15, 0, 15);
		const projection = buildCalendarProjection(
			{ payments: [payment] },
			{
				month: new Date(2026, 6, 1),
				actualTime: new Date(2026, 6, 15, 12),
			},
		);
		assert.equal(
			projection.days.find((day) => day.occurrences.length)?.key,
			"2026-07-15",
		);
	} finally {
		process.env.TZ = previousTimezone;
	}
});

test("projeção usa somente o próximo marco de cada categoria", () => {
	const from = new Date("2026-07-20T10:00:00");
	const projection = buildTimelineProjection(
		{
			payments: [
				new Date("2026-07-22T12:00:00"),
				new Date("2026-08-05T12:00:00"),
			],
			holidays: [
				new Date("2026-07-30T00:00:00"),
				new Date("2026-09-07T00:00:00"),
			],
			counters: [
				{
					id: "delivery",
					name: "Entrega",
					type: "fixed",
					startAtMs: new Date("2026-07-25T09:00:00").getTime(),
					endAtMs: new Date("2026-07-25T10:00:00").getTime(),
				},
			],
		},
		{ from },
	);
	assert.deepEqual(
		projection.anchors.map((item) => item.sourceType),
		["payment", "holiday", "fixed"],
	);
	assert.equal(
		projection.toAtMs,
		new Date("2026-07-30T00:00:00").getTime(),
	);
	assert.equal(
		projection.occurrences.filter((item) => item.sourceType === "payment").length,
		1,
	);
	assert.equal(
		projection.occurrences.filter((item) => item.sourceType === "holiday").length,
		1,
	);
});

test("projeção cria um segmento para cada repetição até o marco final", () => {
	const projection = buildTimelineProjection(
		{
			workday: {
				startTime: "08:00",
				endTime: "17:00",
				daysOfWeek: [1, 2, 3, 4, 5],
			},
			payments: [new Date("2026-07-27T12:00:00")],
			counters: [
				{
					id: "ritual",
					name: "Ritual",
					type: "recurring",
					startTime: "09:00",
					endTime: "10:00",
					daysOfWeek: [1, 3],
				},
			],
		},
		{ from: new Date("2026-07-20T07:00:00") },
	);
	assert.equal(
		projection.occurrences.filter((item) => item.sourceId === "ritual").length,
		3,
	);
	assert.ok(
		projection.occurrences.filter((item) => item.sourceType === "workday").length > 1,
	);
});

test("categoria personalizada considera somente seu próximo contador", () => {
	const projection = buildTimelineProjection(
		{
			counters: [
				{
					id: "first",
					name: "Primeiro",
					type: "fixed",
					startAtMs: new Date("2026-07-21T09:00:00").getTime(),
					endAtMs: new Date("2026-07-21T10:00:00").getTime(),
				},
				{
					id: "later",
					name: "Posterior",
					type: "fixed",
					startAtMs: new Date("2026-08-10T09:00:00").getTime(),
					endAtMs: new Date("2026-08-10T10:00:00").getTime(),
				},
			],
		},
		{ from: new Date("2026-07-20T08:00:00") },
	);
	assert.equal(projection.anchors.length, 1);
	assert.equal(projection.anchors[0].sourceId, "first");
	assert.equal(projection.occurrences.some((item) => item.sourceId === "later"), false);
});

test("expediente define a escala quando não há outro próximo tipo", () => {
	const projection = buildTimelineProjection(
		{
			workday: {
				startTime: "08:00",
				endTime: "17:00",
				daysOfWeek: [1, 2, 3, 4, 5],
			},
		},
		{ from: new Date("2026-07-20T07:00:00") },
	);
	assert.equal(projection.anchors[0].sourceType, "workday");
	assert.equal(projection.occurrences.length, 1);
});

test("seções da dashboard possuem IDs estáveis", () => {
	assert.deepEqual(DASHBOARD_SECTION_IDS, [
		"standard",
		"custom",
		"weather",
		"timeline",
	]);
});

test("ocorrência normalizada rejeita intervalos inválidos", () => {
	assert.equal(
		normalizedOccurrence({
			sourceId: "invalid",
			sourceType: "fixed",
			start: "2026-07-20T12:00:00",
			end: "2026-07-20T11:00:00",
		}),
		null,
	);
});

test("camada temporal combina calendários e contadores em ordem estável", () => {
	const occurrences = buildOccurrences(
		{
			payments: [new Date("2026-07-21T12:00:00")],
			holidays: [new Date("2026-07-22T00:00:00")],
			counters: [
				{
					id: "release",
					name: "Release",
					type: "fixed",
					startAtMs: new Date("2026-07-20T09:00:00").getTime(),
					endAtMs: new Date("2026-07-20T10:00:00").getTime(),
				},
			],
		},
		{
			from: new Date("2026-07-20T00:00:00"),
			to: new Date("2026-07-23T00:00:00"),
		},
	);
	assert.deepEqual(
		occurrences.map((occurrence) => occurrence.sourceType),
		["fixed", "payment", "holiday"],
	);
	assert.equal(occurrences[0].editable, true);
});

test("recorrência que atravessa meia-noite gera uma única ocorrência", () => {
	const occurrences = buildOccurrences(
		{
			counters: [
				{
					id: "overnight",
					name: "Plantão",
					type: "recurring",
					startTime: "22:00",
					endTime: "06:00",
					daysOfWeek: [1],
				},
			],
		},
		{
			from: new Date("2026-07-20T00:00:00"),
			to: new Date("2026-07-21T12:00:00"),
		},
	);
	assert.equal(occurrences.length, 1);
	assert.equal(
		occurrences[0].endAtMs - occurrences[0].startAtMs,
		8 * 60 * 60 * 1000,
	);
});

test("timeline filtra fonte e horizonte sem perder evento ativo", () => {
	const occurrences = [
		{
			id: "active",
			sourceType: "workday",
			startAtMs: new Date("2026-07-20T08:00:00").getTime(),
			endAtMs: new Date("2026-07-20T17:00:00").getTime(),
		},
		{
			id: "far",
			sourceType: "holiday",
			startAtMs: new Date("2026-09-20T00:00:00").getTime(),
			endAtMs: null,
		},
	];
	const filtered = filterOccurrences(occurrences, {
		from: new Date("2026-07-20T12:00:00"),
		horizonDays: 7,
		sourceTypes: ["workday"],
	});
	assert.deepEqual(filtered.map((item) => item.id), ["active"]);
});

test("timeline agrupa hoje, amanhã, semana e datas posteriores", () => {
	const now = new Date("2026-07-20T12:00:00");
	const starts = [
		"2026-07-20T15:00:00",
		"2026-07-21T09:00:00",
		"2026-07-23T09:00:00",
		"2026-07-27T09:00:00",
	];
	const groups = groupOccurrences(
		starts.map((start, index) => ({
			id: String(index),
			startAtMs: new Date(start).getTime(),
		})),
		now,
	);
	assert.deepEqual(
		groups.map((group) => group.key),
		["today", "tomorrow", "this-week", "2026-07-27"],
	);
});

test("timeline preserva a data civil local em grupos posteriores", () => {
	const previousTimezone = process.env.TZ;
	process.env.TZ = "America/Sao_Paulo";
	try {
		assert.equal(
			timelineGroupKey(
				new Date(2026, 6, 27, 0, 30).getTime(),
				new Date(2026, 6, 20, 12),
			),
			"2026-07-27",
		);
	} finally {
		process.env.TZ = previousTimezone;
	}
});

test("horizonte avança por dias civis durante mudança de horário", () => {
	const previousTimezone = process.env.TZ;
	process.env.TZ = "America/New_York";
	try {
		const from = new Date(2025, 10, 1, 12, 0);
		const event = new Date(2025, 10, 8, 11, 30).getTime();
		const filtered = filterOccurrences(
			[{ id: "dst", sourceType: "holiday", startAtMs: event, endAtMs: null }],
			{ from, horizonDays: 7 },
		);
		assert.equal(filtered.length, 1);
	} finally {
		process.env.TZ = previousTimezone;
	}
});

test("ocorrências empatadas usam fonte e id como desempate estável", () => {
	const startAtMs = new Date("2026-07-20T09:00:00").getTime();
	const occurrences = buildOccurrences(
		{
			payments: [startAtMs],
			holidays: [startAtMs],
			counters: [
				{
					id: "a-counter",
					name: "Contador",
					type: "fixed",
					startAtMs,
					endAtMs: startAtMs + 60000,
				},
			],
		},
		{
			from: new Date("2026-07-20T00:00:00"),
			to: new Date("2026-07-21T00:00:00"),
		},
	);
	assert.deepEqual(
		occurrences.map((item) => item.sourceType),
		["fixed", "holiday", "payment"],
	);
});
