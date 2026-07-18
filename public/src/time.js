(function exposeTimekeeperTime(root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) module.exports = api;
	if (root) {
		root.TimekeeperTime = api;
		Object.assign(root, api);
	}
})(typeof globalThis !== "undefined" ? globalThis : this, function createTimeApi() {
	const milliseconds = {
		second: 1000,
		minute: 60000,
		hour: 3600000,
		day: 86400000,
	};

	function clamp(value) {
		return Math.max(0, Math.min(1, Number(value) || 0));
	}

	function findNext(dates, actualTime = new Date()) {
		return dates.find((date) => date instanceof Date && date > actualTime) || null;
	}

	function intervalBreakdown(howLong) {
		let remaining = Math.max(0, Number(howLong) || 0);
		const dias = Math.floor(remaining / milliseconds.day);
		remaining %= milliseconds.day;
		const horas = Math.floor(remaining / milliseconds.hour);
		remaining %= milliseconds.hour;
		const minutos = Math.floor(remaining / milliseconds.minute);
		remaining %= milliseconds.minute;
		return {
			dias,
			horas,
			minutos,
			segundos: Math.floor(remaining / milliseconds.second),
		};
	}

	function formatInterval(interval) {
		const parts = [];
		if (interval.dias) {
			parts.push(`${interval.dias} ${interval.dias === 1 ? "dia" : "dias"}`);
		}
		if (interval.horas) {
			parts.push(`${interval.horas} ${interval.horas === 1 ? "hora" : "horas"}`);
		}
		if (interval.minutos) {
			parts.push(
				`${interval.minutos} ${interval.minutos === 1 ? "minuto" : "minutos"}`,
			);
		}
		parts.push(
			`${interval.segundos} ${interval.segundos === 1 ? "segundo" : "segundos"}`,
		);
		return parts.join(",<br>");
	}

	function dateAtTime(date, time) {
		const parts = String(time || "00:00").split(":");
		const result = new Date(date);
		result.setHours(Number(parts[0]) || 0, Number(parts[1]) || 0, 0, 0);
		return result;
	}

	function recurringRangeForDate(date, startTime, endTime) {
		const start = dateAtTime(date, startTime);
		const end = dateAtTime(date, endTime);
		if (end <= start) end.setDate(end.getDate() + 1);
		return { start, end };
	}

	function resolveRecurringState(counter, actualTime) {
		const now = new Date(actualTime);
		const days = Array.isArray(counter.daysOfWeek)
			? [...new Set(counter.daysOfWeek.map(Number))].filter(
					(day) => Number.isInteger(day) && day >= 0 && day <= 6,
				)
			: [];
		let active = null;
		let previous = null;
		let next = null;

		for (let offset = -8; offset <= 8; offset += 1) {
			const occurrenceDate = new Date(now);
			occurrenceDate.setDate(now.getDate() + offset);
			occurrenceDate.setHours(0, 0, 0, 0);
			if (!days.includes(occurrenceDate.getDay())) continue;
			const range = recurringRangeForDate(
				occurrenceDate,
				counter.startTime,
				counter.endTime,
			);
			if (range.start <= now && now < range.end) active = range;
			if (range.end <= now && (!previous || range.end > previous.end)) {
				previous = range;
			}
			if (range.start > now && (!next || range.start < next.start)) {
				next = range;
			}
		}

		if (active) {
			return {
				phase: "active",
				target: active.end,
				progress: clamp((now - active.start) / (active.end - active.start)),
			};
		}
		if (next) {
			const waitStart = previous ? previous.end : now;
			return {
				phase: "upcoming",
				target: next.start,
				progress: clamp((now - waitStart) / (next.start - waitStart)),
			};
		}
		return { phase: "upcoming", target: now, progress: 0 };
	}

	function resolveCounterState(counter, actualTime) {
		const now = new Date(actualTime);
		if ((counter.type || "fixed") === "recurring") {
			return resolveRecurringState(counter, now);
		}
		const start = new Date(counter.startAt);
		const end = new Date(counter.endAt);
		if (
			Number.isNaN(start.getTime()) ||
			Number.isNaN(end.getTime()) ||
			end <= start
		) {
			return { phase: "invalid", target: now, progress: 0 };
		}
		return {
			phase: "fixed",
			target: end,
			progress: clamp((now - start) / (end - start)),
		};
	}

	function periodPercentage(dates, actualTime) {
		const nextIndex = dates.findIndex((date) => date > actualTime);
		if (nextIndex === -1) return dates.length ? 1 : 0;
		if (nextIndex === 0) return 0;
		return clamp(
			(actualTime - dates[nextIndex - 1]) /
				(dates[nextIndex] - dates[nextIndex - 1]),
		);
	}

	return {
		clamp,
		dateAtTime,
		findNext,
		formatInterval,
		intervalBreakdown,
		milliseconds,
		periodPercentage,
		recurringRangeForDate,
		resolveCounterState,
		resolveRecurringState,
	};
});

