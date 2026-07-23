const test = require("node:test");
const assert = require("node:assert/strict");

// Override module cache to inject mock for firebase-admin/firestore
const mockGetFirestore = () => ({
	doc: (path) => ({
		get: async () => {
			if (path === "users/user1/data/counters") {
				return {
					exists: true,
					data: () => ({
						items: [
							{ id: "c1", name: "Public", isPublic: true },
							{ id: "c2", name: "Private" }
						]
					})
				};
			}
			if (path === "users/user1/data/settings") {
				return {
					exists: true,
					data: () => ({
						backgroundEnabled: true,
						backgroundStyle: "stars"
					})
				};
			}
			return { exists: false };
		}
	})
});

require("firebase-admin/firestore"); // ensure loaded
const adminFirestore = require.cache[require.resolve("firebase-admin/firestore")];
if (adminFirestore) {
	adminFirestore.exports.getFirestore = mockGetFirestore;
}

const { getPublicCounterData } = require("../src/public-links.js");

test("valida parâmetros obrigatórios", async () => {
	await assert.rejects(
		getPublicCounterData({ uid: "user1" }),
		{ code: "invalid-argument", message: "ID do contador é obrigatório." }
	);
	await assert.rejects(
		getPublicCounterData({ counterId: "c1" }),
		{ code: "invalid-argument", message: "UID ou ID da equipe é obrigatório." }
	);
});

test("retorna dados de contador público com sucesso", async () => {
	const result = await getPublicCounterData({ uid: "user1", counterId: "c1" });
	assert.equal(result.counter.id, "c1");
	assert.equal(result.counter.name, "Public");
	assert.equal(result.settings.backgroundStyle, "stars");
});

test("rejeita acesso a contador privado", async () => {
	await assert.rejects(
		getPublicCounterData({ uid: "user1", counterId: "c2" }),
		{ code: "permission-denied", message: "Este contador não é público." }
	);
});

test("rejeita acesso a contador inexistente", async () => {
	await assert.rejects(
		getPublicCounterData({ uid: "user1", counterId: "c3" }),
		{ code: "not-found", message: "Contador não encontrado." }
	);
});
