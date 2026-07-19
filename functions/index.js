const { createHash } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const logger = require("firebase-functions/logger");
const { setGlobalOptions } = require("firebase-functions/v2");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
	DELIVERY_WINDOW_MS,
	MINUTE_MS,
	buildDueCandidates,
	notificationJobId,
	validTimeZone,
} = require("./src/push-domain.js");

initializeApp();
setGlobalOptions({ region: "southamerica-east1" });

const db = getFirestore();
const DEVICE_LIMIT = 5;
const DEVICE_REFRESH_LIMIT_MS = 30 * 1000;
const DEVICE_STALE_MS = 30 * 24 * 60 * MINUTE_MS;
const QUEUE_RETENTION_MS = 7 * 24 * 60 * MINUTE_MS;
const METRIC_RETENTION_MS = 30 * 24 * 60 * MINUTE_MS;
const LEASE_MS = 2 * MINUTE_MS;
const MAX_DEVICES_PER_RUN = 200;
const MAX_CONCURRENT_DEVICES = 10;
const INVALID_FID_CODES = new Set([
	"messaging/installation-id-not-registered",
	"messaging/registration-token-not-registered",
	"messaging/invalid-argument",
]);
const TRANSIENT_FCM_CODES = new Set([
	"messaging/server-unavailable",
	"messaging/internal-error",
	"messaging/unknown-error",
	"messaging/message-rate-exceeded",
	"messaging/device-message-rate-exceeded",
	"messaging/quota-exceeded",
]);

function sha256(value) {
	return createHash("sha256").update(String(value)).digest("hex");
}

function requireGoogleUser(request) {
	if (!request.auth) throw new HttpsError("unauthenticated", "Faça login novamente.");
	const provider =
		request.auth.token.firebase?.sign_in_provider ||
		request.auth.token.sign_in_provider;
	if (provider !== "google.com") {
		throw new HttpsError("permission-denied", "Use uma conta Google válida.");
	}
	return request.auth.uid;
}

function validDeviceId(value) {
	return typeof value === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(value);
}

function validFid(value) {
	return typeof value === "string" && /^[A-Za-z0-9_-]{10,200}$/.test(value);
}

function platformLabel(value) {
	return typeof value === "string" && value.trim()
		? value.trim().slice(0, 120)
		: "Web";
}

function deviceReference(uid, deviceId) {
	return db.doc(`users/${uid}/devices/${deviceId}`);
}

exports.registerPushDevice = onCall(
	{ enforceAppCheck: true, maxInstances: 20, timeoutSeconds: 30 },
	async (request) => {
		const uid = requireGoogleUser(request);
		const { deviceId, fid, timeZone, platform } = request.data || {};
		if (!validDeviceId(deviceId) || !validFid(fid) || !validTimeZone(timeZone)) {
			throw new HttpsError("invalid-argument", "Dispositivo, FID ou fuso inválido.");
		}

		const reference = deviceReference(uid, deviceId);
		const current = await reference.get();
		const fidHash = sha256(fid);
		const refreshedAt = current.data()?.refreshedAt?.toMillis?.() || 0;
		if (
			current.exists &&
			current.data().fidHash === fidHash &&
			Date.now() - refreshedAt < DEVICE_REFRESH_LIMIT_MS
		) {
			return { status: "current" };
		}

		if (!current.exists || current.data()?.permission !== "granted") {
			const active = await db
				.collection(`users/${uid}/devices`)
				.where("permission", "==", "granted")
				.limit(DEVICE_LIMIT + 1)
				.get();
			if (active.size >= DEVICE_LIMIT) {
				throw new HttpsError(
					"resource-exhausted",
					"Limite de cinco dispositivos ativos atingido.",
				);
			}
		}

		const now = FieldValue.serverTimestamp();
		await reference.set(
			{
				fid,
				fidHash,
				timeZone,
				platform: platformLabel(platform),
				permission: "granted",
				createdAt: current.exists ? current.data().createdAt || now : now,
				refreshedAt: now,
				revokedAt: null,
				purgeAt: null,
			},
			{ merge: true },
		);
		return { status: current.exists ? "refreshed" : "registered" };
	},
);

async function revokeDevice(uid, deviceId) {
	const reference = deviceReference(uid, deviceId);
	const snapshot = await reference.get();
	if (!snapshot.exists) return false;
	const nowMs = Date.now();
	await reference.set(
		{
			permission: "revoked",
			revokedAt: FieldValue.serverTimestamp(),
			purgeAt: Timestamp.fromMillis(nowMs + DEVICE_STALE_MS),
		},
		{ merge: true },
	);
	return true;
}

exports.revokePushDevice = onCall(
	{ enforceAppCheck: true, maxInstances: 20, timeoutSeconds: 30 },
	async (request) => {
		const uid = requireGoogleUser(request);
		const { deviceId } = request.data || {};
		if (!validDeviceId(deviceId)) {
			throw new HttpsError("invalid-argument", "Dispositivo inválido.");
		}
		return { revoked: await revokeDevice(uid, deviceId) };
	},
);

async function deleteQuery(query) {
	let removed = 0;
	while (true) {
		const snapshot = await query.limit(400).get();
		if (snapshot.empty) return removed;
		const batch = db.batch();
		for (const document of snapshot.docs) batch.delete(document.ref);
		await batch.commit();
		removed += snapshot.size;
	}
}

exports.deletePushData = onCall(
	{ enforceAppCheck: true, maxInstances: 10, timeoutSeconds: 60 },
	async (request) => {
		const uid = requireGoogleUser(request);
		const devicesRemoved = await deleteQuery(
			db.collection(`users/${uid}/devices`).orderBy("__name__"),
		);
		const queueItemsRemoved = await deleteQuery(
			db.collection("notificationQueue").where("uid", "==", uid),
		);
		return { devicesRemoved, queueItemsRemoved };
	},
);

function metricDay(nowMs) {
	return new Date(nowMs).toISOString().slice(0, 10);
}

async function recordMetric(status, nowMs) {
	const allowed = new Set(["scheduled", "sent", "invalid", "failed", "suppressed"]);
	if (!allowed.has(status)) return;
	await db.doc(`pushMetrics/${metricDay(nowMs)}`).set(
		{
			[status]: FieldValue.increment(1),
			updatedAt: FieldValue.serverTimestamp(),
			purgeAt: Timestamp.fromMillis(nowMs + METRIC_RETENTION_MS),
		},
		{ merge: true },
	);
}

async function claimQueueItem(uid, deviceId, candidate, nowMs) {
	const id = notificationJobId(uid, deviceId, candidate);
	const reference = db.doc(`notificationQueue/${id}`);
	return db.runTransaction(async (transaction) => {
		const snapshot = await transaction.get(reference);
		const current = snapshot.data() || {};
		if (["sent", "invalid", "suppressed"].includes(current.status)) return null;
		if (current.expiresAt?.toMillis?.() <= nowMs) return null;
		if (current.status === "claimed" && current.leaseUntil?.toMillis?.() > nowMs) {
			return null;
		}
		if (current.nextAttemptAt?.toMillis?.() > nowMs) return null;

		const created = !snapshot.exists;
		const attemptCount = Number(current.attemptCount || 0) + 1;
		const scheduledAt = Timestamp.fromMillis(candidate.scheduledAtMs);
		transaction.set(
			reference,
			{
				uid,
				deviceId,
				occurrenceId: candidate.occurrenceId,
				edge: candidate.edge,
				leadMinutes: candidate.leadMinutes,
				scheduledAt,
				expiresAt: Timestamp.fromMillis(
					candidate.scheduledAtMs + DELIVERY_WINDOW_MS,
				),
				purgeAt: Timestamp.fromMillis(
					candidate.scheduledAtMs + QUEUE_RETENTION_MS,
				),
				status: "claimed",
				attemptCount,
				leaseUntil: Timestamp.fromMillis(nowMs + LEASE_MS),
				createdAt: current.createdAt || FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp(),
			},
			{ merge: true },
		);
		return { reference, attemptCount, created };
	});
}

async function finalizeQueueItem(claim, status, extra = {}) {
	await claim.reference.set(
		{
			status,
			leaseUntil: null,
			updatedAt: FieldValue.serverTimestamp(),
			...extra,
		},
		{ merge: true },
	);
}

function fcmErrorCode(error) {
	return typeof error?.code === "string" ? error.code : "messaging/unknown-error";
}

async function dispatchCandidate(device, candidate, nowMs) {
	const claim = await claimQueueItem(device.uid, device.deviceId, candidate, nowMs);
	if (!claim) return null;
	if (claim.created) await recordMetric("scheduled", nowMs);

	if (candidate.suppressedByQuietHours) {
		await finalizeQueueItem(claim, "suppressed", {
			suppressedAt: FieldValue.serverTimestamp(),
		});
		await recordMetric("suppressed", nowMs);
		return "suppressed";
	}

	try {
		await getMessaging().send({
			fid: device.fid,
			data: {
				title: `Timekeeper · ${candidate.title}`,
				body: candidate.body,
				tag: notificationJobId(device.uid, device.deviceId, candidate),
				url: "/#dashboard-timeline-section",
				sourceId: candidate.sourceId,
			},
			webpush: {
				headers: { TTL: "900", Urgency: "high" },
			},
		});
		await finalizeQueueItem(claim, "sent", {
			sentAt: FieldValue.serverTimestamp(),
		});
		await recordMetric("sent", nowMs);
		return "sent";
	} catch (error) {
		const code = fcmErrorCode(error);
		if (INVALID_FID_CODES.has(code)) {
			await finalizeQueueItem(claim, "invalid", {
				invalidAt: FieldValue.serverTimestamp(),
				errorCode: code,
			});
			await revokeDevice(device.uid, device.deviceId);
			await recordMetric("invalid", nowMs);
			return "invalid";
		}

		const expiresAtMs = candidate.scheduledAtMs + DELIVERY_WINDOW_MS;
		const transient = TRANSIENT_FCM_CODES.has(code);
		const backoffMs = Math.min(8, 2 ** Math.max(0, claim.attemptCount - 1)) * MINUTE_MS;
		const canRetry = transient && nowMs + backoffMs < expiresAtMs;
		await finalizeQueueItem(claim, "failed", {
			errorCode: code,
			failedAt: FieldValue.serverTimestamp(),
			nextAttemptAt: canRetry
				? Timestamp.fromMillis(nowMs + backoffMs)
				: null,
		});
		await recordMetric("failed", nowMs);
		return "failed";
	}
}

async function loadGeneralConfig() {
	const snapshot = await db.collection("generalConfig").get();
	let workday = null;
	const payments = [];
	const holidays = [];
	for (const document of snapshot.docs) {
		const item = { id: document.id, ...document.data() };
		if (item.type === "workday") workday = item;
		if (item.type === "payment") payments.push(item);
		if (item.type === "holiday") holidays.push(item);
	}
	return { workday, payments, holidays };
}

async function loadUserState(uid, cache) {
	if (!cache.has(uid)) {
		cache.set(
			uid,
			Promise.all([
				db.doc(`users/${uid}/data/settings`).get(),
				db.doc(`users/${uid}/data/counters`).get(),
			]).then(([settings, counters]) => ({
				settings: settings.exists ? settings.data() : null,
				counters: counters.exists ? counters.data().items || [] : [],
			})),
		);
	}
	return cache.get(uid);
}

async function processDevice(document, generalConfig, userCache, nowMs) {
	const device = document.data();
	const userReference = document.ref.parent.parent;
	if (!userReference || !device.fid || !validTimeZone(device.timeZone)) return [];
	const uid = userReference.id;
	const refreshedAt = device.refreshedAt?.toMillis?.() || 0;
	if (nowMs - refreshedAt > DEVICE_STALE_MS) {
		await revokeDevice(uid, document.id);
		return [];
	}
	const state = await loadUserState(uid, userCache);
	if (!state.settings?.notificationsEnabled) return [];
	const candidates = buildDueCandidates(
		{
			...generalConfig,
			counters: state.counters,
			settings: state.settings,
			timeZone: device.timeZone,
		},
		{ nowMs },
	);
	const target = { uid, deviceId: document.id, fid: device.fid };
	const results = [];
	for (const candidate of candidates) {
		const result = await dispatchCandidate(target, candidate, nowMs);
		if (result) results.push(result);
	}
	return results;
}

async function mapWithConcurrency(items, concurrency, worker) {
	const results = [];
	let index = 0;
	async function run() {
		while (index < items.length) {
			const current = index;
			index += 1;
			results[current] = await worker(items[current]);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
	);
	return results;
}

exports.dispatchPushNotifications = onSchedule(
	{
		schedule: "every 1 minutes",
		timeZone: "Etc/UTC",
		memory: "256MiB",
		timeoutSeconds: 60,
		maxInstances: 1,
	},
	async () => {
		const startedAt = Date.now();
		const [generalConfig, devices] = await Promise.all([
			loadGeneralConfig(),
			db
				.collectionGroup("devices")
				.where("permission", "==", "granted")
				.limit(MAX_DEVICES_PER_RUN)
				.get(),
		]);
		const userCache = new Map();
		const nestedResults = await mapWithConcurrency(
			devices.docs,
			MAX_CONCURRENT_DEVICES,
			(document) => processDevice(document, generalConfig, userCache, startedAt),
		);
		const totals = nestedResults.flat().reduce((summary, status) => {
			summary[status] = (summary[status] || 0) + 1;
			return summary;
		}, {});
		logger.info("Push dispatch concluído.", {
			devices: devices.size,
			truncated: devices.size === MAX_DEVICES_PER_RUN,
			durationMs: Date.now() - startedAt,
			totals,
		});
	},
);
