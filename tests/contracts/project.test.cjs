const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");
const read = (relativePath) =>
	fs.readFileSync(path.join(root, relativePath), "utf8");

test("limite de contadores permanece alinhado entre HTML, cliente e rules", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const rules = read("firestore.rules");
	assert.match(html, /id="counter-count"/);
	assert.match(client, /getMaxCounters/);
	assert.match(rules, /getMaxCounters\(userId\)/);
	assert.match(rules, /isPremiumUser\(userId\) \? 15 : 5/);
	assert.match(rules, /match \/counters\/\{slot\} \{/);
	assert.match(rules, /'10', '11', '12', '13', '14'/);
});

test("documentos Firestore usam matches isolados para preservar o orçamento de expressões", () => {
	const rules = read("firestore.rules");
	assert.match(rules, /match \/data\/settings \{/);
	assert.match(rules, /match \/data\/counters \{/);
	assert.match(rules, /match \/data\/archive \{/);
	assert.match(rules, /match \/data\/images \{/);
	assert.doesNotMatch(rules, /function isValidDocument\(\)/);
	assert.match(rules, /days\.hasOnly\(\[0, 1, 2, 3, 4, 5, 6\]\)/);
	assert.doesNotMatch(rules, /function isValidDayAt\(/);
});

test("contadores usam subcoleções por slot com migração legada", () => {
	const client = read("public/src/firebase.js");
	const functions = read("functions/index.js");
	const rules = read("firestore.rules");
	assert.match(client, /function migrateLegacyCounters\(/);
	assert.match(client, /collection\(db, "users", userId, "counters"\)/);
	assert.match(client, /query\(activeCountersCollectionReference\(\), orderBy\("order"\)\)/);
	assert.match(client, /batch\.delete\(legacyReference\)/);
	assert.match(client, /migrationMaxCounters = legacy\.tier === "premium" \? 15 : 5/);
	assert.match(functions, /collection\(`users\/\$\{uid\}\/counters`\)\.orderBy\("order"\)/);
	assert.match(rules, /function isValidCounterSlot\(userId, slot\)/);
	assert.match(rules, /allow create, update: if false;/);
});

test("configuração geral mantém seed, modal administrativo e regras alinhados", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const rules = read("firestore.rules");
	const context = vm.createContext({ Date });
	vm.runInContext(read("public/src/data.js"), context);
	const seed = vm.runInContext("GENERAL_CONFIG_SEED", context);
	assert.equal(seed.filter((item) => item.type === "workday").length, 1);
	assert.equal(seed.filter((item) => item.type === "payment").length, 12);
	assert.equal(seed.filter((item) => item.type === "holiday").length, 10);
	assert.match(html, /id="admin-dialog"/);
	const adminDialogStart = html.indexOf('id="admin-dialog"');
	const adminDialogHTML = html.slice(adminDialogStart, html.indexOf("</dialog>", adminDialogStart));
	assert.equal((adminDialogHTML.match(/role="tab"/g) || []).length, 3);
	assert.match(client, /collection\(db, "generalConfig"\)/);
	assert.match(client, /snapshot\.data\(\)\?\.isAdmin === true/);
	assert.match(rules, /match \/generalConfig\/\{configId\}/);
	assert.match(rules, /function isGoogleAdmin\(\)/);
	assert.match(rules, /allow read: if true;/);
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
	const runtimeConfigIndex = html.indexOf('src="src/runtime-config.js"');
	const timeIndex = html.indexOf('src="src/time.js"');
	const occurrencesIndex = html.indexOf('src="src/occurrences.js"');
	const weatherIndex = html.indexOf('src="src/weather.js"');
	const notificationsIndex = html.indexOf('src="src/notifications.js"');
	const progressIndex = html.indexOf('src="src/progressbar.min.js"');
	const inlineRuntime = html.indexOf("var pBars = []");
	assert.ok(dataIndex >= 0 && dataIndex < inlineRuntime);
	assert.ok(runtimeConfigIndex > dataIndex && runtimeConfigIndex < inlineRuntime);
	assert.ok(timeIndex > runtimeConfigIndex && timeIndex < inlineRuntime);
	assert.ok(occurrencesIndex > timeIndex && occurrencesIndex < inlineRuntime);
	assert.ok(weatherIndex > occurrencesIndex && weatherIndex < inlineRuntime);
	assert.ok(notificationsIndex > weatherIndex && notificationsIndex < inlineRuntime);
	assert.ok(progressIndex > notificationsIndex && progressIndex < inlineRuntime);
});

test("fundações do roadmap mantêm clima e seções em contratos únicos", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const weather = read("public/src/weather.js");
	for (const section of ["standard", "custom", "weather"]) {
		assert.match(html, new RegExp(`data-dashboard-section="${section}"`));
	}
	assert.match(weather, /const SCRIPT_ID = "weatherwidget-io-js"/);
	assert.match(weather, /function applyColors\(/);
	assert.doesNotMatch(html, /function loadWeatherWidget\(/);
	assert.match(client, /TimekeeperWeather\?\.applyColors/);
	assert.match(client, /function normalizeDashboardPreferences\(/);
	assert.match(client, /function applyDashboardPreferences\(/);
	assert.match(client, /function iconButton\(/);
	assert.match(client, /DASHBOARD_CACHE_KEY/);
	assert.match(client, /section !== "standard"/);
});

test("layouts da dashboard permanecem alinhados entre UI, cliente e rules", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const rules = read("firestore.rules");
	assert.match(html, /id="dashboard-layout"/);
	assert.match(html, /id="dashboard-section-controls"/);
	for (const layout of ["focus", "balanced", "compact"]) {
		assert.match(client, new RegExp(`"${layout}"`));
		assert.match(rules, new RegExp(`'${layout}'`));
	}
	for (const field of [
		"dashboardLayout",
		"dashboardSectionOrder",
		"hiddenDashboardSections",
	]) {
		assert.match(client, new RegExp(`\\b${field}:`));
		assert.match(rules, new RegExp(`'${field}'`));
	}
	assert.match(rules, /dashboardSectionOrder\.toSet\(\)\.size\(\)/);
	assert.match(rules, /hiddenDashboardSections\.toSet\(\)\.size\(\)/);
});

test("widgets de clima personalizados mantêm limite e fornecedor alinhados", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const weather = read("public/src/weather.js");
	const rules = read("firestore.rules");
	assert.match(html, /id="weather-widget-list"/);
	assert.match(html, /id="weather-widget-form"/);
	assert.match(html, /id="weather-forecasts"/);
	assert.match(client, /weatherWidgets: window\.TimekeeperWeather\.cloneDefaults\(\)/);
	assert.match(client, /saveSettings\(\{ weatherWidgets: normalized \}\)/);
	assert.match(weather, /const MAX_WIDGETS = 5;/);
	assert.match(weather, /FORECAST_URL_PATTERN/);
	assert.match(weather, /function render\(/);
	assert.match(rules, /function hasValidWeatherWidgets\(/);
	assert.match(rules, /items\.size\(\) <= 5/);
	assert.match(rules, /forecast7\[\.\]com/);
});

test("clima dinâmico usa condição real com animação isolada e pausável", () => {
	const weather = read("public/src/weather.js");
	const styles = read("public/src/style.css");
	const serviceWorker = read("public/sw.js");
	assert.match(weather, /OPEN_METEO_URL = "https:\/\/api\.open-meteo\.com/);
	assert.match(weather, /function forecastCoordinates/);
	assert.match(weather, /function weatherCondition/);
	assert.match(weather, /IntersectionObserver/);
	assert.match(weather, /visibilitychange/);
	assert.match(styles, /\.forecast-atmosphere/);
	assert.match(styles, /data-weather-visible="false"/);
	assert.match(
		styles,
		/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.forecast-atmosphere \{[\s\S]*?display: none !important/,
	);
	assert.doesNotMatch(serviceWorker, /api\.open-meteo\.com/);
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
	assert.match(client, /getDocs\(\s*countersCollectionReference\(userToDelete\.uid\)/);
	assert.match(client, /counterItems\.forEach\(\(counterDoc\) => deleteBatch\.delete\(counterDoc\.ref\)\)/);
	for (const documentId of ["settings", "archive", "images"]) {
		assert.match(
			client,
			new RegExp(`deleteBatch\\.delete\\(doc\\(db, "users", userToDelete\\.uid, "data", "${documentId}"\\)\\)`),
		);
	}
	assert.match(client, /deleteBatch\.delete\(legacyCountersReference\(userToDelete\.uid\)\)/);
	assert.match(client, /deleteObject\(imageStorageReference\(userToDelete\.uid, slot\)\)/);
	assert.match(client, /deleteUser\(userToDelete\)/);
	assert.match(privacy, /Excluir conta e dados/);
});

test("Hosting evita cache misto e emuladores usam portas documentadas", () => {
	const config = JSON.parse(read("firebase.json"));
	const e2eConfig = JSON.parse(read("firebase.e2e.json"));
	const rulesTestConfig = JSON.parse(read("firebase.rules-test.json"));
	const noCacheSources = config.hosting.headers
		.filter((entry) =>
			entry.headers.some(
				(header) =>
					header.key === "Cache-Control" &&
					header.value.includes("must-revalidate"),
			),
		)
		.map((entry) => entry.source);
	assert.ok(noCacheSources.includes("**"));
	assert.ok(noCacheSources.includes("/sw.js"));
	assert.ok(noCacheSources.includes("/manifest.webmanifest"));
	assert.equal(config.emulators.auth.port, 9099);
	assert.equal(config.emulators.firestore.port, 8080);
	assert.equal(config.emulators.hosting.port, 5000);
	assert.equal(config.emulators.storage.port, 9199);
	assert.equal(e2eConfig.emulators.auth.port, 9099);
	assert.equal(e2eConfig.emulators.firestore.port, 8080);
	assert.equal(e2eConfig.emulators.storage.port, 9199);
	assert.equal(e2eConfig.emulators.ui.enabled, false);
	assert.equal(rulesTestConfig.emulators.firestore.port, 8081);
	assert.equal(rulesTestConfig.emulators.storage.port, 9198);
	assert.equal(rulesTestConfig.emulators.ui.enabled, false);
});

test("cliente ativa emuladores apenas por opt-in local e inclui fallback Safari", () => {
	const client = read("public/src/firebase.js");
	assert.match(client, /\["localhost", "127\.0\.0\.1"\]/);
	assert.match(client, /has\("emulators"\)/);
	assert.match(client, /connectAuthEmulator\(auth/);
	assert.match(client, /connectFirestoreEmulator\(db/);
	assert.match(client, /connectStorageEmulator\(storage/);
	assert.doesNotMatch(client, /Object\.hasOwn\(/);
	assert.match(client, /reducedMotionQuery\.addListener\(syncConstellation\)/);
});

test("PWA possui manifest, shell offline e cache restrito à própria origem", () => {
	const html = read("public/index.html");
	const manifest = JSON.parse(read("public/manifest.webmanifest"));
	const serviceWorker = read("public/sw.js");
	const pwa = read("public/src/pwa.js");
	assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
	assert.match(html, /id="install-app-button"[\s\S]*?hidden/);
	assert.match(html, /id="pwa-update-button"/);
	assert.equal(manifest.display, "standalone");
	assert.equal(manifest.start_url, "/");
	for (const expectedSize of ["192x192", "512x512"]) {
		assert.ok(manifest.icons.some((icon) => icon.sizes === expectedSize));
	}
	assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
	for (const icon of manifest.icons) {
		assert.ok(fs.existsSync(path.join(root, "public", icon.src)));
	}
	assert.ok(fs.existsSync(path.join(root, "public/offline.html")));
	assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
	assert.match(serviceWorker, /async function networkFirst/);
	assert.match(serviceWorker, /async function staleWhileRevalidate/);
	assert.doesNotMatch(serviceWorker, /googleapis|firebasestorage|weatherwidget\.io/);
	assert.match(pwa, /beforeinstallprompt/);
	assert.match(pwa, /SKIP_WAITING/);
	assert.match(pwa, /root\.isSecureContext/);
});

test("timeline deriva ocorrências sem persistir uma cópia", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const occurrences = read("public/src/occurrences.js");
	assert.match(html, /id="dashboard-timeline-section"/);
	assert.match(html, /id="timeline-source-filter"/);
	assert.match(html, /id="timeline-range"/);
	assert.doesNotMatch(html, /id="timeline-horizon"/);
	assert.match(client, /TimekeeperOccurrences\.buildOccurrences/);
	assert.match(client, /TimekeeperOccurrences\.buildTimelineProjection/);
	assert.match(client, /timelineSvgElement\("svg"/);
	assert.match(client, /data-orientation/);
	assert.match(client, /setInterval\(updateTimelineTemporalStates, 60000\)/);
	assert.doesNotMatch(client, /saveSettings\(\{[^}]*timeline/i);
	assert.match(occurrences, /function groupOccurrences/);
	assert.match(occurrences, /function buildTimelineProjection/);
	assert.match(occurrences, /const primaryAnchors = \[nextPayment, nextHoliday, nextCustom\]/);
});

test("calendário alterna a Timeline sem criar estado persistido", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const occurrences = read("public/src/occurrences.js");
	const styles = read("public/src/style.css");
	assert.match(html, /data-timeline-view="linear"/);
	assert.match(html, /data-timeline-view="calendar"/);
	assert.match(html, /Calendário mensal/);
	assert.match(client, /TimekeeperOccurrences\.buildCalendarProjection/);
	assert.match(client, /weekOnly: timelineOrientationQuery\.matches/);
	assert.match(client, /aria-current", "date"/);
	assert.match(client, /timeline-calendar-details/);
	assert.match(occurrences, /function buildCalendarProjection/);
	assert.match(occurrences, /function occurrenceOverlapsLocalDay/);
	assert.match(styles, /\.timeline-calendar-grid/);
	assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.timeline-calendar-day/);
	assert.doesNotMatch(client, /saveSettings\(\{[^}]*calendar/i);
});

test("notificações locais exigem gesto explícito e usam deduplicação", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const notifications = read("public/src/notifications.js");
	const serviceWorker = read("public/sw.js");
	const rules = read("firestore.rules");
	assert.match(html, /id="notifications-enabled"/);
	assert.match(html, /A permissão só será solicitada ao ativar/);
	assert.match(client, /notificationsEnabled\.addEventListener\("change"/);
	assert.match(client, /Notification\.requestPermission\(\)/);
	assert.doesNotMatch(client, /onAuthStateChanged[\s\S]{0,300}requestPermission/);
	assert.match(client, /navigator\.locks\?\.request/);
	assert.match(client, /showNotification/);
	assert.match(notifications, /function buildCandidates/);
	assert.match(notifications, /function isQuietTime/);
	assert.match(serviceWorker, /notificationclick/);
	for (const field of [
		"notificationsEnabled",
		"notificationLeadMinutes",
		"notificationSources",
		"notificationQuietHours",
	]) {
		assert.match(rules, new RegExp(`'${field}'`));
	}
});

test("push confiável usa FID privado, App Check, fila idempotente e TTL", () => {
	const client = read("public/src/firebase.js");
	const runtimeConfig = read("public/src/runtime-config.js");
	const serviceWorker = read("public/sw.js");
	const functions = read("functions/index.js");
	const functionsPackage = JSON.parse(read("functions/package.json"));
	const rules = read("firestore.rules");
	const indexes = JSON.parse(read("firestore.indexes.json"));
	const config = JSON.parse(read("firebase.json"));

	assert.equal(config.functions[0].source, "functions");
	assert.equal(config.emulators.functions.port, 5001);
	assert.equal(config.emulators.pubsub.port, 8085);
	assert.equal(functionsPackage.engines.node, "22");
	assert.match(runtimeConfig, /functionsRegion: "southamerica-east1"/);
	assert.match(client, /new ReCaptchaEnterpriseProvider/);
	assert.match(client, /onRegistered\(pushMessaging/);
	assert.match(client, /registerMessaging\(pushMessaging/);
	assert.match(client, /serviceWorkerRegistration: registration/);
	assert.match(client, /deletePushData/);
	assert.match(serviceWorker, /onBackgroundMessage/);
	assert.match(functions, /enforceAppCheck: true/);
	assert.match(functions, /schedule: "every 1 minutes"/);
	assert.match(functions, /fid: device\.fid/);
	assert.match(functions, /notificationJobId\(uid, deviceId, candidate\)/);
	assert.match(rules, /match \/devices\/\{deviceId\}[\s\S]*allow read, write: if false/);
	assert.match(rules, /match \/notificationQueue\/\{jobId\}[\s\S]*allow read, write: if false/);
	for (const collectionGroup of ["devices", "notificationQueue", "pushMetrics"]) {
		assert.ok(
			indexes.fieldOverrides.some(
				(item) => item.collectionGroup === collectionGroup && item.ttl === true,
			),
		);
	}
});

test("limites da biblioteca permanecem alinhados entre UI, cliente e Storage", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const storageRules = read("storage.rules");
	const config = JSON.parse(read("firebase.json"));
	assert.match(html, /0 B de 50 MB usados/);
	assert.match(html, /0 \/ 10 imagens/);
	assert.match(html, /até 5 MB/);
	assert.match(client, /const MAX_IMAGES = 10;/);
	assert.match(client, /const MAX_IMAGE_BYTES = 5 \* 1024 \* 1024;/);
	assert.match(storageRules, /request\.resource\.size <= 5 \* 1024 \* 1024/);
	assert.match(storageRules, /slot\.matches\('\^\[0-9\]\$'\)/);
	assert.equal(config.storage.rules, "storage.rules");
});

test("editor de contador possui prévia ao vivo e ações compactas de imagem", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	assert.match(html, /id="counter-preview-card"/);
	assert.match(html, /id="counter-preview-image"/);
	assert.match(html, /<fieldset class="counter-visual-fields">\s*<legend>Visual<\/legend>/);
	assert.match(html, /aria-label="Escolher imagem da biblioteca"/);
	assert.match(html, /aria-label="Remover imagem do card"/);
	assert.match(client, /function updateCounterPreview\(\)/);
	assert.match(client, /elements\.counterColor\.addEventListener\("input", updateCounterPreview\)/);
});

test("modo de foco cobre todos os cards, restaura a sessão e integra o shell PWA", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const focus = read("public/src/focus.js");
	const styles = read("public/src/style.css");
	const serviceWorker = read("public/sw.js");
	assert.equal((html.match(/data-focus-id="standard:/g) || []).length, 3);
	assert.match(html, /id="focus-mode"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/);
	assert.match(html, /id="focus-mode-close"[\s\S]*Sair do modo de foco/);
	assert.match(html, /id="focus-mode-media"[\s\S]*id="focus-mode-image"[\s\S]*id="focus-mode-overlay"/);
	assert.match(html, /id="focus-mode-soundscape"/);
	assert.match(html, /id="focus-mode-sound-select"/);
	assert.match(html, /id="focus-mode-sound-toggle"[\s\S]*aria-pressed="false"/);
	assert.match(html, /id="focus-mode-sound-volume"/);
	assert.match(html, /id="focus-mode-sound-loop"/);
	assert.match(html, /src="src\/focus\.js"/);
	assert.match(html, /src="src\/soundscapes\.js"/);
	assert.match(client, /panel\.dataset\.focusId = counter\.id/);
	assert.match(client, /focusButton\.dataset\.focusTrigger/);
	assert.match(focus, /timekeeper:focus-counter/);
	assert.match(focus, /root\.sessionStorage/);
	assert.match(focus, /event\.key === "Escape"/);
	assert.match(focus, /new MutationObserver\(tryRestore\)/);
	assert.match(focus, /function syncFocusedMedia/);
	assert.match(focus, /sourceImage\.style\.backgroundImage/);
	assert.match(focus, /sourceOverlay\.style\.opacity/);
	assert.match(focus, /soundController\?\.pause\(\)/);
	assert.match(focus, /function initializeSoundscape\(\)/);
	assert.match(styles, /body\.focus-mode-active \.focus-mode/);
	assert.match(styles, /body\.focus-mode-active\[data-background-enabled="true"\] \.ambient-background/);
	assert.match(styles, /\.focus-mode-image[\s\S]*background-size: cover/);
	assert.match(styles, /@media \(max-width: 800px\), \(orientation: portrait\)/);
	assert.match(styles, /\.focus-mode-soundscape/);
	assert.match(serviceWorker, /"\/src\/focus\.js"/);
	assert.match(serviceWorker, /"\/src\/soundscapes\.js"/);
	assert.doesNotMatch(
		serviceWorker.slice(serviceWorker.indexOf("const APP_SHELL"), serviceWorker.indexOf("let firebaseMessaging")),
		/"\/sounds\//,
	);
});

test("confirmações usam dialog acessível em vez da interface nativa", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const styles = read("public/src/style.css");
	assert.match(html, /id="confirmation-dialog"/);
	assert.match(html, /aria-describedby="confirmation-dialog-message"/);
	assert.match(client, /function confirmAction\(/);
	assert.match(client, /confirmationDialog\.showModal\(\)/);
	assert.doesNotMatch(client, /window\.(?:alert|confirm)\s*\(/);
	assert.match(styles, /\.confirmation-dialog-confirm\.is-danger/);
});

test("arquivo de conquistas exige ação manual e mantém limite alinhado", () => {
	const html = read("public/index.html");
	const client = read("public/src/firebase.js");
	const styles = read("public/src/style.css");
	const rules = read("firestore.rules");
	const roadmap = read("roadmap.md");
	assert.match(html, /id="archive-list"/);
	assert.match(html, /id="archive-count"[^>]*>0 \/ 100</);
	assert.match(
		html,
		/id="open-image-library"[\s\S]*id="open-archive-dialog"[\s\S]*>\s*Arquivados\s*<\/button>/,
	);
	assert.match(html, /id="archive-dialog"[\s\S]*aria-labelledby="archive-title"/);
	assert.match(client, /const MAX_ARCHIVED_COUNTERS = 100;/);
	assert.match(client, /runTransaction\(db, async \(transaction\)/);
	assert.match(client, /title: "Arquivar contador\?"/);
	assert.match(client, /counter\.type === "fixed"/);
	assert.match(client, /archiveButton\.hidden =[\s\S]{0,120}!isComplete/);
	assert.match(client, /className = "counter-card-archive"/);
	assert.match(styles, /\.a-panel:hover \.counter-card-archive/);
	assert.match(rules, /data\.items\.size\(\) <= 100/);
	assert.match(rules, /function isValidArchivedCounter\(/);
	assert.match(roadmap, /ação manual[^.]+após confirmação/);
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
		path.join(root, "roadmap.md"),
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

test("espaços de equipe e colaboração mantêm regras, cotas e papéis alinhados", () => {
	const rules = read("firestore.rules");
	assert.match(rules, /function isTeamMember\(teamId\)/);
	assert.match(rules, /function getTeamRole\(teamId\)/);
	assert.match(rules, /function getMaxCreatedTeams\(userId\)/);
	assert.match(rules, /function getMaxTeamMembers\(ownerUid\)/);
	assert.match(rules, /match \/teams\/\{teamId\}/);
	assert.match(rules, /isTeamEditorOrAdmin\(teamId\)/);
	assert.match(rules, /match \/data\/settings \{/);
	assert.match(rules, /isValidTeamSettingsDocument\(request\.resource\.data\)/);
	assert.match(rules, /isValidTeamInviteDocument\(teamId, request\.resource\.data\)/);
	const client = read("public/src/firebase.js");
	assert.match(client, /activeWorkspace: "personal"/);
	assert.match(client, /teamSettingsReference\(teamId\)/);
	assert.match(client, /canEditActiveWorkspace\(\)/);
	assert.match(client, /httpsCallable\(ensureFunctionsBackend\(\), "acceptTeamInvite"\)/);
	const functions = read("functions/index.js");
	assert.match(functions, /exports\.acceptTeamInvite = onCall/);
});

test("criação via linguagem natural e IA inclui parser client-side e function de geração", () => {
	const nlpParser = read("public/src/nlp-parser.js");
	assert.match(nlpParser, /parseNaturalLanguagePrompt/);
	assert.match(nlpParser, /parseRecurring/);
	assert.match(nlpParser, /parseFixed/);

	const nlpGenerator = read("functions/src/nlp-generator.js");
	assert.match(nlpGenerator, /generateChecklistForPrompt/);
	assert.match(nlpGenerator, /@google\/genai/);

	const html = read("public/index.html");
	assert.match(html, /id="nlp-prompt-input"/);
	assert.match(html, /id="nlp-parse-button"/);

	const client = read("public/src/firebase.js");
	assert.match(client, /httpsCallable\(functions, "generateAiChecklist"\)/);
	assert.match(client, /window\.NlpParser\.parseNaturalLanguagePrompt/);
});
