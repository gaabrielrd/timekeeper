const test = require("node:test");
const assert = require("node:assert/strict");

const {
	findNext,
	formatInterval,
	intervalBreakdown,
	periodPercentage,
	recurringRangeForDate,
	resolveCounterState,
	resolveRecurringState,
} = require("../../public/src/time.js");

function localDate(year, month, day, hour = 0, minute = 0, second = 0) {
	return new Date(year, month - 1, day, hour, minute, second, 0);
}

test("intervalBreakdown limita valores negativos e separa as unidades", () => {
	assert.deepEqual(intervalBreakdown(-1000), {
		dias: 0,
		horas: 0,
		minutos: 0,
		segundos: 0,
	});
	assert.deepEqual(intervalBreakdown(90061000), {
		dias: 1,
		horas: 1,
		minutos: 1,
		segundos: 1,
	});
});

test("formatInterval aplica singular, plural e quebras esperadas", () => {
	assert.equal(
		formatInterval({ dias: 1, horas: 2, minutos: 1, segundos: 4 }),
		"1 dia,<br>2 horas,<br>1 minuto,<br>4 segundos",
	);
	assert.equal(
		formatInterval({ dias: 0, horas: 0, minutos: 0, segundos: 1 }),
		"1 segundo",
	);
});

test("findNext seleciona o próximo evento e retorna null após o calendário", () => {
	const dates = [localDate(2026, 7, 1), localDate(2026, 8, 1)];
	assert.equal(findNext(dates, localDate(2026, 7, 15)), dates[1]);
	assert.equal(findNext(dates, localDate(2026, 9, 1)), null);
});

test("periodPercentage cobre antes, entre e depois dos eventos", () => {
	const dates = [localDate(2026, 7, 1), localDate(2026, 7, 11)];
	assert.equal(periodPercentage(dates, localDate(2026, 6, 1)), 0);
	assert.equal(periodPercentage(dates, localDate(2026, 7, 6)), 0.5);
	assert.equal(periodPercentage(dates, localDate(2026, 7, 12)), 1);
	assert.equal(periodPercentage([], localDate(2026, 7, 12)), 0);
});

test("contador fixo calcula progresso e rejeita intervalo inválido", () => {
	const counter = {
		type: "fixed",
		startAt: localDate(2026, 7, 1, 8).toISOString(),
		endAt: localDate(2026, 7, 1, 10).toISOString(),
	};
	const state = resolveCounterState(counter, localDate(2026, 7, 1, 9));
	assert.equal(state.phase, "fixed");
	assert.equal(state.progress, 0.5);
	assert.equal(state.target.getTime(), localDate(2026, 7, 1, 10).getTime());

	const invalid = resolveCounterState(
		{ ...counter, endAt: counter.startAt },
		localDate(2026, 7, 1, 9),
	);
	assert.equal(invalid.phase, "invalid");
	assert.equal(invalid.progress, 0);
});

test("recorrência fica ativa durante o evento e aponta para o fim", () => {
	const state = resolveRecurringState(
		{
			type: "recurring",
			startTime: "08:00",
			endTime: "17:00",
			daysOfWeek: [1, 2, 3, 4, 5],
		},
		localDate(2026, 7, 17, 12),
	);
	assert.equal(state.phase, "active");
	assert.equal(state.target.getTime(), localDate(2026, 7, 17, 17).getTime());
	assert.ok(state.progress > 0.44 && state.progress < 0.45);
});

test("recorrência fora do período encontra o próximo ciclo", () => {
	const state = resolveRecurringState(
		{
			type: "recurring",
			startTime: "08:00",
			endTime: "17:00",
			daysOfWeek: [1, 2, 3, 4, 5],
		},
		localDate(2026, 7, 18, 12),
	);
	assert.equal(state.phase, "upcoming");
	assert.equal(state.target.getTime(), localDate(2026, 7, 20, 8).getTime());
});

test("recorrência atravessa a meia-noite sem perder a ocorrência", () => {
	const range = recurringRangeForDate(
		localDate(2026, 7, 17),
		"22:00",
		"06:00",
	);
	assert.equal(range.end.getTime(), localDate(2026, 7, 18, 6).getTime());

	const state = resolveRecurringState(
		{
			type: "recurring",
			startTime: "22:00",
			endTime: "06:00",
			daysOfWeek: [5],
		},
		localDate(2026, 7, 18, 2),
	);
	assert.equal(state.phase, "active");
	assert.equal(state.target.getTime(), localDate(2026, 7, 18, 6).getTime());
});

test("dias inválidos e duplicados não quebram a resolução", () => {
	const state = resolveRecurringState(
		{
			type: "recurring",
			startTime: "08:00",
			endTime: "09:00",
			daysOfWeek: [5, 5, -1, 8, "x"],
		},
		localDate(2026, 7, 17, 8, 30),
	);
	assert.equal(state.phase, "active");
});

