const test = require("node:test");
const assert = require("node:assert/strict");
const {
	buildCandidates,
	dueCandidates,
	isQuietTime,
	normalizePreferences,
} = require("../../public/src/notifications.js");

test("preferências de notificação usam defaults e allowlists", () => {
	const preferences = normalizePreferences({
		notificationsEnabled: true,
		notificationLeadMinutes: [60, 15, 15, 999],
		notificationSources: { workday: false, unknown: true },
		notificationQuietHours: {
			enabled: true,
			startTime: "25:00",
			endTime: "06:30",
		},
	});
	assert.deepEqual(preferences.notificationLeadMinutes, [15, 60]);
	assert.equal(preferences.notificationSources.workday, false);
	assert.equal(preferences.notificationSources.payment, true);
	assert.equal(preferences.notificationQuietHours.startTime, "22:00");
	assert.equal(preferences.notificationQuietHours.endTime, "06:30");
});

test("candidatos incluem início e fim com antecedências configuradas", () => {
	const startAtMs = new Date("2026-07-20T09:00:00").getTime();
	const candidates = buildCandidates(
		[
			{
				id: "fixed:focus:1",
				sourceId: "focus",
				sourceType: "fixed",
				title: "Foco",
				startAtMs,
				endAtMs: startAtMs + 3600000,
			},
		],
		{
			notificationsEnabled: true,
			notificationLeadMinutes: [0, 15],
		},
	);
	assert.equal(candidates.length, 4);
	assert.deepEqual(
		new Set(candidates.map((candidate) => candidate.edge)),
		new Set(["start", "end"]),
	);
	assert.ok(candidates.some((candidate) => candidate.scheduledAtMs === startAtMs));
});

test("fontes desativadas não produzem candidatos", () => {
	const candidates = buildCandidates(
		[
			{
				id: "holiday:1:1",
				sourceId: "1",
				sourceType: "holiday",
				title: "Feriado",
				startAtMs: Date.now() + 60000,
				endAtMs: null,
			},
		],
		{
			notificationsEnabled: true,
			notificationSources: { holiday: false },
		},
	);
	assert.deepEqual(candidates, []);
});

test("silêncio suporta intervalos que atravessam meia-noite", () => {
	const quiet = { enabled: true, startTime: "22:00", endTime: "07:00" };
	assert.equal(isQuietTime(new Date(2026, 6, 20, 23, 0), quiet), true);
	assert.equal(isQuietTime(new Date(2026, 6, 21, 6, 59), quiet), true);
	assert.equal(isQuietTime(new Date(2026, 6, 21, 12, 0), quiet), false);
});

test("janela de vencimento não repete alertas antigos", () => {
	const now = Date.now();
	assert.deepEqual(
		dueCandidates(
			[
				{ id: "old", scheduledAtMs: now - 21000 },
				{ id: "due", scheduledAtMs: now - 1000 },
				{ id: "future", scheduledAtMs: now + 1000 },
			],
			now,
		),
		[{ id: "due", scheduledAtMs: now - 1000 }],
	);
});
