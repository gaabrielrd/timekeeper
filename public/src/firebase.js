import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
	GoogleAuthProvider,
	getAuth,
	onAuthStateChanged,
	signInWithPopup,
	signOut,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
	doc,
	getDoc,
	getFirestore,
	onSnapshot,
	serverTimestamp,
	setDoc,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const app = initializeApp({
	apiKey: "AIzaSyBOLyOQ6-g3VqotQf7pCej4CAhVXvC0oYY",
	authDomain: "timekeeper-d9a0a.firebaseapp.com",
	projectId: "timekeeper-d9a0a",
	storageBucket: "timekeeper-d9a0a.firebasestorage.app",
	messagingSenderId: "190447151292",
	appId: "1:190447151292:web:ccee2963c0e8eeb9f688b9",
});

const DEFAULTS = {
	endHour: 17,
	endMinutes: 55,
	accentPrimary: "#a78bfa",
	accentSecondary: "#362860",
	showCustomCounters: true,
	customCounters: [],
};
const MAX_COUNTERS = 3;
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const elements = {
	authButton: document.querySelector("#auth-button"),
	guestTimeConfig: document.querySelector("#guest-time-config"),
	guestHour: document.querySelector("#guest-config-hora"),
	guestMinutes: document.querySelector("#guest-config-minutos"),
	customVisibilityButton: document.querySelector("#custom-visibility-button"),
	customVisibilityIcon: document.querySelector("#custom-visibility-icon"),
	accountAvatar: document.querySelector("#account-avatar"),
	accountLabel: document.querySelector("#account-label"),
	sidebar: document.querySelector("#account-sidebar"),
	sidebarBackdrop: document.querySelector("#sidebar-backdrop"),
	sidebarClose: document.querySelector("#sidebar-close"),
	sidebarAvatar: document.querySelector("#sidebar-avatar"),
	sidebarName: document.querySelector("#sidebar-name"),
	sidebarEmail: document.querySelector("#sidebar-email"),
	signOutButton: document.querySelector("#sign-out-button"),
	hour: document.querySelector("#config-hora"),
	minutes: document.querySelector("#config-minutos"),
	accentPrimary: document.querySelector("#accent-primary"),
	accentSecondary: document.querySelector("#accent-secondary"),
	settingsState: document.querySelector("#settings-state"),
	counterForm: document.querySelector("#counter-form"),
	counterDialog: document.querySelector("#counter-dialog"),
	counterDialogKicker: document.querySelector("#counter-dialog-kicker"),
	counterDialogTitle: document.querySelector("#counter-dialog-title"),
	counterDialogClose: document.querySelector("#counter-dialog-close"),
	counterDialogCancel: document.querySelector("#counter-dialog-cancel"),
	openCounterModal: document.querySelector("#open-counter-modal"),
	openCounterModalLabel: document.querySelector("#open-counter-modal-label"),
	counterList: document.querySelector("#counter-list"),
	counterCount: document.querySelector("#counter-count"),
	counterLiveState: document.querySelector("#counter-live-state"),
	counterSidebarState: document.querySelector("#counter-sidebar-state"),
	counterMessage: document.querySelector("#counter-message"),
	counterSubmit: document.querySelector("#counter-submit"),
	counterColorEnabled: document.querySelector("#counter-color-enabled"),
	counterColor: document.querySelector("#counter-color"),
	counterType: document.querySelector("#counter-type"),
	fixedScheduleFields: document.querySelector("#fixed-schedule-fields"),
	recurringScheduleFields: document.querySelector(
		"#recurring-schedule-fields",
	),
	customSection: document.querySelector("#custom-counters-section"),
	customPanels: document.querySelector("#custom-panels"),
	toast: document.querySelector("#app-toast"),
};

let currentUser = null;
let userSettings = { ...DEFAULTS };
let unsubscribeSettings = null;
let unsubscribeCounters = null;
let customProgressBars = [];
let toastTimer = null;
let editingCounterId = null;

function isHexColor(value) {
	return /^#[0-9a-f]{6}$/i.test(value || "");
}

function getCookieValue(name) {
	const match = document.cookie
		.split("; ")
		.find((row) => row.startsWith(`${name}=`));
	return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

function guestTimeSettings() {
	const savedHour = Number(getCookieValue("hourTime"));
	const savedMinutes = Number(getCookieValue("minutesTime"));
	return {
		endHour: [17, 18, 19, 20, 21, 22].includes(savedHour)
			? savedHour
			: DEFAULTS.endHour,
		endMinutes: [25, 55].includes(savedMinutes)
			? savedMinutes
			: DEFAULTS.endMinutes,
	};
}

function syncTimeControls(hour, minutes) {
	const hourValue = String(hour);
	const minuteValue = String(minutes);
	elements.hour.value = hourValue;
	elements.minutes.value = minuteValue;
	elements.guestHour.value = hourValue;
	elements.guestMinutes.value = minuteValue;
	window.setHours();
	window.setMinutes();
}

function showToast(message) {
	window.clearTimeout(toastTimer);
	elements.toast.textContent = message;
	elements.toast.classList.add("is-visible");
	toastTimer = window.setTimeout(
		() => elements.toast.classList.remove("is-visible"),
		3200,
	);
}

function setSaveState(label, isSaving = false) {
	elements.settingsState.textContent = label;
	elements.settingsState.classList.toggle("is-saving", isSaving);
}

function setCounterState(label, state = "live") {
	for (const element of [
		elements.counterLiveState,
		elements.counterSidebarState,
	]) {
		element.textContent = label;
		element.dataset.state = state;
	}
}

function settingsReference(userId) {
	return doc(db, "users", userId, "data", "settings");
}

function countersReference(userId) {
	return doc(db, "users", userId, "data", "counters");
}

function applyAccents(primary, secondary) {
	const safePrimary = isHexColor(primary) ? primary : DEFAULTS.accentPrimary;
	const safeSecondary = isHexColor(secondary)
		? secondary
		: DEFAULTS.accentSecondary;
	document.documentElement.style.setProperty("--accent", safePrimary);
	document.documentElement.style.setProperty(
		"--accent-secondary",
		safeSecondary,
	);
	elements.accentPrimary.value = safePrimary;
	elements.accentSecondary.value = safeSecondary;
	if (!elements.counterColorEnabled.checked) {
		elements.counterColor.value = safePrimary;
	}
	window.pBars?.forEach((bar) => {
		bar.path?.setAttribute("stroke", safePrimary);
	});
	customProgressBars.forEach(({ counter, bar }) => {
		if (!counter.color) bar.path?.setAttribute("stroke", safePrimary);
	});
	document.querySelectorAll(".weatherwidget-io").forEach((widget) => {
		widget.dataset.accent = safeSecondary;
		widget.dataset.suncolor = safePrimary;
	});
}

function openSidebar() {
	if (!currentUser) return;
	document.body.classList.add("sidebar-open");
	elements.sidebar.inert = false;
	elements.sidebar.setAttribute("aria-hidden", "false");
	elements.authButton.setAttribute("aria-expanded", "true");
	elements.sidebarClose.focus();
}

function closeSidebar() {
	document.body.classList.remove("sidebar-open");
	elements.sidebar.inert = true;
	elements.sidebar.setAttribute("aria-hidden", "true");
	elements.authButton.setAttribute("aria-expanded", "false");
}

function friendlyAuthError(error) {
	const messages = {
		"auth/popup-closed-by-user": "Login cancelado.",
		"auth/popup-blocked": "O navegador bloqueou a janela de login.",
		"auth/operation-not-allowed":
			"Ative o login com Google no Firebase Authentication.",
	};
	return messages[error.code] || "Não foi possível entrar com o Google.";
}

function updateAccountUi(user) {
	if (!user) {
		elements.accountLabel.textContent = "Entrar com Google";
		elements.accountAvatar.replaceChildren(
			Object.assign(document.createElement("i"), {
				className: "material-icons",
				textContent: "person",
			}),
		);
		elements.authButton.title = "Entrar ou criar conta com o Google";
		elements.authButton.setAttribute("aria-haspopup", "false");
		return;
	}

	const compactName = user.displayName?.split(" ")[0] || "Minha conta";
	elements.accountLabel.textContent = compactName;
	elements.authButton.title = `Abrir menu de ${user.displayName || user.email}`;
	elements.authButton.setAttribute("aria-haspopup", "true");
	elements.sidebarName.textContent = user.displayName || "Conta Google";
	elements.sidebarEmail.textContent = user.email || "";
	elements.sidebarAvatar.src = user.photoURL || "src/favicon.png";
	elements.sidebarAvatar.alt = user.displayName
		? `Foto de ${user.displayName}`
		: "Foto da conta";

	if (user.photoURL) {
		const image = document.createElement("img");
		image.src = user.photoURL;
		image.alt = "";
		elements.accountAvatar.replaceChildren(image);
	}
}

async function saveSettings(partialSettings) {
	if (!currentUser) return false;
	setSaveState("Salvando...", true);
	try {
		await setDoc(
			settingsReference(currentUser.uid),
			{ ...partialSettings, updatedAt: serverTimestamp() },
			{ merge: true },
		);
		setSaveState("Sincronizado");
		return true;
	} catch (error) {
		console.error("Falha ao salvar configurações.", error);
		setSaveState("Erro ao salvar");
		showToast("Não foi possível sincronizar as alterações.");
		return false;
	}
}

async function saveCounters(counters) {
	if (!currentUser) return false;
	setCounterState("Salvando...", "saving");
	try {
		await setDoc(
			countersReference(currentUser.uid),
			{ items: counters.slice(0, MAX_COUNTERS), updatedAt: serverTimestamp() },
			{ merge: true },
		);
		setCounterState("Ao vivo", "live");
		return true;
	} catch (error) {
		console.error("Falha ao salvar contadores.", error);
		setCounterState("Erro de conexão", "error");
		showToast("Não foi possível sincronizar os contadores.");
		return false;
	}
}

function updateCustomCounters() {
	const now = new Date();
	customProgressBars.forEach(({ counter, pre, main, post, bar }) => {
		const state = window.resolveCounterState(counter, now);
		const isRecurring = counter.type === "recurring";
		if (isRecurring) {
			pre.textContent = state.phase === "active" ? "Ainda faltam" : "Começa em";
			post.textContent =
				state.phase === "active"
					? `para encerrar ${counter.name}.`
					: `para iniciar ${counter.name}.`;
		} else {
			pre.textContent = "Ainda faltam";
			post.textContent = `para ${counter.name}.`;
		}
		main.innerHTML = window.formatInterval(
			window.intervalBreakdown(state.target - now),
		);
		bar.animate(state.progress);
	});
}

function createCustomPanel(counter, index) {
	const panel = document.createElement("article");
	panel.className = "a-panel user-panel";
	panel.style.setProperty(
		"--counter-color",
		counter.color || "var(--accent)",
	);

	const top = document.createElement("div");
	top.className = "panel-top";
	const panelIndex = document.createElement("span");
	panelIndex.className = "panel-index";
	panelIndex.textContent = String(index + 4).padStart(2, "0");
	const title = document.createElement("h2");
	title.className = "panel-title";
	title.textContent = counter.name;
	top.append(panelIndex, title);

	const pre = document.createElement("p");
	pre.className = "panel-pre";
	pre.textContent = "Ainda faltam";
	const main = document.createElement("p");
	main.className = "panel-main";
	main.setAttribute("aria-live", "polite");
	main.textContent = "carregando...";
	const post = document.createElement("p");
	post.className = "panel-post";
	post.textContent = `para ${counter.name}.`;
	const progress = document.createElement("div");
	progress.className = "progress-bar";
	panel.append(top, pre, main, post, progress);

	const color = counter.color || userSettings.accentPrimary;
	const bar = new ProgressBar.Line(progress, {
		strokeWidth: 2,
		trailWidth: 2,
		easing: "easeInOut",
		duration: 900,
		color,
		trailColor: "#302c39",
		svgStyle: { width: "100%", height: "100%" },
	});
	customProgressBars.push({ counter, pre, main, post, bar });
	return panel;
}

function formatDateRange(counter) {
	if (counter.type === "recurring") {
		const days = [
			...new Set(
				(Array.isArray(counter.daysOfWeek) ? counter.daysOfWeek : []).map(Number),
			),
		];
		const orderedDays = [1, 2, 3, 4, 5, 6, 0].filter((day) =>
			days.includes(day),
		);
		const weekdayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
		let dayLabel = orderedDays
			.map((day) => weekdayNames[day])
			.filter(Boolean)
			.join(", ");
		if ([1, 2, 3, 4, 5].every((day) => days.includes(day)) && days.length === 5) {
			dayLabel = "Seg–Sex";
		}
		if ([0, 1, 2, 3, 4, 5, 6].every((day) => days.includes(day))) {
			dayLabel = "Todos os dias";
		}
		return `${dayLabel} · ${counter.startTime}–${counter.endTime}`;
	}
	const formatter = new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
	return `${formatter.format(new Date(counter.startAt))} → ${formatter.format(new Date(counter.endAt))}`;
}

function renderCounterList(counters) {
	elements.counterList.replaceChildren();
	counters.forEach((counter, index) => {
		const item = document.createElement("div");
		item.className = "counter-list-item";
		item.style.setProperty(
			"--counter-color",
			counter.color || "var(--accent)",
		);
		const dot = document.createElement("span");
		dot.className = "counter-list-dot";
		const copy = document.createElement("div");
		copy.className = "counter-list-copy";
		const name = document.createElement("strong");
		name.textContent = counter.name;
		const dates = document.createElement("span");
		dates.textContent = formatDateRange(counter);
		copy.append(name, dates);
		const actions = document.createElement("div");
		actions.className = "counter-list-actions";

		const actionButton = (icon, label, handler, disabled = false) => {
			const button = document.createElement("button");
			button.className = "counter-action";
			button.type = "button";
			button.title = label;
			button.setAttribute("aria-label", label);
			button.disabled = disabled;
			button.innerHTML = `<i class="material-icons" aria-hidden="true">${icon}</i>`;
			button.addEventListener("click", handler);
			return button;
		};

		actions.append(
			actionButton(
				"arrow_upward",
				`Mover ${counter.name} para cima`,
				() => reorderCounter(index, -1),
				index === 0,
			),
			actionButton(
				"arrow_downward",
				`Mover ${counter.name} para baixo`,
				() => reorderCounter(index, 1),
				index === counters.length - 1,
			),
			actionButton("edit", `Editar ${counter.name}`, () =>
				openCounterDialog(counter),
			),
		);
		const remove = actionButton(
			"delete_outline",
			`Excluir contador ${counter.name}`,
			() => deleteCounter(counter),
		);
		remove.classList.add("delete-counter");
		actions.append(remove);
		item.append(dot, copy, actions);
		elements.counterList.append(item);
	});
}

function updateCustomVisibility(counters = userSettings.customCounters) {
	const hasCounters = counters.length > 0;
	const isVisible = userSettings.showCustomCounters !== false;
	const shouldShowSection = hasCounters && isVisible;
	elements.customSection.classList.toggle("is-open", shouldShowSection);
	elements.customSection.setAttribute(
		"aria-hidden",
		String(!shouldShowSection),
	);
	elements.customVisibilityButton.hidden = !currentUser || !hasCounters;
	elements.customVisibilityButton.disabled = !hasCounters;
	elements.customVisibilityButton.setAttribute(
		"aria-pressed",
		String(isVisible),
	);
	elements.customVisibilityIcon.textContent = isVisible
		? "visibility"
		: "visibility_off";
	elements.customVisibilityButton.title = !hasCounters
		? "Nenhum contador personalizado"
		: isVisible
			? "Ocultar contadores personalizados"
			: "Mostrar contadores personalizados";
}

function renderCustomCounters(counters) {
	customProgressBars.forEach(({ bar }) => bar.destroy());
	customProgressBars = [];
	elements.customPanels.replaceChildren();
	counters.forEach((counter, index) => {
		elements.customPanels.append(createCustomPanel(counter, index));
	});
	updateCustomCounters();
	renderCounterList(counters);
	elements.counterCount.textContent = `${counters.length} / ${MAX_COUNTERS}`;
	const isFull = counters.length >= MAX_COUNTERS;
	elements.openCounterModal.disabled = isFull;
	elements.openCounterModalLabel.textContent = isFull
		? "Limite atingido"
		: "Novo contador";
	updateCustomVisibility(counters);
	if (!editingCounterId) {
		elements.counterSubmit.disabled = isFull;
		elements.counterSubmit.textContent = isFull
		? "Limite atingido"
		: "Criar contador";
	}
}

function applySettings(data) {
	const currentCounters = userSettings.customCounters || [];
	userSettings = {
		...DEFAULTS,
		...data,
		customCounters: currentCounters,
	};
	syncTimeControls(userSettings.endHour, userSettings.endMinutes);
	applyAccents(userSettings.accentPrimary, userSettings.accentSecondary);
	updateCustomVisibility(currentCounters);
}

function applyCounters(counters) {
	userSettings.customCounters = Array.isArray(counters)
		? counters
				.filter((counter) => counter && typeof counter === "object")
				.slice(0, MAX_COUNTERS)
				.map((counter) => ({
					...counter,
					type: counter.type === "recurring" ? "recurring" : "fixed",
				}))
		: [];
	renderCustomCounters(userSettings.customCounters);
}

function unsubscribeUserData() {
	unsubscribeSettings?.();
	unsubscribeCounters?.();
	unsubscribeSettings = null;
	unsubscribeCounters = null;
}

async function ensureUserData(user) {
	const profileReference = doc(db, "users", user.uid);
	const settingsDoc = settingsReference(user.uid);
	const countersDoc = countersReference(user.uid);
	const [legacySnapshot, settingsSnapshot, countersSnapshot] =
		await Promise.all([
			getDoc(profileReference),
			getDoc(settingsDoc),
			getDoc(countersDoc),
		]);
	const legacy = legacySnapshot.exists() ? legacySnapshot.data() : {};
	const writes = [
		setDoc(
			profileReference,
			{
				displayName: user.displayName || "",
				email: user.email || "",
				photoURL: user.photoURL || "",
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		),
	];
	if (!settingsSnapshot.exists()) {
		writes.push(
			setDoc(settingsDoc, {
				endHour: legacy.endHour ?? DEFAULTS.endHour,
				endMinutes: legacy.endMinutes ?? DEFAULTS.endMinutes,
				accentPrimary: isHexColor(legacy.accentPrimary)
					? legacy.accentPrimary
					: DEFAULTS.accentPrimary,
				accentSecondary: isHexColor(legacy.accentSecondary)
					? legacy.accentSecondary
					: DEFAULTS.accentSecondary,
				showCustomCounters: legacy.showCustomCounters !== false,
				updatedAt: serverTimestamp(),
			}),
		);
	}
	if (!countersSnapshot.exists()) {
		writes.push(
			setDoc(countersDoc, {
				items: Array.isArray(legacy.customCounters)
					? legacy.customCounters.slice(0, MAX_COUNTERS)
					: [],
				updatedAt: serverTimestamp(),
			}),
		);
	}
	await Promise.all(writes);
}

async function subscribeToUserData(user) {
	unsubscribeUserData();
	setSaveState("Conectando...", true);
	setCounterState("Conectando...", "connecting");
	try {
		await ensureUserData(user);
	} catch (error) {
		console.error("Falha ao preparar dados da conta.", error);
		setSaveState("Erro de conexão");
		setCounterState("Erro de conexão", "error");
		showToast("Não foi possível preparar os dados da conta.");
		return;
	}
	if (currentUser?.uid !== user.uid) return;

	unsubscribeSettings = onSnapshot(
		settingsReference(user.uid),
		(snapshot) => {
			if (snapshot.exists()) applySettings(snapshot.data());
			setSaveState("Sincronizado");
		},
		(error) => {
			console.error("Falha ao acompanhar configurações.", error);
			setSaveState("Erro de conexão");
			showToast("Não foi possível carregar os dados da conta.");
		},
	);
	unsubscribeCounters = onSnapshot(
		countersReference(user.uid),
		(snapshot) => {
			applyCounters(snapshot.exists() ? snapshot.data().items : []);
			setCounterState("Ao vivo", "live");
		},
		(error) => {
			console.error("Falha ao acompanhar contadores.", error);
			setCounterState("Erro de conexão", "error");
			showToast("Não foi possível atualizar os contadores em tempo real.");
		},
	);
}

async function deleteCounter(counter) {
	if (!window.confirm(`Excluir o contador “${counter.name}”?`)) return;
	const previousCounters = userSettings.customCounters;
	const nextCounters = userSettings.customCounters.filter(
		(item) => item.id !== counter.id,
	);
	userSettings.customCounters = nextCounters;
	renderCustomCounters(nextCounters);
	if (!(await saveCounters(nextCounters))) {
		userSettings.customCounters = previousCounters;
		renderCustomCounters(previousCounters);
	}
}

async function reorderCounter(index, direction) {
	const targetIndex = index + direction;
	if (targetIndex < 0 || targetIndex >= userSettings.customCounters.length) return;
	const previousCounters = [...userSettings.customCounters];
	const nextCounters = [...previousCounters];
	[nextCounters[index], nextCounters[targetIndex]] = [
		nextCounters[targetIndex],
		nextCounters[index],
	];
	userSettings.customCounters = nextCounters;
	renderCustomCounters(nextCounters);
	if (!(await saveCounters(nextCounters))) {
		userSettings.customCounters = previousCounters;
		renderCustomCounters(previousCounters);
	}
}

function toLocalInputValue(value) {
	const date = value ? new Date(value) : new Date();
	const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	return localDate.toISOString().slice(0, 16);
}

function closeCounterDialog() {
	if (elements.counterDialog.open) elements.counterDialog.close();
	editingCounterId = null;
	elements.counterForm.reset();
	elements.counterColor.disabled = true;
	elements.counterMessage.textContent = "";
}

function setCounterType(type) {
	const isRecurring = type === "recurring";
	elements.counterType.value = isRecurring ? "recurring" : "fixed";
	elements.fixedScheduleFields.hidden = isRecurring;
	elements.fixedScheduleFields
		.querySelectorAll("input")
		.forEach((input) => (input.disabled = isRecurring));
	elements.recurringScheduleFields.hidden = !isRecurring;
	elements.recurringScheduleFields.disabled = !isRecurring;
}

function openCounterDialog(counter = null) {
	editingCounterId = counter?.id || null;
	elements.counterForm.reset();
	elements.counterMessage.textContent = "";
	const isEditing = Boolean(counter);
	elements.counterDialogKicker.textContent = isEditing
		? "Editar contador"
		: "Novo contador";
	elements.counterDialogTitle.textContent = isEditing
		? counter.name
		: "Criar contador";
	elements.counterSubmit.textContent = isEditing
		? "Salvar alterações"
		: "Criar contador";
	elements.counterSubmit.disabled = false;

	const counterType = counter?.type === "recurring" ? "recurring" : "fixed";
	elements.counterForm.elements.name.value = counter?.name || "";
	setCounterType(counterType);
	if (counterType === "recurring") {
		elements.counterForm.elements.startTime.value = counter.startTime || "08:00";
		elements.counterForm.elements.endTime.value = counter.endTime || "17:00";
		const selectedDays = new Set(
			(Array.isArray(counter.daysOfWeek) ? counter.daysOfWeek : []).map(Number),
		);
		elements.counterForm
			.querySelectorAll('input[name="daysOfWeek"]')
			.forEach((input) => (input.checked = selectedDays.has(Number(input.value))));
	} else {
		const startDate = counter ? new Date(counter.startAt) : new Date();
		if (!counter) startDate.setSeconds(0, 0);
		const endDate = counter
			? new Date(counter.endAt)
			: new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
		elements.counterForm.elements.startAt.value = toLocalInputValue(startDate);
		elements.counterForm.elements.endAt.value = toLocalInputValue(endDate);
	}
	elements.counterColorEnabled.checked = Boolean(counter?.color);
	elements.counterColor.disabled = !counter?.color;
	elements.counterColor.value = counter?.color || userSettings.accentPrimary;
	elements.counterDialog.showModal();
	elements.counterForm.elements.name.focus();
}

elements.authButton.addEventListener("click", async () => {
	if (currentUser) {
		openSidebar();
		return;
	}
	try {
		await signInWithPopup(auth, googleProvider);
	} catch (error) {
		console.error("Falha no login com Google.", error);
		showToast(friendlyAuthError(error));
	}
});

elements.sidebarBackdrop.addEventListener("click", closeSidebar);
elements.sidebarClose.addEventListener("click", closeSidebar);
elements.openCounterModal.addEventListener("click", () => openCounterDialog());
elements.counterDialogClose.addEventListener("click", closeCounterDialog);
elements.counterDialogCancel.addEventListener("click", closeCounterDialog);
elements.counterDialog.addEventListener("click", (event) => {
	if (event.target === elements.counterDialog) closeCounterDialog();
});
elements.counterDialog.addEventListener("close", () => {
	editingCounterId = null;
	elements.counterForm.reset();
	elements.counterColor.disabled = true;
	elements.counterMessage.textContent = "";
});
elements.customVisibilityButton.addEventListener("click", async () => {
	const previousValue = userSettings.showCustomCounters !== false;
	userSettings.showCustomCounters = !previousValue;
	updateCustomVisibility();
	if (
		!(await saveSettings({
			showCustomCounters: userSettings.showCustomCounters,
		}))
	) {
		userSettings.showCustomCounters = previousValue;
		updateCustomVisibility();
	}
});
elements.signOutButton.addEventListener("click", async () => {
	closeSidebar();
	await signOut(auth);
});
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && !elements.counterDialog.open) closeSidebar();
});

elements.hour.addEventListener("change", () => {
	saveSettings({ endHour: Number(elements.hour.value) });
});
elements.minutes.addEventListener("change", () => {
	saveSettings({ endMinutes: Number(elements.minutes.value) });
});
elements.accentPrimary.addEventListener("input", () => {
	applyAccents(
		elements.accentPrimary.value,
		elements.accentSecondary.value,
	);
});
elements.accentSecondary.addEventListener("input", () => {
	applyAccents(
		elements.accentPrimary.value,
		elements.accentSecondary.value,
	);
});
elements.accentPrimary.addEventListener("change", () => {
	saveSettings({ accentPrimary: elements.accentPrimary.value });
});
elements.accentSecondary.addEventListener("change", () => {
	saveSettings({ accentSecondary: elements.accentSecondary.value });
});
elements.counterColorEnabled.addEventListener("change", () => {
	elements.counterColor.disabled = !elements.counterColorEnabled.checked;
	if (!elements.counterColorEnabled.checked) {
		elements.counterColor.value = userSettings.accentPrimary;
	}
});
elements.counterType.addEventListener("change", () => {
	setCounterType(elements.counterType.value);
});

elements.counterForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	elements.counterMessage.textContent = "";
	if (!editingCounterId && userSettings.customCounters.length >= MAX_COUNTERS) {
		elements.counterMessage.textContent = "Você já possui três contadores.";
		return;
	}
	const data = new FormData(elements.counterForm);
	const name = String(data.get("name") || "").trim();
	const type = data.get("type") === "recurring" ? "recurring" : "fixed";
	if (!name) {
		elements.counterMessage.textContent = "Informe o nome do contador.";
		return;
	}
	let schedule;
	if (type === "recurring") {
		const startTime = String(data.get("startTime") || "");
		const endTime = String(data.get("endTime") || "");
		const daysOfWeek = [
			...new Set(
				data
					.getAll("daysOfWeek")
					.map(Number)
					.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
			),
		].sort((a, b) => a - b);
		if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
			elements.counterMessage.textContent = "Informe os horários inicial e final.";
			return;
		}
		if (!daysOfWeek.length) {
			elements.counterMessage.textContent = "Selecione pelo menos um dia da semana.";
			return;
		}
		schedule = { type, startTime, endTime, daysOfWeek };
	} else {
		const startAt = new Date(String(data.get("startAt")));
		const endAt = new Date(String(data.get("endAt")));
		if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
			elements.counterMessage.textContent = "Preencha as datas de início e fim.";
			return;
		}
		if (endAt <= startAt) {
			elements.counterMessage.textContent = "O fim precisa ser posterior ao início.";
			return;
		}
		schedule = {
			type,
			startAt: startAt.toISOString(),
			endAt: endAt.toISOString(),
		};
	}
	const existingCounter = editingCounterId
		? userSettings.customCounters.find((counter) => counter.id === editingCounterId)
		: null;
	if (editingCounterId && !existingCounter) {
		elements.counterMessage.textContent = "Este contador não está mais disponível.";
		return;
	}
	const counter = {
		id:
			existingCounter?.id ||
			crypto.randomUUID?.() ||
			`${Date.now()}-${Math.random()}`,
		name,
		...schedule,
		color: data.get("colorEnabled") ? String(data.get("color")) : null,
		createdAt: existingCounter?.createdAt || new Date().toISOString(),
	};
	const nextCounters = existingCounter
		? userSettings.customCounters.map((item) =>
				item.id === existingCounter.id ? counter : item,
			)
		: [...userSettings.customCounters, counter];
	elements.counterSubmit.disabled = true;
	elements.counterSubmit.textContent = "Salvando...";
	if (await saveCounters(nextCounters)) {
		closeCounterDialog();
	} else {
		elements.counterSubmit.disabled = false;
		elements.counterSubmit.textContent = existingCounter
			? "Salvar alterações"
			: "Criar contador";
	}
});

onAuthStateChanged(auth, (user) => {
	currentUser = user;
	document.body.classList.toggle("signed-in", Boolean(user));
	elements.guestTimeConfig.hidden = Boolean(user);
	updateAccountUi(user);
	if (user) {
		subscribeToUserData(user);
		return;
	}
	unsubscribeUserData();
	closeSidebar();
	applySettings({ ...DEFAULTS, ...guestTimeSettings() });
	applyCounters([]);
});

window.setInterval(updateCustomCounters, 1000);
