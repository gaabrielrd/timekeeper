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
	if (!data.counterId || typeof data.counterId !== "string") {
		throw new HttpsError("invalid-argument", "ID do contador é obrigatório.");
	}
	if (!data.uid && !data.teamId) {
		throw new HttpsError("invalid-argument", "UID ou ID da equipe é obrigatório.");
	}

	const db = getFirestore();
	let countersRef;
	let settingsRef;

	if (data.teamId) {
		countersRef = db.doc(`teams/${data.teamId}/data/counters`);
		settingsRef = db.doc(`teams/${data.teamId}/data/settings`);
	} else {
		countersRef = db.doc(`users/${data.uid}/data/counters`);
		settingsRef = db.doc(`users/${data.uid}/data/settings`);
	}

	const [countersSnap, settingsSnap] = await Promise.all([
		countersRef.get(),
		settingsRef.get()
	]);

	if (!countersSnap.exists) {
		throw new HttpsError("not-found", "Contadores não encontrados.");
	}

	const countersData = countersSnap.data();
	if (!countersData.items || !Array.isArray(countersData.items)) {
		throw new HttpsError("not-found", "Formato de contadores inválido.");
	}

	const counter = countersData.items.find(c => c.id === data.counterId);
	if (!counter) {
		throw new HttpsError("not-found", "Contador não encontrado.");
	}

	if (counter.isPublic !== true) {
		throw new HttpsError("permission-denied", "Este contador não é público.");
	}

	let settings = {};
	if (settingsSnap.exists) {
		const s = settingsSnap.data();
		settings = {
			backgroundEnabled: s.backgroundEnabled,
			backgroundStyle: s.backgroundStyle,
			backgroundColorA: s.backgroundColorA,
			backgroundColorB: s.backgroundColorB,
			backgroundSpeed: s.backgroundSpeed,
			backgroundIntensity: s.backgroundIntensity,
			accentPrimary: s.accentPrimary,
			accentSecondary: s.accentSecondary
		};
	}

	return {
		counter,
		settings
	};
}

module.exports = {
	getPublicCounterData
};
