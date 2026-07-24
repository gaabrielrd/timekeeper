const { getFirestore } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

/**
 * Busca um contador público via Admin SDK
 * 
 * @param {Object} data Parâmetros da chamada
 * @param {string} [data.uid] UID do proprietário
 * @param {string} [data.teamId] ID da equipe
 * @param {string} data.counterId ID do contador
 */
async function getPublicCounterData(data) {
	const payload = data && typeof data === "object" ? data : {};
	if (
		typeof payload.counterId !== "string" ||
		payload.counterId.length < 1 ||
		payload.counterId.length > 100 ||
		payload.counterId.includes("/")
	) {
		throw new HttpsError("invalid-argument", "ID do contador é obrigatório.");
	}
	const workspaceIds = [payload.uid, payload.teamId].filter(
		(value) => typeof value === "string" && value.length > 0,
	);
	if (workspaceIds.length !== 1) {
		throw new HttpsError("invalid-argument", "UID ou ID da equipe é obrigatório.");
	}
	const workspaceId = workspaceIds[0];
	if (workspaceId.length > 128 || workspaceId.includes("/")) {
		throw new HttpsError("invalid-argument", "Workspace inválido.");
	}

	const db = getFirestore();
	let countersQuery;
	let settingsRef;

	if (payload.teamId) {
		countersQuery = db
			.collection(`teams/${workspaceId}/counters`)
			.where("id", "==", payload.counterId)
			.limit(1);
		settingsRef = db.doc(`teams/${workspaceId}/data/settings`);
	} else {
		countersQuery = db
			.collection(`users/${workspaceId}/counters`)
			.where("id", "==", payload.counterId)
			.limit(1);
		settingsRef = db.doc(`users/${workspaceId}/data/settings`);
	}

	const [countersSnap, settingsSnap] = await Promise.all([
		countersQuery.get(),
		settingsRef.get(),
	]);

	if (countersSnap.empty) {
		throw new HttpsError("not-found", "Contador não encontrado.");
	}
	const counter = countersSnap.docs[0].data();

	if (counter.isPublic !== true) {
		throw new HttpsError("permission-denied", "Este contador não é público.");
	}

	let settings = {};
	if (settingsSnap.exists) {
		const s = settingsSnap.data();
		for (const key of [
			"backgroundEnabled",
			"backgroundStyle",
			"backgroundColorA",
			"backgroundColorB",
			"backgroundSpeed",
			"backgroundIntensity",
			"accentPrimary",
			"accentSecondary",
		]) {
			if (s[key] !== undefined) settings[key] = s[key];
		}
	}

	return {
		counter,
		settings
	};
}

module.exports = {
	getPublicCounterData
};
