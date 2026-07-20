const test = require("node:test");
const assert = require("node:assert/strict");
const {
	FREE_AI_IMAGE_LIMIT,
	PREMIUM_MONTHLY_AI_IMAGE_LIMIT,
	getCurrentYearMonth,
	calculateAiQuota,
} = require("../src/ai-generator.js");

test("calcula formato YYYY-MM corretamente", () => {
	const fixedDate = new Date("2026-07-19T12:00:00.000Z");
	assert.equal(getCurrentYearMonth(fixedDate), "2026-07");
});

test("conta Free possui limite total de 8 imagens", () => {
	const quotaNew = calculateAiQuota({ tier: "free" });
	assert.equal(quotaNew.tier, "free");
	assert.equal(quotaNew.limit, 8);
	assert.equal(quotaNew.used, 0);
	assert.equal(quotaNew.remaining, 8);
	assert.equal(quotaNew.canGenerate, true);

	const quotaUsed = calculateAiQuota({ tier: "free", aiGenerationsTotal: 5 });
	assert.equal(quotaUsed.used, 5);
	assert.equal(quotaUsed.remaining, 3);
	assert.equal(quotaUsed.canGenerate, true);

	const quotaExhausted = calculateAiQuota({ tier: "free", aiGenerationsTotal: 8 });
	assert.equal(quotaExhausted.remaining, 0);
	assert.equal(quotaExhausted.canGenerate, false);
});

test("conta Premium possui 40 imagens por mês com renovação mensal", () => {
	const now = new Date("2026-07-19T12:00:00.000Z");
	const quotaNewMonth = calculateAiQuota({
		tier: "premium",
		aiGenerationsMonth: "2026-06",
		aiGenerationsMonthCount: 35,
	}, now);

	assert.equal(quotaNewMonth.tier, "premium");
	assert.equal(quotaNewMonth.limit, 40);
	assert.equal(quotaNewMonth.used, 0);
	assert.equal(quotaNewMonth.remaining, 40);
	assert.equal(quotaNewMonth.canGenerate, true);

	const quotaCurrentMonth = calculateAiQuota({
		tier: "premium",
		aiGenerationsMonth: "2026-07",
		aiGenerationsMonthCount: 38,
	}, now);

	assert.equal(quotaCurrentMonth.used, 38);
	assert.equal(quotaCurrentMonth.remaining, 2);
	assert.equal(quotaCurrentMonth.canGenerate, true);

	const quotaExhaustedMonth = calculateAiQuota({
		tier: "premium",
		aiGenerationsMonth: "2026-07",
		aiGenerationsMonthCount: 40,
	}, now);

	assert.equal(quotaExhaustedMonth.remaining, 0);
	assert.equal(quotaExhaustedMonth.canGenerate, false);
});
