const FREE_AI_IMAGE_LIMIT = 8;
const PREMIUM_MONTHLY_AI_IMAGE_LIMIT = 40;

function getCurrentYearMonth(date = new Date()) {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

function calculateAiQuota(userDocData = {}, now = new Date()) {
	const tier = userDocData.tier === "premium" ? "premium" : "free";
	const currentMonth = getCurrentYearMonth(now);

	if (tier === "free") {
		const used = typeof userDocData.aiGenerationsTotal === "number"
			? userDocData.aiGenerationsTotal
			: 0;
		const limit = FREE_AI_IMAGE_LIMIT;
		const remaining = Math.max(0, limit - used);
		return {
			tier,
			used,
			limit,
			remaining,
			canGenerate: remaining > 0,
			resetType: "lifetime",
		};
	}

	const storedMonth = typeof userDocData.aiGenerationsMonth === "string"
		? userDocData.aiGenerationsMonth
		: "";
	const isSameMonth = storedMonth === currentMonth;
	const used = isSameMonth && typeof userDocData.aiGenerationsMonthCount === "number"
		? userDocData.aiGenerationsMonthCount
		: 0;
	const limit = PREMIUM_MONTHLY_AI_IMAGE_LIMIT;
	const remaining = Math.max(0, limit - used);

	return {
		tier,
		used,
		limit,
		remaining,
		currentMonth,
		canGenerate: remaining > 0,
		resetType: "monthly",
	};
}

module.exports = {
	FREE_AI_IMAGE_LIMIT,
	PREMIUM_MONTHLY_AI_IMAGE_LIMIT,
	getCurrentYearMonth,
	calculateAiQuota,
};
