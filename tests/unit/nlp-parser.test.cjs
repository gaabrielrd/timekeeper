const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const code = fs.readFileSync(path.resolve(__dirname, "../../public/src/nlp-parser.js"), "utf8");
const context = {};
vm.runInNewContext(code, context);
const { NlpParser } = context;

test("parseNaturalLanguagePrompt: Fixed relative dates", () => {
	const refDate = new Date("2026-08-01T12:00:00.000Z"); // fixed reference
	
	const resultHoje = NlpParser.parseNaturalLanguagePrompt("Lançamento do Produto hoje às 14:00", refDate);
	assert.strictEqual(resultHoje.type, "fixed");
	assert.strictEqual(resultHoje.title, "Lançamento do Produto");
	const resDateHoje = new Date(resultHoje.endAtMs);
	assert.strictEqual(resDateHoje.getHours(), 14);
	assert.strictEqual(resDateHoje.getDate(), 1);

	const resultAmanha = NlpParser.parseNaturalLanguagePrompt("Viagem amanhã", refDate);
	assert.strictEqual(resultAmanha.type, "fixed");
	assert.strictEqual(resultAmanha.title, "Viagem");
	const resDateAmanha = new Date(resultAmanha.endAtMs);
	assert.strictEqual(resDateAmanha.getDate(), 2);
	assert.strictEqual(resDateAmanha.getHours(), 23); // default to end of day

	const resultDaqui = NlpParser.parseNaturalLanguagePrompt("Férias daqui a 2 semanas", refDate);
	assert.strictEqual(resultDaqui.type, "fixed");
	assert.strictEqual(resultDaqui.title, "Férias");
	const resDateDaqui = new Date(resultDaqui.endAtMs);
	assert.strictEqual(resDateDaqui.getDate(), 15);
});

test("parseNaturalLanguagePrompt: Fixed explicit dates", () => {
	const refDate = new Date("2026-08-01T12:00:00.000Z");

	const result1 = NlpParser.parseNaturalLanguagePrompt("Aniversário dia 15 de agosto", refDate);
	assert.strictEqual(result1.type, "fixed");
	assert.strictEqual(result1.title, "Aniversário");
	const d1 = new Date(result1.endAtMs);
	assert.strictEqual(d1.getDate(), 15);
	assert.strictEqual(d1.getMonth(), 7); // August (0-indexed)

	const result2 = NlpParser.parseNaturalLanguagePrompt("Reunião em 10/12 às 09:30", refDate);
	assert.strictEqual(result2.type, "fixed");
	assert.strictEqual(result2.title, "Reunião");
	const d2 = new Date(result2.endAtMs);
	assert.strictEqual(d2.getDate(), 10);
	assert.strictEqual(d2.getMonth(), 11);
	assert.strictEqual(d2.getHours(), 9);
	assert.strictEqual(d2.getMinutes(), 30);
});

test("parseNaturalLanguagePrompt: Recurring", () => {
	const result = NlpParser.parseNaturalLanguagePrompt("Toda sexta às 18h Happy Hour");
	assert.strictEqual(result.type, "recurring");
	assert.strictEqual(result.title, "Happy Hour");
	assert.deepStrictEqual(Array.from(result.daysOfWeek), [5]); // Sexta = 5
	assert.strictEqual(result.startTime, "18:00");
	assert.strictEqual(result.endTime, "19:00"); // default duration is 1 hour

	const result2 = NlpParser.parseNaturalLanguagePrompt("Reunião diária dias de semana às 09:00");
	assert.strictEqual(result2.type, "recurring");
	assert.strictEqual(result2.title, "Reunião diária");
	assert.deepStrictEqual(Array.from(result2.daysOfWeek), [1, 2, 3, 4, 5]);
	assert.strictEqual(result2.startTime, "09:00");
});
