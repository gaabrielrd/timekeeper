const { createHash } = require("node:crypto");
const { DateTime, IANAZone } = require("luxon");

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DELIVERY_WINDOW_MS = 15 * MINUTE_MS;
const ALLOWED_LEADS = Object.freeze([0, 5, 15, 60, 1440]);
const SOURCE_KEYS = Object.freeze(["workday", "payment", "holiday", "counters"]);

function validTimeZone(value) {
	return typeof value === "string" && IANAZone.isValidZone(value);
}

function notificationJobId(uid, deviceId, candidate) {
	return createHash("sha256")
		.update(
			[
				uid,
				deviceId,
				candidate.occurrenceId,
				candidate.edge,
				candidate.leadMinutes,
			].join("|"),
		)
		.digest("hex");
}

function normalizePreferences(settings = {}) {
	const requestedLeads = Array.isArray(settings.notificationLeadMinutes)
		? settings.notificationLeadMinutes.map(Number)
		: [15];
	const leads = [...new Set(requestedLeads)]
		.filter((value) => ALLOWED_LEADS.includes(value))
		.sort((first, second) => first - second);
	const sources = Object.fromEntries(
		SOURCE_KEYS.map((key) => [
			key,
			settings.notificationSources?.[key] !== false,
		]),
	);
	const startTime = /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(
		settings.notificationQuietHours?.startTime || "",
	)
		? settings.notificationQuietHours.startTime
		: "22:00";
	const endTime = /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(
		settings.notificationQuietHours?.endTime || "",
	)
		? settings.notificationQuietHours.endTime
		: "07:00";
	return {
		notificationsEnabled: settings.notificationsEnabled === true,
		notificationLeadMinutes: leads.length ? leads : [15],
		notificationSources: sources,
		notificationQuietHours: {
			enabled: settings.notificationQuietHours?.enabled === true,
			startTime,
			endTime,
		},
	};
}

function minutesSinceMidnight(value) {
	const [hours, minutes] = value.split(":").map(Number);
	return hours * 60 + minutes;
}

function isQuietAt(valueMs, quietHours, timeZone) {
	if (!quietHours?.enabled || !validTimeZone(timeZone)) return false;
	const local = DateTime.fromMillis(valueMs, { zone: timeZone });
	const current = local.hour * 60 + local.minute;
	const start = minutesSinceMidnight(quietHours.startTime);
	const end = minutesSinceMidnight(quietHours.endTime);
	if (start === end) return true;
	return start < end
		? current >= start && current < end
		: current >= start || current < end;
}

function occurrence({ sourceId, sourceType, title, startAtMs, endAtMs = null }) {
	if (!Number.isFinite(startAtMs)) return null;
	if (endAtMs != null && (!Number.isFinite(endAtMs) || endAtMs <= startAtMs)) {
		return null;
	}
	return {
		id: `${sourceType}:${sourceId}:${startAtMs}`,
		sourceId: String(sourceId),
		sourceType,
		title: String(title || "Evento").slice(0, 80),
		startAtMs,
		endAtMs,
	};
}

function overlapsWindow(item, fromMs, toMs) {
	return (item.endAtMs ?? item.startAtMs) >= fromMs && item.startAtMs <= toMs;
}

function localDateTime(value, timeZone) {
	if (typeof value !== "string") return null;
	const date = DateTime.fromISO(value, { zone: timeZone, setZone: true });
	return date.isValid ? date : null;
}

function timeParts(value) {
	if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value || "")) return null;
	const [hour, minute] = value.split(":").map(Number);
	return { hour, minute };
}

function recurringOccurrences(
	item,
	{ sourceType, sourceId, title, timeZone, fromMs, toMs },
) {
	const startParts = timeParts(item?.startTime);
	const endParts = timeParts(item?.endTime);
	const days = new Set(
		(Array.isArray(item?.daysOfWeek) ? item.daysOfWeek : [])
			.map(Number)
			.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
	);
	if (!startParts || !endParts || !days.size || !validTimeZone(timeZone)) return [];
	const results = [];
	let cursor = DateTime.fromMillis(fromMs, { zone: timeZone })
		.startOf("day")
		.minus({ days: 1 });
	const last = DateTime.fromMillis(toMs, { zone: timeZone }).endOf("day");
	while (cursor <= last) {
		if (days.has(cursor.weekday % 7)) {
			const start = cursor.set(startParts);
			let end = cursor.set(endParts);
			if (end <= start) end = end.plus({ days: 1 });
			const normalized = occurrence({
				sourceId,
				sourceType,
				title,
				startAtMs: start.toMillis(),
				endAtMs: end.toMillis(),
			});
			if (normalized && overlapsWindow(normalized, fromMs, toMs)) {
				results.push(normalized);
			}
		}
		cursor = cursor.plus({ days: 1 });
	}
	return results;
}

function calendarOccurrences(items, sourceType, title, timeZone, fromMs, toMs) {
	return (Array.isArray(items) ? items : [])
		.map((item, index) => {
			const date = localDateTime(item?.dateTime ?? item, timeZone);
			return date
				? occurrence({
						sourceId: item?.id || `${sourceType}-${index}`,
						sourceType,
						title,
						startAtMs: date.toMillis(),
					})
				: null;
		})
		.filter((item) => item && overlapsWindow(item, fromMs, toMs));
}

function fixedOccurrence(counter) {
	const startAtMs = Number.isInteger(counter?.startAtMs)
		? counter.startAtMs
		: new Date(counter?.startAt).getTime();
	const endAtMs = Number.isInteger(counter?.endAtMs)
		? counter.endAtMs
		: new Date(counter?.endAt).getTime();
	return occurrence({
		sourceId: counter?.id || "fixed",
		sourceType: "fixed",
		title: counter?.name,
		startAtMs,
		endAtMs,
	});
}

function sourcePreferenceKey(sourceType) {
	if (["fixed", "recurring"].includes(sourceType)) return "counters";
	return sourceType;
}

function leadLabel(minutes) {
	if (minutes === 0) return "agora";
	if (minutes === 60) return "1 hora";
	if (minutes === 1440) return "1 dia";
	return `${minutes} minutos`;
}

function candidateBody(edge, leadMinutes) {
	const action = edge === "end" ? "Termina" : "Começa";
	return leadMinutes === 0
		? `${action} agora.`
		: `${action} em ${leadLabel(leadMinutes)}.`;
}

function occurrenceCandidates(item, preferences) {
	const edges = [{ edge: "start", atMs: item.startAtMs }];
	if (item.endAtMs != null) edges.push({ edge: "end", atMs: item.endAtMs });
	return edges.flatMap(({ edge, atMs }) =>
		preferences.notificationLeadMinutes.map((leadMinutes) => ({
			occurrenceId: item.id,
			sourceId: item.sourceId,
			sourceType: item.sourceType,
			title: item.title,
			edge,
			leadMinutes,
			eventAtMs: atMs,
			scheduledAtMs: atMs - leadMinutes * MINUTE_MS,
			body: candidateBody(edge, leadMinutes),
		})),
	);
}

function buildDueCandidates(
	{
		workday = null,
		payments = [],
		holidays = [],
		counters = [],
		settings = {},
		timeZone,
	} = {},
	{ nowMs = Date.now(), deliveryWindowMs = DELIVERY_WINDOW_MS } = {},
) {
	if (!validTimeZone(timeZone)) return [];
	const preferences = normalizePreferences(settings);
	if (!preferences.notificationsEnabled) return [];
	const maxLead = Math.max(...preferences.notificationLeadMinutes) * MINUTE_MS;
	const fromMs = nowMs - deliveryWindowMs;
	const toMs = nowMs + maxLead + 2 * MINUTE_MS;
	const occurrences = [
		...recurringOccurrences(workday, {
			sourceType: "workday",
			sourceId: "workday",
			title: "Expediente",
			timeZone,
			fromMs,
			toMs,
		}),
		...calendarOccurrences(
			payments,
			"payment",
			"Pagamento",
			timeZone,
			fromMs,
			toMs,
		),
		...calendarOccurrences(
			holidays,
			"holiday",
			"Feriado",
			timeZone,
			fromMs,
			toMs,
		),
		...(Array.isArray(counters) ? counters : []).flatMap((counter) => {
			if (counter?.type === "recurring") {
				return recurringOccurrences(counter, {
					sourceType: "recurring",
					sourceId: counter.id || "recurring",
					title: counter.name,
					timeZone,
					fromMs,
					toMs,
				});
			}
			const fixed = fixedOccurrence(counter);
			return fixed && overlapsWindow(fixed, fromMs, toMs) ? [fixed] : [];
		}),
	];
	const quiet = isQuietAt(nowMs, preferences.notificationQuietHours, timeZone);
	return occurrences
		.filter(
			(item) =>
				preferences.notificationSources[sourcePreferenceKey(item.sourceType)] === true,
		)
		.flatMap((item) => occurrenceCandidates(item, preferences))
		.filter(
			(candidate) =>
				candidate.scheduledAtMs <= nowMs &&
				candidate.scheduledAtMs >= nowMs - deliveryWindowMs,
		)
		.map((candidate) => ({ ...candidate, suppressedByQuietHours: quiet }))
		.sort(
			(first, second) =>
				first.scheduledAtMs - second.scheduledAtMs ||
				first.occurrenceId.localeCompare(second.occurrenceId) ||
				first.edge.localeCompare(second.edge) ||
				first.leadMinutes - second.leadMinutes,
		);
}

module.exports = {
	ALLOWED_LEADS,
	DAY_MS,
	DELIVERY_WINDOW_MS,
	MINUTE_MS,
	buildDueCandidates,
	candidateBody,
	isQuietAt,
	notificationJobId,
	normalizePreferences,
	validTimeZone,
};
