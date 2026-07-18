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
	doc,
	getDoc,
	serverTimestamp,
	setLogLevel,
	setDoc,
} = require("firebase/firestore");

setLogLevel("silent");

const projectId = "demo-timekeeper";
const rules = fs.readFileSync(
	path.resolve(__dirname, "../../firestore.rules"),
	"utf8",
);

let environment;

test.before(async () => {
	environment = await initializeTestEnvironment({
		projectId,
		firestore: { rules },
	});
});

test.afterEach(async () => {
	await environment.clearFirestore();
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

function fixedCounter(index = 1) {
	return {
		id: `fixed-${index}`,
		name: `Contador ${index}`,
		type: "fixed",
		startAtMs: Date.parse("2026-07-17T12:00:00.000Z"),
		endAtMs: Date.parse("2026-07-18T12:00:00.000Z"),
		color: null,
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
			updatedAt: serverTimestamp(),
		}),
	);
	await assertFails(setDoc(reference, { backgroundIntensity: 101 }));
	await assertFails(setDoc(reference, { admin: true }));
});

test("aceita contadores fixo e recorrente válidos", async () => {
	await assertSucceeds(
		setDoc(doc(googleDb(), "users/alice/data/counters"), {
			items: [fixedCounter(), recurringCounter()],
			updatedAt: serverTimestamp(),
		}),
	);
});

test("permite cinco contadores e rejeita seis", async () => {
	const reference = doc(googleDb(), "users/alice/data/counters");
	await assertSucceeds(
		setDoc(reference, {
			items: Array.from({ length: 5 }, (_, index) => fixedCounter(index)),
			updatedAt: serverTimestamp(),
		}),
	);
	await assertFails(
		setDoc(reference, {
			items: Array.from({ length: 6 }, (_, index) => fixedCounter(index)),
			updatedAt: serverTimestamp(),
		}),
	);
});

test("rejeita schema, horários, dias e cores inválidos", async () => {
	const reference = doc(googleDb(), "users/alice/data/counters");
	const invalidCounters = [
		{ ...fixedCounter(), name: "" },
		{ ...fixedCounter(), endAtMs: fixedCounter().startAtMs },
		{ ...fixedCounter(), color: "purple" },
		{ ...fixedCounter(), unexpected: true },
		{ ...recurringCounter(), startTime: "25:00" },
		{ ...recurringCounter(), daysOfWeek: [] },
		{ ...recurringCounter(), daysOfWeek: [7] },
	];
	for (const counter of invalidCounters) {
		await assertFails(setDoc(reference, { items: [counter] }));
	}
});

test("nega subdocumentos fora da allowlist", async () => {
	await assertFails(
		setDoc(doc(googleDb(), "users/alice/data/private"), { value: true }),
	);
});

test("documentos válidos podem ser lidos pelo proprietário", async () => {
	const reference = doc(googleDb(), "users/alice/data/counters");
	await assertSucceeds(setDoc(reference, { items: [fixedCounter()] }));
	const snapshot = await assertSucceeds(getDoc(reference));
	assert.equal(snapshot.data().items.length, 1);
});
