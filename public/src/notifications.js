(function exposeTimekeeperNotifications(root, factory) {
	const api = factory();
	if (typeof module === "object" && module.exports) module.exports = api;
	if (root) root.TimekeeperNotifications = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
	const LEAD_MINUTES = Object.freeze([0, 5, 15, 60, 1440]);
	const SOURCE_KEYS = Object.freeze([
		"workday",
		"payment",
		"holiday",
		"counters",
	]);
	const DEFAULT_PREFERENCES = Object.freeze({
		notificationsEnabled: false,
		notificationLeadMinutes: Object.freeze([15]),
		notificationSources: Object.freeze({
			workday: true,
			payment: true,
			holiday: true,
			counters: true,
		}),
		notificationQuietHours: Object.freeze({
			enabled: false,
			startTime: "22:00",
			endTime: "07:00",
		}),
	});

	function validTime(value, fallback) {
		return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))
			? String(value)
			: fallback;
	}

	function normalizePreferences(data = {}) {
		const requestedLeads = Array.isArray(data.notificationLeadMinutes)
			? data.notificationLeadMinutes.map(Number)
			: DEFAULT_PREFERENCES.notificationLeadMinutes;
		const leads = [...new Set(requestedLeads)]
			.filter((lead) => LEAD_MINUTES.includes(lead))
			.sort((first, second) => first - second);
		const sources = data.notificationSources || {};
		const quiet = data.notificationQuietHours || {};
		return {
			notificationsEnabled: data.notificationsEnabled === true,
			notificationLeadMinutes: leads.length
				? leads
				: [...DEFAULT_PREFERENCES.notificationLeadMinutes],
			notificationSources: Object.fromEntries(
				SOURCE_KEYS.map((key) => [
					key,
					typeof sources[key] === "boolean"
						? sources[key]
						: DEFAULT_PREFERENCES.notificationSources[key],
				]),
			),
			notificationQuietHours: {
				enabled: quiet.enabled === true,
				startTime: validTime(
					quiet.startTime,
					DEFAULT_PREFERENCES.notificationQuietHours.startTime,
				),
				endTime: validTime(
					quiet.endTime,
					DEFAULT_PREFERENCES.notificationQuietHours.endTime,
				),
			},
		};
	}

	function sourcePreferenceKey(sourceType) {
		return ["fixed", "recurring"].includes(sourceType)
			? "counters"
			: sourceType;
	}

	function occurrenceEdges(occurrence) {
		const edges = [
			{
				edge: "start",
				eventAtMs: occurrence.startAtMs,
			},
		];
		if (Number.isFinite(occurrence.endAtMs)) {
			edges.push({ edge: "end", eventAtMs: occurrence.endAtMs });
		}
		return edges;
	}

	function buildCandidates(occurrences, data = {}) {
		const preferences = normalizePreferences(data);
		if (!preferences.notificationsEnabled) return [];
		return (Array.isArray(occurrences) ? occurrences : [])
			.filter((occurrence) => {
				const key = sourcePreferenceKey(occurrence?.sourceType);
				return key && preferences.notificationSources[key] === true;
			})
			.flatMap((occurrence) =>
				occurrenceEdges(occurrence).flatMap(({ edge, eventAtMs }) =>
					preferences.notificationLeadMinutes.map((leadMinutes) => ({
						id: `${occurrence.id}:${edge}:${leadMinutes}`,
						occurrenceId: occurrence.id,
						sourceId: occurrence.sourceId,
						sourceType: occurrence.sourceType,
						title: occurrence.title,
						edge,
						eventAtMs,
						leadMinutes,
						scheduledAtMs: eventAtMs - leadMinutes * 60000,
					})),
			),
		)
			.sort(
				(first, second) =>
					first.scheduledAtMs - second.scheduledAtMs ||
					first.id.localeCompare(second.id),
			);
	}

	function minutesSinceMidnight(value) {
		const [hours, minutes] = value.split(":").map(Number);
		return hours * 60 + minutes;
	}

	function isQuietTime(value, quietHours) {
		const quiet = normalizePreferences({
			notificationQuietHours: quietHours,
		}).notificationQuietHours;
		if (!quiet.enabled) return false;
		const date = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(date.getTime())) return false;
		const current = date.getHours() * 60 + date.getMinutes();
		const start = minutesSinceMidnight(quiet.startTime);
		const end = minutesSinceMidnight(quiet.endTime);
		if (start === end) return true;
		return start < end
			? current >= start && current < end
			: current >= start || current < end;
	}

	function dueCandidates(candidates, now = Date.now(), graceMs = 20000) {
		const current = Number(now);
		return (Array.isArray(candidates) ? candidates : []).filter(
			(candidate) =>
				candidate.scheduledAtMs <= current &&
				candidate.scheduledAtMs >= current - Math.max(0, Number(graceMs) || 0),
		);
	}

	function leadLabel(minutes) {
		if (minutes === 0) return "agora";
		if (minutes === 60) return "1 hora";
		if (minutes === 1440) return "1 dia";
		return `${minutes} minutos`;
	}

	function candidateBody(candidate) {
		const action = candidate.edge === "end" ? "termina" : "começa";
		if (candidate.leadMinutes === 0) return `${action[0].toUpperCase()}${action.slice(1)} agora.`;
		return `${action[0].toUpperCase()}${action.slice(1)} em ${leadLabel(candidate.leadMinutes)}.`;
	}

	return {
		DEFAULT_PREFERENCES,
		LEAD_MINUTES,
		SOURCE_KEYS,
		buildCandidates,
		candidateBody,
		dueCandidates,
		isQuietTime,
		leadLabel,
		normalizePreferences,
		sourcePreferenceKey,
	};
});
