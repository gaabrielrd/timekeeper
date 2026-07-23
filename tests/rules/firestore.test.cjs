const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	serverTimestamp,
	setLogLevel,
	setDoc,
	writeBatch,
} = require("firebase/firestore");
const {
	deleteObject,
	getBytes,
	ref,
	uploadBytes,
} = require("firebase/storage");

setLogLevel("silent");

const projectId = "demo-timekeeper";
const rules = fs.readFileSync(
	path.resolve(__dirname, "../../firestore.rules"),
	"utf8",
);
const storageRules = fs.readFileSync(
	path.resolve(__dirname, "../../storage.rules"),
	"utf8",
);

let environment;

test.before(async () => {
	environment = await initializeTestEnvironment({
		projectId,
		firestore: { rules },
		storage: { rules: storageRules },
	});
});

test.afterEach(async () => {
	await environment.clearFirestore();
	await environment.clearStorage();
});

test.after(async () => {
	await environment.cleanup();
});

function googleDb(uid = "alice") {
	return environment.authenticatedContext(uid, {
		firebase: { sign_in_provider: "google.com" },
	}).firestore();
}

function passwordDb(uid = "alice") {
	return environment.authenticatedContext(uid, {
		firebase: { sign_in_provider: "password" },
	}).firestore();
}

function googleStorage(uid = "alice") {
	return environment.authenticatedContext(uid, {
		firebase: { sign_in_provider: "google.com" },
	}).storage();
}

function passwordStorage(uid = "alice") {
	return environment.authenticatedContext(uid, {
		firebase: { sign_in_provider: "password" },
	}).storage();
}

function fixedCounter(index = 1) {
	return {
		id: `fixed-${index}`,
		name: `Contador ${index}`,
		type: "fixed",
		startAtMs: Date.parse("2026-07-17T12:00:00.000Z"),
		endAtMs: Date.parse("2026-07-18T12:00:00.000Z"),
		color: null,
		imageId: "image-1",
		imageOpacity: 100,
		overlayOpacity: 55,
		createdAt: "2026-07-17T12:00:00.000Z",
	};
}

function recurringCounter() {
	return {
		id: "recurring-1",
		name: "Academia",
		type: "recurring",
		startTime: "18:00",
		endTime: "19:30",
		daysOfWeek: [1, 3, 5],
		color: "#22c55e",
		createdAt: "2026-07-17T12:00:00.000Z",
	};
}

function storedCounter(counter, order = 0) {
	return { ...counter, order, updatedAt: serverTimestamp() };
}

function personalCounterReference(database, slot = 0, uid = "alice") {
	return doc(database, `users/${uid}/counters/${slot}`);
}

function teamCounterReference(database, slot = 0, teamId = "team-alpha") {
	return doc(database, `teams/${teamId}/counters/${slot}`);
}

function archivedCounter(index = 1) {
	return {
		...fixedCounter(index),
		archivedAt: "2026-07-19T15:30:00.000Z",
	};
}

async function seedProfile(uid, isAdmin = false) {
	await environment.withSecurityRulesDisabled(async (context) => {
		await setDoc(doc(context.firestore(), "users", uid), {
			displayName: uid,
			email: `${uid}@example.com`,
			photoURL: "",
			isAdmin,
		});
	});
}

async function seedTeam(teamId = "team-alpha") {
	await environment.withSecurityRulesDisabled(async (context) => {
		const db = context.firestore();
		await setDoc(doc(db, "users/owner"), {
			displayName: "owner",
			email: "owner@example.com",
			photoURL: "",
			tier: "premium",
		});
		await setDoc(doc(db, `teams/${teamId}`), {
			id: teamId,
			name: "Equipe Alpha",
			ownerUid: "owner",
			ownerTier: "premium",
			members: {
				owner: { role: "admin" },
				admin: { role: "admin" },
				editor: { role: "editor" },
				viewer: { role: "viewer" },
			},
			createdAt: "2026-07-22T20:00:00.000Z",
			updatedAt: new Date(),
		});
	});
}

test("nega leituras sem autenticação e entre usuários", async () => {
	const anonymous = environment.unauthenticatedContext().firestore();
	await assertFails(getDoc(doc(anonymous, "users/alice/data/settings")));
	await assertFails(getDoc(doc(googleDb("bob"), "users/alice/data/settings")));
});

test("nega provedor diferente do Google", async () => {
	await assertFails(
		setDoc(doc(passwordDb(), "users/alice/data/settings"), {
			endHour: 17,
			updatedAt: serverTimestamp(),
		}),
	);
});

test("permite perfil válido do proprietário Google", async () => {
	await assertSucceeds(
		setDoc(doc(googleDb(), "users/alice"), {
			displayName: "Alice",
			email: "alice@example.com",
			photoURL: "https://example.com/alice.png",
			updatedAt: serverTimestamp(),
		}),
	);
	await assertFails(
		setDoc(doc(googleDb(), "users/alice"), {
			displayName: "Alice",
			email: "alice@example.com",
			photoURL: "https://example.com/alice.png",
			isAdmin: true,
			updatedAt: serverTimestamp(),
		}),
	);
});

test("configuração geral é pública e somente administradores Google escrevem", async () => {
	await seedProfile("admin", true);
	const workday = {
		type: "workday",
		startTime: "08:00",
		endTime: "17:55",
		daysOfWeek: [1, 2, 3, 4, 5],
		updatedAt: serverTimestamp(),
	};
	await assertSucceeds(
		setDoc(doc(googleDb("admin"), "generalConfig/workday"), workday),
	);
	await assertSucceeds(
		setDoc(doc(googleDb("admin"), "generalConfig/payment-2026-08-05"), {
			type: "payment",
			dateTime: "2026-08-05T12:00:00",
			updatedAt: serverTimestamp(),
		}),
	);
	const anonymous = environment.unauthenticatedContext().firestore();
	await assertSucceeds(getDoc(doc(anonymous, "generalConfig/workday")));
	await assertSucceeds(getDocs(collection(anonymous, "generalConfig")));
	await assertFails(
		setDoc(doc(anonymous, "generalConfig/holiday-2026-09-07"), {
			type: "holiday",
			dateTime: "2026-09-07T17:55:00",
		}),
	);
	await seedProfile("member", false);
	await assertFails(
		setDoc(doc(googleDb("member"), "generalConfig/holiday-2026-09-07"), {
			type: "holiday",
			dateTime: "2026-09-07T17:55:00",
		}),
	);
	await seedProfile("password-admin", true);
	await assertFails(
		setDoc(doc(passwordDb("password-admin"), "generalConfig/holiday-2026-09-07"), {
			type: "holiday",
			dateTime: "2026-09-07T17:55:00",
		}),
	);
});

test("administrador edita calendários válidos sem poder remover o expediente", async () => {
	await seedProfile("admin", true);
	const adminDb = googleDb("admin");
	const workdayReference = doc(adminDb, "generalConfig/workday");
	await assertSucceeds(
		setDoc(workdayReference, {
			type: "workday",
			startTime: "09:00",
			endTime: "18:30",
			daysOfWeek: [1, 2, 3, 4, 5],
		}),
	);
	await assertFails(deleteDoc(workdayReference));
	const holidayReference = doc(
		adminDb,
		"generalConfig/holiday-2026-12-25",
	);
	await assertSucceeds(
		setDoc(holidayReference, {
			type: "holiday",
			dateTime: "2026-12-25T17:55:00",
		}),
	);
	await assertSucceeds(deleteDoc(holidayReference));
	await assertFails(
		setDoc(doc(adminDb, "generalConfig/holiday-invalid"), {
			type: "holiday",
			dateTime: "25/12/2026",
		}),
	);
});

test("aceita settings válidas e rejeita range ou campo desconhecido", async () => {
	const reference = doc(googleDb(), "users/alice/data/settings");
	await assertSucceeds(
		setDoc(reference, {
			endHour: 18,
			endMinutes: 55,
			accentPrimary: "#a78bfa",
			accentSecondary: "#362860",
			backgroundEnabled: true,
			backgroundStyle: "constellation",
			backgroundColorA: "#7c3aed",
			backgroundColorB: "#0ea5e9",
			backgroundSpeed: 55,
			backgroundIntensity: 55,
			showCustomCounters: true,
			dashboardLayout: "balanced",
			dashboardSectionOrder: [
				"standard",
				"custom",
				"weather",
				"timeline",
			],
			hiddenDashboardSections: ["weather"],
			weatherWidgets: [
				{
					id: "indaial",
					label1: "INDAIAL",
					label2: "SANTA CATARINA",
					forecastUrl: "https://forecast7.com/pt/n26d90n49d24/indaial/",
					enabled: true,
				},
			],
			notificationsEnabled: true,
			notificationLeadMinutes: [0, 15, 60],
			notificationSources: {
				workday: true,
				payment: true,
				holiday: false,
				counters: true,
			},
			notificationQuietHours: {
				enabled: true,
				startTime: "22:00",
				endTime: "07:00",
			},
			activeWorkspace: "team:team-alpha",
			updatedAt: serverTimestamp(),
		}),
	);
	await assertFails(setDoc(reference, { backgroundIntensity: 101 }));
	await assertFails(setDoc(reference, { activeWorkspace: "workspace-invalido" }));
	await assertFails(setDoc(reference, { dashboardLayout: "unknown" }));
	await assertFails(
		setDoc(reference, { dashboardSectionOrder: ["standard", "standard"] }),
	);
	await assertFails(
		setDoc(reference, { hiddenDashboardSections: ["standard"] }),
	);
	await assertFails(
		setDoc(reference, {
			weatherWidgets: [
				{
					id: "externo",
					label1: "EXTERNO",
					label2: "TESTE",
					forecastUrl: "https://example.com/weather/",
					enabled: true,
				},
			],
		}),
	);
	await assertFails(
		setDoc(reference, {
			weatherWidgets: Array.from({ length: 6 }, (_, index) => ({
				id: `city-${index}`,
				label1: `CITY ${index}`,
				label2: "TEST",
				forecastUrl: "https://forecast7.com/pt/n26d90n49d24/indaial/",
				enabled: true,
			})),
		}),
	);
	await assertFails(
		setDoc(reference, { notificationLeadMinutes: [15, 15] }),
	);
	await assertFails(
		setDoc(reference, { notificationLeadMinutes: [30] }),
	);
	await assertFails(
		setDoc(reference, {
			notificationSources: {
				workday: true,
				payment: true,
				holiday: true,
				counters: true,
				external: true,
			},
		}),
	);
	await assertFails(
		setDoc(reference, {
			notificationQuietHours: {
				enabled: true,
				startTime: "25:00",
				endTime: "07:00",
			},
		}),
	);
	await assertFails(setDoc(reference, { admin: true }));
});

test("settings da equipe são compartilhadas e viewers permanecem somente leitura", async () => {
	await seedTeam();
	const reference = "teams/team-alpha/data/settings";
	await assertSucceeds(
		setDoc(doc(googleDb("editor"), reference), {
			counterGroups: ["__outros__", "Produto", "Operação"],
			hiddenCounterGroups: ["Operação"],
			updatedAt: serverTimestamp(),
		}),
	);
	await assertSucceeds(getDoc(doc(googleDb("viewer"), reference)));
	await assertFails(
		setDoc(doc(googleDb("viewer"), reference), {
			counterGroups: ["Somente leitura"],
			hiddenCounterGroups: [],
			updatedAt: serverTimestamp(),
		}),
	);
	await assertFails(getDoc(doc(googleDb("outsider"), reference)));
	await assertFails(
		setDoc(doc(googleDb("editor"), reference), {
			counterGroups: [],
			hiddenCounterGroups: [],
			accentPrimary: "#ffffff",
			updatedAt: serverTimestamp(),
		}),
	);
});

test("somente dono e administradores podem excluir uma equipe", async () => {
	await seedTeam("team-admin-delete");
	await assertSucceeds(deleteDoc(doc(googleDb("admin"), "teams/team-admin-delete")));

	await seedTeam("team-owner-delete");
	await assertSucceeds(deleteDoc(doc(googleDb("owner"), "teams/team-owner-delete")));

	await seedTeam("team-member-delete");
	await assertFails(deleteDoc(doc(googleDb("editor"), "teams/team-member-delete")));
	await assertFails(deleteDoc(doc(googleDb("viewer"), "teams/team-member-delete")));
});

test("contadores da equipe respeitam slots e papéis", async () => {
	await seedTeam();
	const editorReference = teamCounterReference(googleDb("editor"), 14);
	await assertSucceeds(
		setDoc(editorReference, storedCounter(fixedCounter(14), 14)),
	);
	await assertSucceeds(
		getDoc(teamCounterReference(googleDb("viewer"), 14)),
	);
	await assertFails(
		setDoc(
			teamCounterReference(googleDb("viewer"), 0),
			storedCounter(fixedCounter(0), 0),
		),
	);
	await assertFails(
		getDoc(teamCounterReference(googleDb("outsider"), 14)),
	);
	await assertFails(
		setDoc(
			teamCounterReference(googleDb("editor"), 15),
			storedCounter(fixedCounter(15), 15),
		),
	);
});

test("convite pode ser lido pelo link exato sem expor a coleção", async () => {
	await seedTeam();
	const inviteId = "11111111-1111-4111-8111-111111111111";
	const invitePath = `teams/team-alpha/invites/${inviteId}`;
	await assertSucceeds(
		setDoc(doc(googleDb("owner"), invitePath), {
			teamId: "team-alpha",
			teamName: "Equipe Alpha",
			role: "editor",
			createdBy: "owner",
			createdAt: serverTimestamp(),
			expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
		}),
	);
	await assertSucceeds(getDoc(doc(googleDb("outsider"), invitePath)));
	await assertFails(
		getDocs(collection(googleDb("outsider"), "teams/team-alpha/invites")),
	);
	await assertFails(
		setDoc(doc(googleDb("viewer"), `teams/team-alpha/invites/${crypto.randomUUID()}`), {
			teamId: "team-alpha",
			teamName: "Equipe Alpha",
			role: "editor",
			createdBy: "viewer",
			createdAt: serverTimestamp(),
			expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
		}),
	);
});

test("aceita contadores fixo e recorrente válidos", async () => {
	await assertSucceeds(
		setDoc(personalCounterReference(googleDb(), 0), storedCounter(fixedCounter())),
	);
	await assertSucceeds(
		setDoc(
			personalCounterReference(googleDb(), 1),
			storedCounter(recurringCounter(), 1),
		),
	);
});

test("aceita dois contadores recorrentes com imagens e opacidades", async () => {
	const imageIds = [
		"11111111-1111-4111-8111-111111111111",
		"22222222-2222-4222-8222-222222222222",
	];
	for (const [index, imageId] of imageIds.entries()) {
		await assertSucceeds(
			setDoc(personalCounterReference(googleDb(), index), storedCounter({
				...recurringCounter(),
				id: `recurring-${index}`,
				name: index === 0 ? "Almoço" : "Academia",
				imageId,
				imageOpacity: index === 0 ? 51 : 100,
				overlayOpacity: index === 0 ? 30 : 55,
			}, index)),
		);
	}
});

test("permite cinco contadores e rejeita seis", async () => {
	for (let slot = 0; slot < 5; slot += 1) {
		await assertSucceeds(
			setDoc(
				personalCounterReference(googleDb(), slot),
				storedCounter(fixedCounter(slot), slot),
			),
		);
	}
	await assertFails(
		setDoc(
			personalCounterReference(googleDb(), 5),
			storedCounter(fixedCounter(5), 5),
		),
	);
});

test("premium aceita quinze slots e rejeita slot fora da faixa", async () => {
	await environment.withSecurityRulesDisabled(async (context) => {
		await setDoc(doc(context.firestore(), "users/premium"), {
			displayName: "Premium",
			tier: "premium",
		});
	});
	const premiumDb = googleDb("premium");
	await assertSucceeds(
		setDoc(
			personalCounterReference(premiumDb, 14, "premium"),
			storedCounter(fixedCounter(14), 14),
		),
	);
	await assertFails(
		setDoc(
			personalCounterReference(premiumDb, 15, "premium"),
			storedCounter(fixedCounter(15), 15),
		),
	);
});

test("documento agregado legado pode ser lido e removido, mas não recriado", async () => {
	const legacyPath = "users/alice/data/counters";
	await environment.withSecurityRulesDisabled(async (context) => {
		await setDoc(doc(context.firestore(), legacyPath), {
			items: [fixedCounter()],
			updatedAt: new Date(),
		});
	});
	const ownerDb = googleDb();
	const ownerReference = doc(ownerDb, legacyPath);
	await assertSucceeds(getDoc(ownerReference));
	const migration = writeBatch(ownerDb);
	migration.set(
		personalCounterReference(ownerDb, 0),
		storedCounter(fixedCounter()),
	);
	migration.delete(ownerReference);
	await assertSucceeds(migration.commit());
	await assertFails(
		setDoc(ownerReference, {
			items: [fixedCounter()],
			updatedAt: serverTimestamp(),
		}),
	);
});

test("rejeita schema, horários, dias e cores inválidos", async () => {
	const reference = personalCounterReference(googleDb(), 0);
	const invalidCounters = [
		{ ...fixedCounter(), name: "" },
		{ ...fixedCounter(), endAtMs: fixedCounter().startAtMs },
		{ ...fixedCounter(), color: "purple" },
		{ ...fixedCounter(), imageOpacity: 101 },
		{ ...fixedCounter(), overlayOpacity: -1 },
		{ ...fixedCounter(), unexpected: true },
		{ ...recurringCounter(), startTime: "25:00" },
		{ ...recurringCounter(), daysOfWeek: [] },
		{ ...recurringCounter(), daysOfWeek: [7] },
	];
	for (const counter of invalidCounters) {
		await assertFails(setDoc(reference, storedCounter(counter)));
	}
});
test("aceita checklists válidos de até 3 itens", async () => {
	await assertSucceeds(
		setDoc(
			personalCounterReference(googleDb(), 0),
			storedCounter({
					...fixedCounter(),
					checklist: [
						{ id: "task-1", text: "Revisão", done: false },
						{ id: "task-2", text: "Exercícios", done: true },
					],
				}),
		),
	);
});

test("rejeita checklists inválidos ou com mais de 3 itens", async () => {
	const reference = personalCounterReference(googleDb(), 0);
	const invalidChecklists = [
		[
			{ id: "t1", text: "1", done: false },
			{ id: "t2", text: "2", done: false },
			{ id: "t3", text: "3", done: false },
			{ id: "t4", text: "4", done: false },
		],
		[{ id: "t1", text: "Texto extremamente longo com mais de trinta caracteres", done: false }],
		[{ id: "t1", text: "Faltando done" }],
		[{ id: "t1", text: "done string", done: "false" }],
		[{ id: "t1", text: "Task", done: false, extra: true }],
	];
	for (const checklist of invalidChecklists) {
		await assertFails(
			setDoc(reference, storedCounter({ ...fixedCounter(), checklist })),
		);
	}
});

test("arquivo aceita inserção de contador fixo no início e exclusão permanente", async () => {
	const reference = doc(googleDb(), "users/alice/data/archive");
	await assertSucceeds(
		setDoc(reference, { items: [], updatedAt: serverTimestamp() }),
	);
	await assertSucceeds(
		setDoc(reference, {
			items: [archivedCounter()],
			updatedAt: serverTimestamp(),
		}),
	);
	await assertSucceeds(
		setDoc(reference, { items: [], updatedAt: serverTimestamp() }),
	);
});

test("arquivo rejeita recorrentes, alteração de histórico e mais de 100 itens", async () => {
	const ownerDb = googleDb();
	const reference = doc(ownerDb, "users/alice/data/archive");
	await assertSucceeds(setDoc(reference, { items: [] }));
	await assertFails(
		setDoc(reference, {
			items: [
				{
					...recurringCounter(),
					archivedAt: "2026-07-19T15:30:00.000Z",
				},
			],
		}),
	);
	await assertSucceeds(setDoc(reference, { items: [archivedCounter()] }));
	await assertFails(
		setDoc(reference, {
			items: [{ ...archivedCounter(), name: "Alterado" }],
		}),
	);
	await environment.withSecurityRulesDisabled(async (context) => {
		await setDoc(doc(context.firestore(), "users/alice/data/archive"), {
			items: Array.from({ length: 100 }, (_, index) => archivedCounter(index)),
		});
	});
	await assertFails(
		setDoc(reference, {
			items: [
				archivedCounter(101),
				...Array.from({ length: 100 }, (_, index) => archivedCounter(index)),
			],
		}),
	);
	await assertFails(getDoc(doc(googleDb("bob"), "users/alice/data/archive")));
});

test("nega subdocumentos fora da allowlist", async () => {
	await assertFails(
		setDoc(doc(googleDb(), "users/alice/data/private"), { value: true }),
	);
});

test("dispositivos, fila push e métricas são privados até para o proprietário", async () => {
	await environment.withSecurityRulesDisabled(async (context) => {
		const adminDb = context.firestore();
		await setDoc(doc(adminDb, "users/alice/devices/device-1234567890"), {
			fid: "fid-1234567890",
			permission: "granted",
		});
		await setDoc(doc(adminDb, "notificationQueue/job-1"), {
			uid: "alice",
			status: "scheduled",
		});
		await setDoc(doc(adminDb, "pushMetrics/2026-07-18"), { sent: 1 });
	});
	const owner = googleDb("alice");
	await assertFails(getDoc(doc(owner, "users/alice/devices/device-1234567890")));
	await assertFails(
		setDoc(doc(owner, "users/alice/devices/device-1234567890"), {
			permission: "granted",
		}),
	);
	await assertFails(getDoc(doc(owner, "notificationQueue/job-1")));
	await assertFails(getDoc(doc(owner, "pushMetrics/2026-07-18")));
});

test("documentos válidos podem ser lidos pelo proprietário", async () => {
	const reference = personalCounterReference(googleDb(), 0);
	await assertSucceeds(setDoc(reference, storedCounter(fixedCounter())));
	const snapshot = await assertSucceeds(getDoc(reference));
	assert.equal(snapshot.data().id, fixedCounter().id);
});

test("aceita metadados de até dez imagens e rejeita schema inválido", async () => {
	const reference = doc(googleDb(), "users/alice/data/images");
	const image = (slot = 0) => ({
		id: `image-${slot}`,
		slot,
		name: `Imagem ${slot}.png`,
		size: 1024,
		contentType: "image/png",
		createdAt: "2026-07-18T12:00:00.000Z",
	});
	await assertSucceeds(
		setDoc(reference, {
			items: Array.from({ length: 10 }, (_, slot) => image(slot)),
			updatedAt: serverTimestamp(),
		}),
	);
	await assertFails(
		setDoc(reference, {
			items: Array.from({ length: 11 }, (_, slot) => image(slot % 10)),
		}),
	);
	await assertFails(setDoc(reference, { items: [{ ...image(), size: 5242881 }] }));
	await assertFails(setDoc(reference, { items: [{ ...image(), admin: true }] }));
});

test("Storage mantém imagens privadas e exige Google OAuth", async () => {
	const path = "users/alice/counter-images/0";
	const bytes = new Uint8Array([137, 80, 78, 71]);
	await assertFails(
		uploadBytes(ref(environment.unauthenticatedContext().storage(), path), bytes, {
			contentType: "image/png",
		}),
	);
	await assertFails(
		uploadBytes(ref(passwordStorage(), path), bytes, { contentType: "image/png" }),
	);
	await assertSucceeds(
		uploadBytes(ref(googleStorage(), path), bytes, { contentType: "image/png" }),
	);
	await assertFails(getBytes(ref(googleStorage("bob"), path)));
	await assertSucceeds(getBytes(ref(googleStorage(), path)));
	await assertSucceeds(deleteObject(ref(googleStorage(), path)));
});

test("Storage limita cada arquivo a 5 MiB e cada usuário a dez slots", async () => {
	const ownerStorage = googleStorage();
	await assertSucceeds(
		uploadBytes(
			ref(ownerStorage, "users/alice/counter-images/0"),
			new Uint8Array(5 * 1024 * 1024),
			{ contentType: "image/jpeg" },
		),
	);
	await assertFails(
		uploadBytes(
			ref(ownerStorage, "users/alice/counter-images/1"),
			new Uint8Array(5 * 1024 * 1024 + 1),
			{ contentType: "image/jpeg" },
		),
	);
	await assertFails(
		uploadBytes(
			ref(ownerStorage, "users/alice/counter-images/1"),
			new Uint8Array([1]),
			{ contentType: "image/svg+xml" },
		),
	);
	await assertFails(
		uploadBytes(
			ref(ownerStorage, "users/alice/counter-images/10"),
			new Uint8Array([1]),
			{ contentType: "image/png" },
		),
	);
});
