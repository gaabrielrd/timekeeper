/**
 * @file nlp-parser.js
 * Extractor and parser for natural language counter creation in Portuguese.
 */

(function exposeNlpParser(root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) module.exports = api;
	if (root) {
		root.NlpParser = api;
		Object.assign(root, api);
	}
})(typeof globalThis !== "undefined" ? globalThis : this, function createNlpParser() {
	const MONTHS = {
		jan: 0,
		janeiro: 0,
		fev: 1,
		fevereiro: 1,
		mar: 2,
		março: 2,
		abr: 3,
		abril: 3,
		mai: 4,
		maio: 4,
		jun: 5,
		junho: 5,
		jul: 6,
		julho: 6,
		ago: 7,
		agosto: 7,
		set: 8,
		setembro: 8,
		out: 9,
		outubro: 9,
		nov: 10,
		novembro: 10,
		dez: 11,
		dezembro: 11,
	};

	const DAYS_OF_WEEK = {
		dom: 0,
		domingo: 0,
		seg: 1,
		segunda: 1,
		ter: 2,
		terça: 2,
		terca: 2,
		qua: 3,
		quarta: 3,
		qui: 4,
		quinta: 4,
		sex: 5,
		sexta: 5,
		sab: 6,
		sáb: 6,
		sabado: 6,
		sábado: 6,
	};

	function extractTime(text) {
		// Matches "às 14:30", "as 18h", "às 09"
		const timeMatch = text.match(/(?:às|as)\s+(\d{1,2})(?::(\d{2})|h|)\b/i);
		if (timeMatch) {
			const hours = Number(timeMatch[1]);
			const minutes = timeMatch[2] ? Number(timeMatch[2]) : 0;
			return {
				timeString: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
				hours,
				minutes,
				match: timeMatch[0],
			};
		}
		return null;
	}

	function parseRecurring(text) {
		const result = { daysOfWeek: [], startTime: "09:00", endTime: "18:00" };
		const lower = text.toLowerCase();
		
		let isRecurring = false;
		
		if (lower.includes("dias de semana") || lower.includes("dia de semana")) {
			result.daysOfWeek = [1, 2, 3, 4, 5];
			isRecurring = true;
		} else if (lower.includes("fim de semana") || lower.includes("finais de semana")) {
			result.daysOfWeek = [0, 6];
			isRecurring = true;
		} else if (lower.match(/\b(todo|toda|todos as|todas as)\b/)) {
			isRecurring = true;
			for (const [key, val] of Object.entries(DAYS_OF_WEEK)) {
				if (new RegExp(`\\b${key}\\b`).test(lower)) {
					if (!result.daysOfWeek.includes(val)) result.daysOfWeek.push(val);
				}
			}
		}

		if (!isRecurring) return null;

		const time = extractTime(text);
		if (time) {
			result.startTime = time.timeString;
			// Default end time to 1 hour after start if not specified
			result.endTime = `${String((time.hours + 1) % 24).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}`;
		}

		// Clean up title
		let cleanTitle = text
			.replace(/\b(todo|toda|todos os|todas as)\s+[a-zç]+\b/i, "")
			.replace(/(?:dias de semana|fim de semana|finais de semana)/i, "")
			.replace(/(?:às|as)\s+\d{1,2}(?::\d{2}|h|)\b/i, "")
			.trim();
		
		// Remove trailing/leading prepositions or punctuation
		cleanTitle = cleanTitle.replace(/^(para|de|em)\s+/i, "").replace(/\s+(para|de|em)$/i, "").replace(/[\s,]+$/, "").trim();
		
		return {
			type: "recurring",
			title: cleanTitle || "Contador Recorrente",
			...result
		};
	}

	function parseFixed(text, referenceDate) {
		const now = referenceDate ? new Date(referenceDate) : new Date();
		const resultDate = new Date(now);
		let foundDate = false;
		
		const lower = text.toLowerCase();

		// Relative days (hoje, amanhã, depois de amanhã)
		if (lower.includes("depois de amanhã") || lower.includes("depois de amanha")) {
			resultDate.setDate(resultDate.getDate() + 2);
			foundDate = true;
		} else if (lower.includes("amanhã") || lower.includes("amanha")) {
			resultDate.setDate(resultDate.getDate() + 1);
			foundDate = true;
		} else if (lower.includes("hoje")) {
			foundDate = true;
		}
		
		// "daqui a X dias/semanas/meses"
		const relativeMatch = lower.match(/daqui a (\d+)\s+(dia|semana|mês|mes)/i);
		if (!foundDate && relativeMatch) {
			const amount = Number(relativeMatch[1]);
			const unit = relativeMatch[2];
			if (unit.startsWith("dia")) resultDate.setDate(resultDate.getDate() + amount);
			else if (unit.startsWith("semana")) resultDate.setDate(resultDate.getDate() + amount * 7);
			else if (unit.startsWith("mes") || unit.startsWith("mês")) resultDate.setMonth(resultDate.getMonth() + amount);
			foundDate = true;
		}

		// Explicit dates "dia 15 de agosto", "15/08"
		const explicitMatch1 = lower.match(/(?:dia\s+)?(\d{1,2})\s+de\s+([a-zç]+)(?:\s+de\s+(\d{4}))?/i);
		const explicitMatch2 = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
		
		if (!foundDate && explicitMatch1) {
			resultDate.setDate(Number(explicitMatch1[1]));
			const monthStr = explicitMatch1[2].toLowerCase();
			if (MONTHS[monthStr] !== undefined) {
				resultDate.setMonth(MONTHS[monthStr]);
			}
			if (explicitMatch1[3]) {
				resultDate.setFullYear(Number(explicitMatch1[3]));
			} else if (resultDate < now) {
				// If date already passed this year, assume next year
				resultDate.setFullYear(resultDate.getFullYear() + 1);
			}
			foundDate = true;
		} else if (!foundDate && explicitMatch2) {
			resultDate.setDate(Number(explicitMatch2[1]));
			resultDate.setMonth(Number(explicitMatch2[2]) - 1);
			if (explicitMatch2[3]) {
				let year = Number(explicitMatch2[3]);
				if (year < 100) year += 2000;
				resultDate.setFullYear(year);
			} else if (resultDate < now) {
				resultDate.setFullYear(resultDate.getFullYear() + 1);
			}
			foundDate = true;
		}

		if (!foundDate) return null;

		// Time
		const time = extractTime(text);
		if (time) {
			resultDate.setHours(time.hours, time.minutes, 0, 0);
		} else {
			resultDate.setHours(23, 59, 59, 999); // default to end of day
		}

		// Clean up title
		let cleanTitle = text
			.replace(/daqui a \d+\s+(dia|semana|mês|mes)(s)?/i, "")
			.replace(/(?:dia\s+)?\d{1,2}\s+de\s+[a-zç]+(?:\s+de\s+\d{4})?/i, "")
			.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/, "")
			.replace(/(^|\s)(hoje|amanhã|amanha|depois de amanhã|depois de amanha)($|\s)/i, " ")
			.replace(/(?:às|as)\s+\d{1,2}(?::\d{2}|h|)\b/i, "")
			.trim();

		cleanTitle = cleanTitle.replace(/^(para|de|em)\s+/i, "").replace(/\s+(para|de|em)$/i, "").replace(/[\s,]+$/, "").trim();

		return {
			type: "fixed",
			title: cleanTitle || "Novo Contador",
			startAtMs: now.getTime(),
			endAtMs: resultDate.getTime()
		};
	}

	function parseNaturalLanguagePrompt(text, referenceDate) {
		if (!text || typeof text !== "string") return null;
		
		const recurring = parseRecurring(text);
		if (recurring) return recurring;

		const fixed = parseFixed(text, referenceDate);
		if (fixed) return fixed;

		return {
			type: "fixed",
			title: text.trim(),
			startAtMs: Date.now(),
			endAtMs: Date.now() + 86400000 // default 24h
		};
	}

	return {
		parseNaturalLanguagePrompt,
	};
});
