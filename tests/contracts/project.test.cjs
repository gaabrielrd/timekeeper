const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const read = (relativePath) =>
	fs.readFileSync(path.join(root, relativePath), "utf8");

test("limite de cinco permanece alinhado entre HTML, cliente e rules", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const rules = read("firestore.rules");
	assert.match(html, /id="counter-count"[^>]*>0 \/ 5</);
	assert.match(html, /Até cinco/);
	assert.match(client, /const MAX_COUNTERS = 5;/);
	assert.match(rules, /items\.size\(\) <= 5/);
});

test("todos os backgrounds da interface possuem descrição no cliente", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const select = html.match(/<select id="background-style"[\s\S]*?<\/select>/);
	assert.ok(select, "select de backgrounds não encontrado");
	const options = [...select[0].matchAll(/<option value="([^"]+)"/g)].map(
		(match) => match[1],
	);
	assert.deepEqual(options, [
		"lava",
		"float",
		"glass",
		"rings",
		"aurora",
		"topography",
		"constellation",
	]);
	for (const option of options) {
		assert.match(client, new RegExp(`\\b${option}:\\s*"`));
	}
});

test("scripts locais essenciais carregam antes do runtime inline", () => {
	const html = read("public/index.html");
	const dataIndex = html.indexOf('src="src/data.js"');
	const timeIndex = html.indexOf('src="src/time.js"');
	const progressIndex = html.indexOf('src="src/progressbar.min.js"');
	const inlineRuntime = html.indexOf("var pBars = []");
	assert.ok(dataIndex >= 0 && dataIndex < inlineRuntime);
	assert.ok(timeIndex > dataIndex && timeIndex < inlineRuntime);
	assert.ok(progressIndex > timeIndex && progressIndex < inlineRuntime);
});

test("Analytics depende de consentimento explícito", () => {
	const html = read("public/index.html");
	const analytics = read("public/src/analytics.js");
	assert.match(html, /<script defer src="src\/analytics\.js"><\/script>/);
	assert.doesNotMatch(html, /googletagmanager\.com/);
	assert.match(analytics, /timekeeper:analytics-consent/);
	assert.match(analytics, /consent === "granted"/);
	assert.match(analytics, /google-analytics-script/);
	assert.ok(fs.existsSync(path.join(root, "public/privacy.html")));
});

test("exclusão de conta remove dados após reautenticação Google", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const privacy = read("public/privacy.html");
	assert.match(html, /id="delete-account-button"/);
	assert.match(client, /reauthenticateWithPopup\(userToDelete, googleProvider\)/);
	assert.match(client, /deleteDoc\(doc\(db, "users", userToDelete\.uid, "data", "settings"\)\)/);
	assert.match(client, /deleteDoc\(doc\(db, "users", userToDelete\.uid, "data", "counters"\)\)/);
	assert.match(client, /deleteUser\(userToDelete\)/);
	assert.match(privacy, /Excluir conta e dados/);
});

test("Hosting evita cache misto e emuladores usam portas documentadas", () => {
	const config = JSON.parse(read("firebase.json"));
	const noCacheSources = config.hosting.headers
		.filter((entry) =>
			entry.headers.some(
				(header) =>
					header.key === "Cache-Control" &&
					header.value.includes("must-revalidate"),
			),
		)
		.map((entry) => entry.source);
	assert.deepEqual(noCacheSources, ["**"]);
	assert.equal(config.emulators.auth.port, 9099);
	assert.equal(config.emulators.firestore.port, 8080);
	assert.equal(config.emulators.hosting.port, 5000);
});

test("cliente ativa emuladores apenas por opt-in local e inclui fallback Safari", () => {
	const client = read("public/src/firebase.js");
	assert.match(client, /\["localhost", "127\.0\.0\.1"\]/);
	assert.match(client, /has\("emulators"\)/);
	assert.match(client, /connectAuthEmulator\(auth/);
	assert.match(client, /connectFirestoreEmulator\(db/);
	assert.doesNotMatch(client, /Object\.hasOwn\(/);
	assert.match(client, /reducedMotionQuery\.addListener\(syncConstellation\)/);
});

test("JavaScript inline do HTML compila", () => {
	const html = read("public/index.html");
	const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
		.map((match) => match[1].trim())
		.filter(Boolean);
	assert.ok(scripts.length >= 1);
	for (const [index, script] of scripts.entries()) {
		assert.doesNotThrow(
			() => new vm.Script(script, { filename: `index-inline-${index}.js` }),
		);
	}
});

test("calendários estão ordenados e possuem ao menos uma data futura", () => {
	const context = vm.createContext({ Date });
	vm.runInContext(read("public/src/data.js"), context);
	const pagamentos = vm.runInContext("pagamentos", context);
	const feriados = vm.runInContext("feriados", context);
	for (const [name, dates] of Object.entries({ pagamentos, feriados })) {
		assert.ok(dates.length > 0, `${name} não pode ficar vazio`);
		for (let index = 1; index < dates.length; index += 1) {
			assert.ok(
				dates[index] > dates[index - 1],
				`${name} precisa estar em ordem cronológica`,
			);
		}
		assert.ok(
			dates.some((date) => date > new Date()),
			`${name} está vencido; atualize public/src/data.js`,
		);
	}
});

test("todos os links Markdown locais resolvem", () => {
	const markdownFiles = [
		path.join(root, "README.md"),
		path.join(root, "AGENTS.md"),
		...fs
			.readdirSync(path.join(root, "docs"))
			.filter((file) => file.endsWith(".md"))
			.map((file) => path.join(root, "docs", file)),
	];
	for (const file of markdownFiles) {
		const content = fs.readFileSync(file, "utf8");
		for (const match of content.matchAll(/\[[^\]]+\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)) {
			const target = path.resolve(path.dirname(file), match[1]);
			assert.ok(fs.existsSync(target), `${file} aponta para ${match[1]}`);
		}
	}
});
