const { createHash } = require("node:crypto");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const logger = require("firebase-functions/logger");
const { setGlobalOptions } = require("firebase-functions/v2");
const { HttpsError, onCall, onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
	DELIVERY_WINDOW_MS,
	MINUTE_MS,
	buildDueCandidates,
	notificationJobId,
	validTimeZone,
} = require("./src/push-domain.js");
const { calculateAiQuota } = require("./src/ai-generator.js");
const { generateChecklistForPrompt } = require("./src/nlp-generator.js");
const { parseStripeEvent, extractSubscriptionDetails } = require("./src/stripe-webhook.js");

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
const TEAM_INVITE_ID_PATTERN = /^[0-9a-f-]{36}$/i;
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

exports.acceptTeamInvite = onCall(
	{ invoker: "public", cors: true, maxInstances: 20, timeoutSeconds: 30 },
	async (request) => {
		const uid = requireGoogleUser(request);
		const { teamId, inviteId } = request.data || {};
		if (
			typeof teamId !== "string" ||
			teamId.length < 1 ||
			teamId.length > 100 ||
			!TEAM_INVITE_ID_PATTERN.test(inviteId || "")
		) {
			throw new HttpsError("invalid-argument", "Convite inválido.");
		}

		return db.runTransaction(async (transaction) => {
			const teamReference = db.doc(`teams/${teamId}`);
			const inviteReference = db.doc(`teams/${teamId}/invites/${inviteId}`);
			const [teamSnapshot, inviteSnapshot] = await Promise.all([
				transaction.get(teamReference),
				transaction.get(inviteReference),
			]);
			if (!teamSnapshot.exists || !inviteSnapshot.exists) {
				throw new HttpsError("not-found", "Equipe ou convite não encontrado.");
			}

			const team = teamSnapshot.data();
			const invite = inviteSnapshot.data();
			const expiresAtMs = invite.expiresAt?.toMillis?.();
			if (invite.teamId !== teamId || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
				throw new HttpsError("failed-precondition", "Este convite expirou.");
			}

			const members = team.members || {};
			const existingRole = members[uid]?.role;
			if (!existingRole) {
				const ownerSnapshot = await transaction.get(db.doc(`users/${team.ownerUid}`));
				const owner = ownerSnapshot.data() || {};
				const maxMembers = owner.tier === "premium" || owner.isAdmin === true ? 12 : 5;
				if (Object.keys(members).length >= maxMembers) {
					throw new HttpsError("resource-exhausted", `Esta equipe atingiu o limite de ${maxMembers} membros.`);
				}
				members[uid] = {
					role: invite.role === "viewer" ? "viewer" : "editor",
					joinedAt: new Date().toISOString(),
				};
				transaction.update(teamReference, {
					members,
					updatedAt: FieldValue.serverTimestamp(),
				});
			}

			return {
				team: {
					id: teamId,
					name: team.name,
					ownerUid: team.ownerUid,
					ownerTier: team.ownerTier || "free",
					role: existingRole || members[uid].role,
				},
			};
		});
	},
);

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
				db.collection(`users/${uid}/counters`).orderBy("order").get(),
				db.doc(`users/${uid}/data/counters`).get(),
			]).then(([settings, counters, legacyCounters]) => ({
				settings: settings.exists ? settings.data() : null,
				counters: counters.empty
					? legacyCounters.data()?.items || []
					: counters.docs.map((document) => document.data()),
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

exports.getAiQuota = onCall(
	{ invoker: "public", cors: true, maxInstances: 20, timeoutSeconds: 30 },
	async (request) => {
		const uid = requireGoogleUser(request);
		const userSnapshot = await db.doc(`users/${uid}`).get();
		const userDocData = userSnapshot.exists ? userSnapshot.data() : {};
		return calculateAiQuota(userDocData);
	},
);

exports.stripeWebhook = onRequest(
	{ invoker: "public", maxInstances: 10, timeoutSeconds: 30 },
	async (req, res) => {
		if (req.method !== "POST") {
			res.status(405).send("Method Not Allowed");
			return;
		}

		try {
			const event = parseStripeEvent(req.body);
			const details = extractSubscriptionDetails(event);

			if (details && details.uid) {
				const userRef = db.doc(`users/${details.uid}`);
				await userRef.set(
					{
						tier: details.tier,
						...(details.customerId ? { stripeCustomerId: details.customerId } : {}),
						...(details.status ? { subscriptionStatus: details.status } : {}),
						...(details.currentPeriodEnd ? { currentPeriodEnd: details.currentPeriodEnd } : {}),
						cancelAtPeriodEnd: details.cancelAtPeriodEnd === true,
						updatedAt: FieldValue.serverTimestamp(),
					},
					{ merge: true },
				);
				logger.info(`Assinatura Stripe atualizada para o usuário ${details.uid}: ${details.tier}`);
			}

			res.status(200).json({ received: true });
		} catch (error) {
			logger.error("Erro no processamento do Stripe Webhook", error);
			res.status(400).send("Webhook Error");
		}
	},
);

exports.createStripeCheckoutSession = onCall(
	{
		invoker: "public",
		secrets: ["STRIPE_SECRET_KEY"],
		cors: true,
		maxInstances: 20,
		timeoutSeconds: 30,
	},
	async (request) => {
		const uid = requireGoogleUser(request);
		const stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_KEY;
		if (!stripeSecret) {
			throw new HttpsError(
				"failed-precondition",
				"Chave secreta do Stripe não configurada no ambiente das Functions.",
			);
		}

		const origin =
			request.rawRequest?.headers?.origin || "https://timekeeper.roda.dev";
		const Stripe = require("stripe");
		const stripe = Stripe(stripeSecret);

		try {
			const session = await stripe.checkout.sessions.create({
				mode: "subscription",
				payment_method_types: ["card"],
				client_reference_id: uid,
				metadata: { uid },
				subscription_data: {
					metadata: { uid },
				},
				line_items: [
					{
						price_data: {
							currency: "brl",
							product_data: {
								name: "Timekeeper Premium",
								description:
									"15 contadores, 40 imagens IA/mês, grupos e controle de visibilidade",
							},
							unit_amount: 490,
							recurring: { interval: "month" },
						},
						quantity: 1,
					},
				],
				success_url: `${origin}/?stripe_success=true`,
				cancel_url: `${origin}/?stripe_cancel=true`,
			});

			return { url: session.url, sessionId: session.id };
		} catch (error) {
			logger.error("Erro ao criar sessão do Stripe Checkout", error);
			throw new HttpsError(
				"internal",
				error.message || "Erro ao iniciar a sessão do Stripe Checkout.",
			);
		}
	},
);

exports.confirmStripeCheckout = onCall(
	{
		invoker: "public",
		secrets: ["STRIPE_SECRET_KEY"],
		cors: true,
		maxInstances: 20,
		timeoutSeconds: 30,
	},
	async (request) => {
		const uid = requireGoogleUser(request);
		const stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_KEY;
		if (!stripeSecret) {
			throw new HttpsError(
				"failed-precondition",
				"Chave secreta do Stripe não configurada nas Functions.",
			);
		}

		const Stripe = require("stripe");
		const stripe = Stripe(stripeSecret);

		try {
			const sessions = await stripe.checkout.sessions.list({
				limit: 10,
			});

			const userSession = sessions.data.find(
				(s) =>
					(s.client_reference_id === uid || s.metadata?.uid === uid) &&
					s.payment_status === "paid",
			);

			if (userSession) {
				const userRef = db.doc(`users/${uid}`);
				await userRef.set(
					{
						tier: "premium",
						...(userSession.customer
							? { stripeCustomerId: userSession.customer }
							: {}),
						subscriptionStatus: "active",
						updatedAt: FieldValue.serverTimestamp(),
					},
					{ merge: true },
				);
				logger.info(`Assinatura confirmada manualmente via API para o usuário ${uid}`);
				return { success: true, tier: "premium" };
			}

			return {
				success: false,
				message: "Nenhuma sessão de pagamento confirmada recentemente.",
			};
		} catch (error) {
			logger.error("Erro ao confirmar pagamento no Stripe", error);
			throw new HttpsError(
				"internal",
				error.message || "Erro ao verificar confirmação de pagamento.",
			);
		}
	},
);

exports.createStripePortalSession = onCall(
	{
		invoker: "public",
		secrets: ["STRIPE_SECRET_KEY"],
		cors: true,
		maxInstances: 20,
		timeoutSeconds: 30,
	},
	async (request) => {
		const uid = requireGoogleUser(request);
		const stripeSecret = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_KEY;
		if (!stripeSecret) {
			throw new HttpsError(
				"failed-precondition",
				"Chave secreta do Stripe não configurada no ambiente das Functions.",
			);
		}

		const userSnapshot = await db.doc(`users/${uid}`).get();
		const customerId = userSnapshot.data()?.stripeCustomerId;
		if (!customerId) {
			throw new HttpsError(
				"failed-precondition",
				"Nenhuma assinatura ativa encontrada para esta conta.",
			);
		}

		const origin =
			request.rawRequest?.headers?.origin || "https://timekeeper.roda.dev";
		const Stripe = require("stripe");
		const stripe = Stripe(stripeSecret);

		try {
			const session = await stripe.billingPortal.sessions.create({
				customer: customerId,
				return_url: origin,
			});
			return { url: session.url };
		} catch (error) {
			logger.error("Erro ao criar sessão do Stripe Portal", error);
			throw new HttpsError(
				"internal",
				error.message || "Erro ao abrir o gerenciador de assinatura do Stripe.",
			);
		}
	},
);
