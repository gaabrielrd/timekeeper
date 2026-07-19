(function exposeTimekeeperOccurrences(root, factory) {
	const timeApi =
		root?.TimekeeperTime ||
		(typeof module === "object" && module.exports ? require("./time.js") : null);
	const api = factory(timeApi);
	if (typeof module === "object" && module.exports) module.exports = api;
	if (root) root.TimekeeperOccurrences = api;
})(
	typeof globalThis !== "undefined" ? globalThis : this,
	function createOccurrencesApi(timeApi) {
		const DAY_MS = timeApi?.milliseconds?.day || 86400000;
		const DASHBOARD_SECTION_IDS = Object.freeze([
			"standard",
			"custom",
			"weather",
			"timeline",
		]);

		function validDate(value) {
			const date = value instanceof Date ? new Date(value) : new Date(value);
			return Number.isNaN(date.getTime()) ? null : date;
		}

		function occurrenceId(sourceType, sourceId, startAtMs) {
			return `${sourceType}:${sourceId}:${startAtMs}`;
		}

		function normalizedOccurrence({
			sourceId,
			sourceType,
			title,
			start,
			end = null,
			color = null,
			editable = false,
		}) {
		const safeStart = validDate(start);
		const safeEnd = end == null ? null : validDate(end);
		if (!safeStart || (end != null && !safeEnd)) return null;
		const startAtMs = safeStart.getTime();
		const endAtMs = safeEnd?.getTime() ?? null;
		if (endAtMs != null && endAtMs <= startAtMs) return null;
		return {
			id: occurrenceId(sourceType, sourceId, startAtMs),
			sourceId: String(sourceId),
			sourceType,
			title: String(title || "Evento"),
			startAtMs,
			endAtMs,
			color: typeof color === "string" ? color : null,
			editable: editable === true,
		};
	}

	function localDay(value) {
		const date = validDate(value) || new Date();
		date.setHours(0, 0, 0, 0);
		return date;
	}

	function localDateKey(value) {
		const date = localDay(value);
		return [
			date.getFullYear(),
			String(date.getMonth() + 1).padStart(2, "0"),
			String(date.getDate()).padStart(2, "0"),
		].join("-");
	}

	function eachLocalDay(from, to, callback) {
		const cursor = localDay(from);
		const last = localDay(to);
		while (cursor <= last) {
			callback(new Date(cursor));
			cursor.setDate(cursor.getDate() + 1);
		}
	}

	function overlapsWindow(occurrence, fromMs, toMs) {
		const endAtMs = occurrence.endAtMs ?? occurrence.startAtMs;
		return endAtMs >= fromMs && occurrence.startAtMs <= toMs;
	}

	function calendarOccurrences(dates, sourceType, title, fromMs, toMs) {
		return (Array.isArray(dates) ? dates : [])
			.map((date, index) =>
				normalizedOccurrence({
					sourceId: `${sourceType}-${index}`,
					sourceType,
					title,
					start: date,
				}),
			)
			.filter(
				(occurrence) =>
					occurrence && overlapsWindow(occurrence, fromMs, toMs),
			);
	}

	function recurringOccurrences(
		counter,
		sourceType,
		title,
		fromMs,
		toMs,
		editable,
	) {
		if (!timeApi?.recurringRangeForDate) return [];
		const days = new Set(
			(Array.isArray(counter?.daysOfWeek) ? counter.daysOfWeek : [])
				.map(Number)
				.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
		);
		const occurrences = [];
		eachLocalDay(fromMs - DAY_MS, toMs, (date) => {
			if (!days.has(date.getDay())) return;
			const range = timeApi.recurringRangeForDate(
				date,
				counter.startTime,
				counter.endTime,
			);
			const occurrence = normalizedOccurrence({
				sourceId: counter.id || sourceType,
				sourceType,
				title,
				start: range.start,
				end: range.end,
				color: counter.color,
				editable,
			});
			if (occurrence && overlapsWindow(occurrence, fromMs, toMs)) {
				occurrences.push(occurrence);
			}
		});
		return occurrences;
	}

	function workdayOccurrences(workday, fromMs, toMs) {
		if (!workday) return [];
		return recurringOccurrences(
			{ ...workday, id: "workday" },
			"workday",
			"Expediente",
			fromMs,
			toMs,
			false,
		);
	}

	function counterOccurrences(counters, fromMs, toMs) {
		return (Array.isArray(counters) ? counters : []).flatMap((counter) => {
			if (counter?.type === "recurring") {
				return recurringOccurrences(
					counter,
					"recurring",
					counter.name,
					fromMs,
					toMs,
					true,
				);
			}
			const occurrence = normalizedOccurrence({
				sourceId: counter?.id || "fixed",
				sourceType: "fixed",
				title: counter?.name,
				start: Number.isInteger(counter?.startAtMs)
					? counter.startAtMs
					: counter?.startAt,
				end: Number.isInteger(counter?.endAtMs)
					? counter.endAtMs
					: counter?.endAt,
				color: counter?.color,
				editable: true,
			});
			return occurrence && overlapsWindow(occurrence, fromMs, toMs)
				? [occurrence]
				: [];
		});
	}

	function buildOccurrences(
		{
			workday = null,
			payments = [],
			holidays = [],
			counters = [],
		} = {},
		{ from = new Date(), to = new Date(Date.now() + 90 * DAY_MS) } = {},
	) {
		const fromDate = validDate(from);
		const toDate = validDate(to);
		if (!fromDate || !toDate || toDate < fromDate) return [];
		const fromMs = fromDate.getTime();
		const toMs = toDate.getTime();
		return [
			...workdayOccurrences(workday, fromMs, toMs),
			...calendarOccurrences(
				payments,
				"payment",
				"Pagamento",
				fromMs,
				toMs,
			),
			...calendarOccurrences(
				holidays,
				"holiday",
				"Feriado",
				fromMs,
				toMs,
			),
			...counterOccurrences(counters, fromMs, toMs),
		].sort(
			(first, second) =>
				first.startAtMs - second.startAtMs ||
				first.sourceType.localeCompare(second.sourceType) ||
				first.sourceId.localeCompare(second.sourceId),
		);
	}

	function nextCalendarOccurrence(dates, sourceType, title, fromMs) {
		return (Array.isArray(dates) ? dates : [])
			.map((date, index) =>
				normalizedOccurrence({
					sourceId: `${sourceType}-${index}`,
					sourceType,
					title,
					start: date,
				}),
			)
			.filter((occurrence) => occurrence && occurrence.startAtMs >= fromMs)
			.sort((first, second) => first.startAtMs - second.startAtMs)[0] || null;
	}

	function nextCounterOccurrence(counter, fromMs, recurrenceScanEndMs) {
		if (counter?.type === "recurring") {
			return recurringOccurrences(
				counter,
				"recurring",
				counter.name,
				fromMs,
				recurrenceScanEndMs,
				true,
			)[0] || null;
		}
		const occurrence = normalizedOccurrence({
			sourceId: counter?.id || "fixed",
			sourceType: "fixed",
			title: counter?.name,
			start: Number.isInteger(counter?.startAtMs)
				? counter.startAtMs
				: counter?.startAt,
			end: Number.isInteger(counter?.endAtMs)
				? counter.endAtMs
				: counter?.endAt,
			color: counter?.color,
			editable: true,
		});
		return occurrence && (occurrence.endAtMs ?? occurrence.startAtMs) >= fromMs
			? occurrence
			: null;
	}

	function occurrenceBoundary(occurrence) {
		return Math.max(occurrence.startAtMs, occurrence.endAtMs ?? occurrence.startAtMs);
	}

	function projectionAnchorMatch(occurrence, anchor) {
		if (!anchor || occurrence.sourceType !== anchor.sourceType) return false;
		if (occurrence.startAtMs !== anchor.startAtMs) return false;
		return ["payment", "holiday", "workday"].includes(anchor.sourceType) ||
			occurrence.sourceId === anchor.sourceId;
	}

	function buildTimelineProjection(
		{
			workday = null,
			payments = [],
			holidays = [],
			counters = [],
		} = {},
		{ from = new Date() } = {},
	) {
		const fromDate = validDate(from);
		if (!fromDate) return { fromAtMs: null, toAtMs: null, anchors: [], occurrences: [] };
		const fromMs = fromDate.getTime();
		const recurrenceScanEnd = new Date(fromDate);
		recurrenceScanEnd.setDate(recurrenceScanEnd.getDate() + 8);

		const nextPayment = nextCalendarOccurrence(
			payments,
			"payment",
			"Pagamento",
			fromMs,
		);
		const nextHoliday = nextCalendarOccurrence(
			holidays,
			"holiday",
			"Feriado",
			fromMs,
		);
		const nextCustom = (Array.isArray(counters) ? counters : [])
			.map((counter) =>
				nextCounterOccurrence(counter, fromMs, recurrenceScanEnd.getTime()),
			)
			.filter(Boolean)
			.sort(
				(first, second) =>
					Math.max(first.startAtMs, fromMs) - Math.max(second.startAtMs, fromMs) ||
					occurrenceBoundary(first) - occurrenceBoundary(second),
			)[0] || null;
		const nextWorkday = workdayOccurrences(
			workday,
			fromMs,
			recurrenceScanEnd.getTime(),
		)[0] || null;
		const primaryAnchors = [nextPayment, nextHoliday, nextCustom].filter(Boolean);
		const anchors = primaryAnchors.length ? primaryAnchors : [nextWorkday].filter(Boolean);
		if (!anchors.length) {
			return { fromAtMs: fromMs, toAtMs: fromMs, anchors: [], occurrences: [] };
		}
		const toAtMs = Math.max(...anchors.map(occurrenceBoundary));
		const occurrences = buildOccurrences(
			{
				workday,
				payments: nextPayment ? [new Date(nextPayment.startAtMs)] : [],
				holidays: nextHoliday ? [new Date(nextHoliday.startAtMs)] : [],
				counters,
			},
			{ from: fromDate, to: new Date(toAtMs) },
		).map((occurrence) => ({
			...occurrence,
			isAnchor: anchors.some((anchor) => projectionAnchorMatch(occurrence, anchor)),
		}));
		return { fromAtMs: fromMs, toAtMs, anchors, occurrences };
	}

	function filterOccurrences(
		occurrences,
		{ from = new Date(), horizonDays = 30, sourceTypes = [] } = {},
	) {
		const fromDate = validDate(from);
		if (!fromDate) return [];
		const safeHorizon = [7, 30, 90].includes(Number(horizonDays))
			? Number(horizonDays)
			: 30;
		const toDate = new Date(fromDate);
		toDate.setDate(toDate.getDate() + safeHorizon);
		const toMs = toDate.getTime();
		const accepted = new Set(Array.isArray(sourceTypes) ? sourceTypes : []);
		return (Array.isArray(occurrences) ? occurrences : []).filter(
			(occurrence) =>
				occurrence &&
				(occurrence.endAtMs ?? occurrence.startAtMs) >= fromDate.getTime() &&
				occurrence.startAtMs <= toMs &&
				(accepted.size === 0 || accepted.has(occurrence.sourceType)),
		);
	}

	function timelineGroupKey(startAtMs, actualTime = new Date()) {
		const eventDay = localDay(startAtMs);
		const today = localDay(actualTime);
		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);
		if (eventDay.getTime() === today.getTime()) return "today";
		if (eventDay.getTime() === tomorrow.getTime()) return "tomorrow";
		const weekEnd = new Date(today);
		weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
		if (eventDay > tomorrow && eventDay < weekEnd) return "this-week";
		return localDateKey(eventDay);
	}

	function groupOccurrences(occurrences, actualTime = new Date()) {
		const groups = [];
		const byKey = new Map();
		for (const occurrence of Array.isArray(occurrences) ? occurrences : []) {
			const key = timelineGroupKey(occurrence.startAtMs, actualTime);
			let group = byKey.get(key);
			if (!group) {
				group = { key, occurrences: [] };
				byKey.set(key, group);
				groups.push(group);
			}
			group.occurrences.push(occurrence);
		}
		return groups;
	}

	return {
		DASHBOARD_SECTION_IDS,
		buildOccurrences,
		buildTimelineProjection,
		filterOccurrences,
		groupOccurrences,
		normalizedOccurrence,
		occurrenceId,
		timelineGroupKey,
	};
});
