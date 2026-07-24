const test = require("node:test");
const assert = require("node:assert/strict");

const counterCollections = {
	"users/user1/counters": [
		{ id: "c1", name: "Public", isPublic: true },
		{ id: "c2", name: "Private" },
	],
	"teams/team1/counters": [
		{ id: "team-counter", name: "Team Public", isPublic: true },
	],
};

// Override module cache to inject mock for firebase-admin/firestore.
const mockGetFirestore = () => ({
	collection: (path) => ({
		where: (field, operator, value) => {
			assert.equal(field, "id");
			assert.equal(operator, "==");
			return {
				limit: (limit) => {
					assert.equal(limit, 1);
					return {
						get: async () => {
							const match = (counterCollections[path] || []).find(
								(counter) => counter.id === value,
							);
							return {
								empty: !match,
								docs: match ? [{ data: () => match }] : [],
							};
						},
					};
				},
			};
		},
	}),
	doc: (path) => ({
		get: async () => {
			if (path === "users/user1/data/settings") {
				return {
					exists: true,
					data: () => ({
						backgroundEnabled: true,
						backgroundStyle: "stars",
					}),
				};
			}
			if (path === "teams/team1/data/settings") {
				return {
					exists: true,
					data: () => ({ counterGroups: ["Produto"] }),
				};
			}
			return { exists: false };
		},
	}),
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

test("retorna contador público de equipe na subcoleção atual", async () => {
	const result = await getPublicCounterData({
		teamId: "team1",
		counterId: "team-counter",
	});
	assert.equal(result.counter.name, "Team Public");
	assert.deepEqual(result.settings, {});
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

test("rejeita workspace ambíguo e segmentos de path inválidos", async () => {
	await assert.rejects(
		getPublicCounterData({ uid: "user1", teamId: "team1", counterId: "c1" }),
		{ code: "invalid-argument" },
	);
	await assert.rejects(
		getPublicCounterData({ uid: "users/other", counterId: "c1" }),
		{ code: "invalid-argument", message: "Workspace inválido." },
	);
	await assert.rejects(
		getPublicCounterData({ uid: "user1", counterId: "counters/c1" }),
		{ code: "invalid-argument", message: "ID do contador é obrigatório." },
	);
});
