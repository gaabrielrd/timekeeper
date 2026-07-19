const test = require("node:test");
const assert = require("node:assert/strict");
const {
	buildDueCandidates,
	isQuietAt,
	notificationJobId,
	validTimeZone,
} = require("../src/push-domain.js");

const ZONE = "America/Sao_Paulo";

function settings(overrides = {}) {
	return {
		notificationsEnabled: true,
		notificationLeadMinutes: [15],
		notificationSources: {
			workday: true,
			payment: true,
			holiday: true,
			counters: true,
		},
		notificationQuietHours: {
			enabled: false,
			startTime: "22:00",
			endTime: "07:00",
		},
		...overrides,
	};
}

test("valida fusos IANA sem aceitar nomes inventados", () => {
	assert.equal(validTimeZone(ZONE), true);
	assert.equal(validTimeZone("Brasil/Sao_Paulo/qualquer"), false);
});

test("job id é determinístico e muda por dispositivo ou antecedência", () => {
	const candidate = {
		occurrenceId: "payment:payment-1:123",
		edge: "start",
		leadMinutes: 15,
	};
	const first = notificationJobId("alice", "device-a", candidate);
	assert.equal(first, notificationJobId("alice", "device-a", candidate));
	assert.notEqual(first, notificationJobId("alice", "device-b", candidate));
	assert.notEqual(
		first,
		notificationJobId("alice", "device-a", { ...candidate, leadMinutes: 60 }),
	);
	assert.match(first, /^[a-f0-9]{64}$/);
});

test("calendário civil é materializado no fuso do dispositivo", () => {
	const nowMs = Date.parse("2026-08-05T14:45:00.000Z");
	const candidates = buildDueCandidates(
		{
			payments: [{ id: "payment-2026-08-05", dateTime: "2026-08-05T12:00:00" }],
			settings: settings(),
			timeZone: ZONE,
		},
		{ nowMs },
	);
	assert.equal(candidates.length, 1);
	assert.equal(candidates[0].sourceType, "payment");
	assert.equal(candidates[0].eventAtMs, Date.parse("2026-08-05T15:00:00.000Z"));
	assert.equal(candidates[0].scheduledAtMs, nowMs);
});

test("recorrência que atravessa meia-noite produz início e fim idempotentes", () => {
	const nowMs = Date.parse("2026-08-04T23:45:00.000Z");
	const candidates = buildDueCandidates(
		{
			counters: [
				{
					id: "night",
					name: "Plantão",
					type: "recurring",
					startTime: "21:00",
					endTime: "02:00",
					daysOfWeek: [2],
				},
			],
			settings: settings({ notificationLeadMinutes: [15, 60] }),
			timeZone: ZONE,
		},
		{ nowMs },
	);
	assert.equal(candidates.length, 1);
	assert.equal(candidates[0].edge, "start");
	assert.equal(candidates[0].leadMinutes, 15);
	assert.match(candidates[0].occurrenceId, /^recurring:night:/);
});

test("fontes desativadas não geram entrega", () => {
	const nowMs = Date.parse("2026-08-05T14:45:00.000Z");
	const candidates = buildDueCandidates(
		{
			payments: [{ dateTime: "2026-08-05T12:00:00" }],
			settings: settings({
				notificationSources: {
					workday: true,
					payment: false,
					holiday: true,
					counters: true,
				},
			}),
			timeZone: ZONE,
		},
		{ nowMs },
	);
	assert.deepEqual(candidates, []);
});

test("horário de silêncio atravessa meia-noite no fuso salvo", () => {
	const quiet = { enabled: true, startTime: "22:00", endTime: "07:00" };
	assert.equal(isQuietAt(Date.parse("2026-08-05T02:30:00.000Z"), quiet, ZONE), true);
	assert.equal(isQuietAt(Date.parse("2026-08-05T15:00:00.000Z"), quiet, ZONE), false);
});

test("janela de quinze minutos recupera execução atrasada sem eventos antigos", () => {
	const eventAtMs = Date.parse("2026-08-05T15:00:00.000Z");
	const input = {
		payments: [{ dateTime: "2026-08-05T12:00:00" }],
		settings: settings(),
		timeZone: ZONE,
	};
	assert.equal(
		buildDueCandidates(input, { nowMs: eventAtMs - 10 * 60 * 1000 }).length,
		1,
	);
	assert.equal(buildDueCandidates(input, { nowMs: eventAtMs + 60 * 1000 }).length, 0);
});
