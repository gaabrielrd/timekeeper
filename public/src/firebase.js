import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
	GoogleAuthProvider,
	connectAuthEmulator,
	deleteUser,
	getAuth,
	onAuthStateChanged,
	reauthenticateWithPopup,
	signInWithPopup,
	signOut,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
	connectFirestoreEmulator,
	deleteDoc,
	doc,
	getDoc,
	getFirestore,
	onSnapshot,
	serverTimestamp,
	setDoc,
	writeBatch,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import {
	connectStorageEmulator,
	deleteObject,
	getDownloadURL,
	getStorage,
	ref,
	uploadBytesResumable,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const useLocalEmulators =
	["localhost", "127.0.0.1"].includes(window.location.hostname) &&
	new URLSearchParams(window.location.search).has("emulators");
const firebaseConfig = {
	apiKey: "AIzaSyBOLyOQ6-g3VqotQf7pCej4CAhVXvC0oYY",
	authDomain: "timekeeper-d9a0a.firebaseapp.com",
	projectId: "timekeeper-d9a0a",
	storageBucket: "timekeeper-d9a0a.appspot.com",
	messagingSenderId: "190447151292",
	appId: "1:190447151292:web:ccee2963c0e8eeb9f688b9",
};
if (useLocalEmulators) {
	firebaseConfig.authDomain = "demo-timekeeper.firebaseapp.com";
	firebaseConfig.projectId = "demo-timekeeper";
}
const app = initializeApp(firebaseConfig);

const DEFAULTS = {
	endHour: 17,
	endMinutes: 55,
	accentPrimary: "#a78bfa",
	accentSecondary: "#362860",
	backgroundEnabled: false,
	backgroundStyle: "lava",
	backgroundColorA: "#7c3aed",
	backgroundColorB: "#0ea5e9",
	backgroundSpeed: 55,
	backgroundIntensity: 55,
	showCustomCounters: true,
	customCounters: [],
};
const MAX_COUNTERS = 5;
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_USER_IMAGE_BYTES = MAX_IMAGES * MAX_IMAGE_BYTES;
const ALLOWED_IMAGE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/avif",
]);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
if (useLocalEmulators) {
	connectAuthEmulator(auth, "http://127.0.0.1:9099", {
		disableWarnings: true,
	});
	connectFirestoreEmulator(db, "127.0.0.1", 8080);
	connectStorageEmulator(storage, "127.0.0.1", 9199);
	document.body.dataset.emulators = "true";
}
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
	deleteAccountButton: document.querySelector("#delete-account-button"),
	hour: document.querySelector("#config-hora"),
	minutes: document.querySelector("#config-minutos"),
	accentPrimary: document.querySelector("#accent-primary"),
	accentSecondary: document.querySelector("#accent-secondary"),
	backgroundEnabled: document.querySelector("#background-enabled"),
	backgroundControls: document.querySelector("#background-controls"),
	backgroundStyle: document.querySelector("#background-style"),
	backgroundDescription: document.querySelector("#background-description"),
	backgroundColorA: document.querySelector("#background-color-a"),
	backgroundColorB: document.querySelector("#background-color-b"),
	backgroundSpeed: document.querySelector("#background-speed"),
	backgroundSpeedOutput: document.querySelector("#background-speed-output"),
	backgroundIntensity: document.querySelector("#background-intensity"),
	backgroundIntensityOutput: document.querySelector(
		"#background-intensity-output",
	),
	constellationCanvas: document.querySelector("#constellation-canvas"),
	settingsState: document.querySelector("#settings-state"),
	counterForm: document.querySelector("#counter-form"),
	counterDialog: document.querySelector("#counter-dialog"),
	counterDialogKicker: document.querySelector("#counter-dialog-kicker"),
	counterDialogTitle: document.querySelector("#counter-dialog-title"),
	counterDialogClose: document.querySelector("#counter-dialog-close"),
	counterDialogCancel: document.querySelector("#counter-dialog-cancel"),
	counterPreviewCard: document.querySelector("#counter-preview-card"),
	counterPreviewImage: document.querySelector("#counter-preview-image"),
	counterPreviewOverlay: document.querySelector("#counter-preview-overlay"),
	counterPreviewTitle: document.querySelector("#counter-preview-title"),
	counterPreviewPost: document.querySelector("#counter-preview-post"),
	openCounterModal: document.querySelector("#open-counter-modal"),
	openCounterModalLabel: document.querySelector("#open-counter-modal-label"),
	openImageLibrary: document.querySelector("#open-image-library"),
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
	counterImageId: document.querySelector("#counter-image-id"),
	counterImagePreview: document.querySelector("#counter-image-preview"),
	counterImageName: document.querySelector("#counter-image-name"),
	chooseCounterImage: document.querySelector("#choose-counter-image"),
	removeCounterImage: document.querySelector("#remove-counter-image"),
	counterImageOpacityControls: document.querySelector(
		"#counter-image-opacity-controls",
	),
	counterImageOpacity: document.querySelector("#counter-image-opacity"),
	counterImageOpacityOutput: document.querySelector(
		"#counter-image-opacity-output",
	),
	counterOverlayOpacity: document.querySelector("#counter-overlay-opacity"),
	counterOverlayOpacityOutput: document.querySelector(
		"#counter-overlay-opacity-output",
	),
	imageLibraryDialog: document.querySelector("#image-library-dialog"),
	imageLibraryClose: document.querySelector("#image-library-close"),
	imageLibraryUsage: document.querySelector("#image-library-usage"),
	imageLibraryCount: document.querySelector("#image-library-count"),
	imageLibraryUsageBar: document.querySelector("#image-library-usage-bar"),
	imageUploadDropzone: document.querySelector("#image-upload-dropzone"),
	imageUploadInput: document.querySelector("#image-upload-input"),
	imageUploadProgress: document.querySelector("#image-upload-progress"),
	imageUploadLabel: document.querySelector("#image-upload-label"),
	imageUploadProgressBar: document.querySelector("#image-upload-progress-bar"),
	imageLibraryMessage: document.querySelector("#image-library-message"),
	imageLibraryGrid: document.querySelector("#image-library-grid"),
	imageLibraryEmpty: document.querySelector("#image-library-empty"),
	customSection: document.querySelector("#custom-counters-section"),
	customPanels: document.querySelector("#custom-panels"),
	toast: document.querySelector("#app-toast"),
};

let currentUser = null;
let userSettings = { ...DEFAULTS };
let unsubscribeSettings = null;
let unsubscribeCounters = null;
let unsubscribeImages = null;
let customProgressBars = [];
let toastTimer = null;
let editingCounterId = null;
let userImages = [];
let imageUrls = new Map();
let imageLoadVersion = 0;
let activeUploadTask = null;
let librarySelectsCounter = false;
let imageLibraryAvailable = true;

function isHexColor(value) {
	return /^#[0-9a-f]{6}$/i.test(value || "");
}

function hasOwn(object, property) {
	return Object.prototype.hasOwnProperty.call(object, property);
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

function imagesReference(userId) {
	return doc(db, "users", userId, "data", "images");
}

function imageStorageReference(userId, slot) {
	return ref(storage, `users/${userId}/counter-images/${slot}`);
}

function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
	return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

function normalizeImage(image) {
	if (!image || typeof image !== "object") return null;
	const slot = Number(image.slot);
	const size = Number(image.size);
	const contentType = String(image.contentType || "");
	const id = String(image.id || "").slice(0, 100);
	const name = String(image.name || "").trim().slice(0, 120);
	if (
		!id ||
		!name ||
		!Number.isInteger(slot) ||
		slot < 0 ||
		slot >= MAX_IMAGES ||
		!Number.isInteger(size) ||
		size <= 0 ||
		size > MAX_IMAGE_BYTES ||
		!ALLOWED_IMAGE_TYPES.has(contentType)
	) {
		return null;
	}
	return {
		id,
		slot,
		name,
		size,
		contentType,
		createdAt:
			typeof image.createdAt === "string"
				? image.createdAt.slice(0, 40)
				: new Date().toISOString(),
	};
}

function normalizeImages(images) {
	const seenIds = new Set();
	const seenSlots = new Set();
	return (Array.isArray(images) ? images : [])
		.map(normalizeImage)
		.filter((image) => {
			if (!image || seenIds.has(image.id) || seenSlots.has(image.slot)) return false;
			seenIds.add(image.id);
			seenSlots.add(image.slot);
			return true;
		})
		.sort((first, second) => first.slot - second.slot)
		.slice(0, MAX_IMAGES);
}

function selectedImage() {
	return userImages.find((image) => image.id === elements.counterImageId.value);
}

function updateCounterPreview() {
	const name = elements.counterForm.elements.name.value.trim() || "Nome do contador";
	const color = elements.counterColorEnabled.checked
		? elements.counterColor.value
		: userSettings.accentPrimary;
	const image = selectedImage();
	const imageUrl = image ? imageUrls.get(image.id) : "";
	const imageOpacity = boundedNumber(
		elements.counterImageOpacity.value,
		0,
		100,
		100,
	);
	const overlayOpacity = boundedNumber(
		elements.counterOverlayOpacity.value,
		0,
		100,
		55,
	);

	elements.counterPreviewTitle.textContent = name;
	elements.counterPreviewPost.textContent = `para ${name}.`;
	elements.counterPreviewCard.style.setProperty("--counter-preview-accent", color);
	elements.counterPreviewCard.classList.toggle("has-image", Boolean(imageUrl));
	elements.counterPreviewImage.style.backgroundImage = imageUrl
		? `url(${JSON.stringify(imageUrl)})`
		: "";
	elements.counterPreviewImage.style.opacity = imageUrl
		? String(imageOpacity / 100)
		: "0";
	elements.counterPreviewOverlay.style.opacity = imageUrl
		? String(overlayOpacity / 100)
		: "0";
}

function setSelectedCounterImage(imageId = null) {
	const requestedId =
		typeof imageId === "string" && imageId.trim() ? imageId.trim() : "";
	const image = userImages.find((item) => item.id === requestedId) || null;
	const url = image ? imageUrls.get(image.id) : "";
	elements.counterImageId.value = requestedId;
	elements.counterImageName.textContent = image
		? image.name
		: requestedId
			? "Imagem indisponível"
			: "Sem imagem";
	elements.counterImagePreview.classList.toggle("has-image", Boolean(url));
	elements.counterImagePreview.style.backgroundImage = url
		? `url(${JSON.stringify(url)})`
		: "";
	elements.removeCounterImage.disabled = !requestedId;
	elements.counterImageOpacityControls.hidden = !requestedId;
	updateCounterPreview();
}

function syncCounterOpacityOutputs() {
	elements.counterImageOpacityOutput.textContent = `${elements.counterImageOpacity.value}%`;
	elements.counterOverlayOpacityOutput.textContent = `${elements.counterOverlayOpacity.value}%`;
	updateCounterPreview();
}

function renderImageLibrary() {
	const usedBytes = userImages.reduce((total, image) => total + image.size, 0);
	const usage = Math.min(100, (usedBytes / MAX_USER_IMAGE_BYTES) * 100);
	elements.imageLibraryUsage.textContent = `${formatBytes(usedBytes)} de 50 MB usados`;
	elements.imageLibraryCount.textContent = `${userImages.length} / ${MAX_IMAGES} imagens`;
	elements.imageLibraryUsageBar.style.width = `${usage}%`;
	elements.imageUploadInput.disabled =
		!imageLibraryAvailable ||
		Boolean(activeUploadTask) ||
		userImages.length >= MAX_IMAGES;
	elements.imageUploadDropzone.classList.toggle(
		"is-disabled",
		elements.imageUploadInput.disabled,
	);
	elements.imageLibraryEmpty.hidden = userImages.length > 0;
	elements.imageLibraryGrid.replaceChildren();

	userImages.forEach((image) => {
		const item = document.createElement("article");
		item.className = "library-image-item";
		item.classList.toggle(
			"is-selected",
			image.id === elements.counterImageId.value,
		);
		const select = document.createElement("button");
		select.type = "button";
		select.className = "library-image-select";
		select.disabled = !librarySelectsCounter;
		select.setAttribute(
			"aria-label",
			librarySelectsCounter
				? `Usar ${image.name} neste contador`
				: `Imagem ${image.name}`,
		);
		const thumbnail = document.createElement("span");
		thumbnail.className = "library-image-thumbnail";
		const url = imageUrls.get(image.id);
		if (url) {
			const preview = document.createElement("img");
			preview.src = url;
			preview.alt = "";
			preview.loading = "lazy";
			thumbnail.append(preview);
		} else {
			const icon = document.createElement("i");
			icon.className = "material-icons";
			icon.textContent = "broken_image";
			thumbnail.append(icon);
		}
		const copy = document.createElement("span");
		copy.className = "library-image-copy";
		const name = document.createElement("strong");
		name.textContent = image.name;
		const size = document.createElement("small");
		size.textContent = formatBytes(image.size);
		copy.append(name, size);
		select.append(thumbnail, copy);
		select.addEventListener("click", () => {
			setSelectedCounterImage(image.id);
			renderImageLibrary();
			elements.imageLibraryDialog.close();
		});
		const remove = document.createElement("button");
		remove.type = "button";
		remove.className = "library-image-delete";
		remove.title = `Excluir ${image.name}`;
		remove.setAttribute("aria-label", `Excluir imagem ${image.name}`);
		remove.innerHTML = '<i class="material-icons" aria-hidden="true">delete_outline</i>';
		remove.addEventListener("click", () => deleteLibraryImage(image));
		item.append(select, remove);
		elements.imageLibraryGrid.append(item);
	});
}

async function loadImageUrls(images, userId) {
	const version = ++imageLoadVersion;
	const entries = await Promise.all(
		images.map(async (image) => {
			try {
				return [image.id, await getDownloadURL(imageStorageReference(userId, image.slot))];
			} catch (error) {
				console.error(`Falha ao carregar a imagem ${image.id}.`, error);
				return [image.id, ""];
			}
		}),
	);
	if (version !== imageLoadVersion || currentUser?.uid !== userId) return;
	imageUrls = new Map(entries.filter(([, url]) => url));
	renderImageLibrary();
	renderCustomCounters(userSettings.customCounters);
	setSelectedCounterImage(elements.counterImageId.value || null);
}

function applyImages(images, userId) {
	userImages = normalizeImages(images);
	renderImageLibrary();
	loadImageUrls(userImages, userId);
}

async function saveImages(images) {
	if (!currentUser) return false;
	try {
		await setDoc(
			imagesReference(currentUser.uid),
			{ items: images.slice(0, MAX_IMAGES), updatedAt: serverTimestamp() },
			{ merge: true },
		);
		return true;
	} catch (error) {
		console.error("Falha ao salvar biblioteca de imagens.", error);
		showToast("Não foi possível sincronizar a biblioteca de imagens.");
		return false;
	}
}

function openImageLibrary(selectForCounter = false) {
	if (!currentUser) return;
	if (!imageLibraryAvailable) {
		showToast("Publique as novas regras do Firebase para ativar a biblioteca.");
		return;
	}
	librarySelectsCounter = selectForCounter;
	elements.imageLibraryMessage.textContent = "";
	renderImageLibrary();
	if (!selectForCounter) closeSidebar();
	elements.imageLibraryDialog.showModal();
	window.requestAnimationFrame(() => elements.imageLibraryClose.focus());
}

function closeImageLibrary() {
	if (elements.imageLibraryDialog.open) elements.imageLibraryDialog.close();
}

function setImageLibraryAvailability(isAvailable) {
	imageLibraryAvailable = isAvailable;
	elements.openImageLibrary.disabled = !isAvailable;
	elements.chooseCounterImage.disabled = !isAvailable;
	const message = isAvailable
		? ""
		: "A biblioteca aguarda a publicação das novas regras do Firebase.";
	elements.openImageLibrary.title = message;
	elements.chooseCounterImage.title = message;
	renderImageLibrary();
}

function setUploadState(progress = null, label = "Enviando...") {
	const isUploading = progress !== null;
	elements.imageUploadProgress.hidden = !isUploading;
	elements.imageUploadLabel.textContent = label;
	elements.imageUploadProgressBar.value = progress || 0;
	renderImageLibrary();
}

async function uploadLibraryImage(file) {
	if (!currentUser || !file) return;
	elements.imageLibraryMessage.textContent = "";
	if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
		elements.imageLibraryMessage.textContent = "Use uma imagem JPG, PNG, WebP, GIF ou AVIF.";
		return;
	}
	if (!file.size || file.size > MAX_IMAGE_BYTES) {
		elements.imageLibraryMessage.textContent = "A imagem precisa ter no máximo 5 MB.";
		return;
	}
	const occupiedSlots = new Set(userImages.map((image) => image.slot));
	const slot = Array.from({ length: MAX_IMAGES }, (_, index) => index).find(
		(index) => !occupiedSlots.has(index),
	);
	if (slot === undefined) {
		elements.imageLibraryMessage.textContent = "Sua biblioteca já possui 10 imagens.";
		return;
	}

	const ownerId = currentUser.uid;
	const image = {
		id: createCounterId(),
		slot,
		name: file.name.slice(0, 120),
		size: file.size,
		contentType: file.type,
		createdAt: new Date().toISOString(),
	};
	activeUploadTask = uploadBytesResumable(
		imageStorageReference(ownerId, slot),
		file,
		{ contentType: file.type, customMetadata: { imageId: image.id } },
	);
	setUploadState(0);
	try {
		await new Promise((resolve, reject) => {
			activeUploadTask.on(
				"state_changed",
				(snapshot) => {
					const progress = Math.round(
						(snapshot.bytesTransferred / snapshot.totalBytes) * 100,
					);
					setUploadState(progress, `Enviando ${progress}%`);
				},
				reject,
				resolve,
			);
		});
		if (currentUser?.uid !== ownerId) return;
		const nextImages = [...userImages, image].sort(
			(first, second) => first.slot - second.slot,
		);
		if (!(await saveImages(nextImages))) {
			await deleteObject(imageStorageReference(ownerId, slot));
			return;
		}
		elements.imageLibraryMessage.textContent = "Imagem adicionada à biblioteca.";
	} catch (error) {
		console.error("Falha no upload da imagem.", error);
		elements.imageLibraryMessage.textContent =
			"Não foi possível enviar a imagem. Verifique sua conexão e tente novamente.";
	} finally {
		activeUploadTask = null;
		elements.imageUploadInput.value = "";
		setUploadState(null);
	}
}

async function deleteLibraryImage(image) {
	if (!currentUser) return;
	const affectedCounters = userSettings.customCounters.filter(
		(counter) => counter.imageId === image.id,
	).length;
	const suffix = affectedCounters
		? ` Ela será removida de ${affectedCounters} ${affectedCounters === 1 ? "contador" : "contadores"}.`
		: "";
	if (!window.confirm(`Excluir “${image.name}” da biblioteca?${suffix}`)) return;

	const ownerId = currentUser.uid;
	const nextImages = userImages.filter((item) => item.id !== image.id);
	const nextCounters = userSettings.customCounters.map((counter) =>
		counter.imageId === image.id ? withoutCounterImage(counter) : counter,
	);
	try {
		const batch = writeBatch(db);
		batch.set(imagesReference(ownerId), {
			items: nextImages,
			updatedAt: serverTimestamp(),
		});
		if (affectedCounters) {
			batch.set(countersReference(ownerId), {
				items: nextCounters,
				updatedAt: serverTimestamp(),
			});
		}
		await batch.commit();
		try {
			await deleteObject(imageStorageReference(ownerId, image.slot));
		} catch (error) {
			if (error.code !== "storage/object-not-found") throw error;
		}
		if (elements.counterImageId.value === image.id) setSelectedCounterImage();
		showToast("Imagem excluída da biblioteca.");
	} catch (error) {
		console.error("Falha ao excluir imagem.", error);
		showToast("Não foi possível excluir a imagem.");
	}
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

const BACKGROUND_DESCRIPTIONS = {
	lava: "Formas quentes que sobem, se fundem e mudam lentamente.",
	float: "Orbes mais definidos cruzam a tela em trajetórias independentes.",
	glass: "Faixas translúcidas refratam cor sob superfícies de vidro.",
	rings: "Arcos concêntricos acompanham segundos e minutos em órbitas lentas.",
	aurora: "Faixas luminosas atravessam a tela como uma aurora em movimento.",
	topography: "Linhas de contorno fluem como um mapa topográfico vivo.",
	constellation: "Pontos flutuantes formam conexões efêmeras e reagem ao cursor.",
};

function boundedNumber(value, minimum, maximum, fallback) {
	const number = Number(value);
	return Number.isFinite(number)
		? Math.max(minimum, Math.min(maximum, number))
		: fallback;
}

function backgroundSettingsFromControls() {
	return {
		backgroundEnabled: elements.backgroundEnabled.checked,
		backgroundStyle: elements.backgroundStyle.value,
		backgroundColorA: elements.backgroundColorA.value,
		backgroundColorB: elements.backgroundColorB.value,
		backgroundSpeed: Number(elements.backgroundSpeed.value),
		backgroundIntensity: Number(elements.backgroundIntensity.value),
	};
}

function applyBackground(settings) {
	const enabled = settings.backgroundEnabled === true;
	const style = hasOwn(BACKGROUND_DESCRIPTIONS, settings.backgroundStyle)
		? settings.backgroundStyle
		: DEFAULTS.backgroundStyle;
	const colorA = isHexColor(settings.backgroundColorA)
		? settings.backgroundColorA
		: DEFAULTS.backgroundColorA;
	const colorB = isHexColor(settings.backgroundColorB)
		? settings.backgroundColorB
		: DEFAULTS.backgroundColorB;
	const speed = boundedNumber(
		settings.backgroundSpeed,
		20,
		100,
		DEFAULTS.backgroundSpeed,
	);
	const intensity = boundedNumber(
		settings.backgroundIntensity,
		15,
		100,
		DEFAULTS.backgroundIntensity,
	);
	const duration = Math.round(78 - speed * 0.62);
	const opacity = (0.16 + intensity * 0.0064).toFixed(2);

	document.body.dataset.backgroundEnabled = String(enabled);
	document.body.dataset.backgroundStyle = style;
	document.documentElement.style.setProperty("--ambient-a", colorA);
	document.documentElement.style.setProperty("--ambient-b", colorB);
	document.documentElement.style.setProperty("--ambient-duration", `${duration}s`);
	document.documentElement.style.setProperty("--ambient-opacity", opacity);

	elements.backgroundEnabled.checked = enabled;
	elements.backgroundStyle.value = style;
	elements.backgroundColorA.value = colorA;
	elements.backgroundColorB.value = colorB;
	elements.backgroundSpeed.value = String(speed);
	elements.backgroundIntensity.value = String(intensity);
	elements.backgroundDescription.textContent = BACKGROUND_DESCRIPTIONS[style];
	elements.backgroundSpeedOutput.textContent =
		speed < 40 ? "Lenta" : speed > 75 ? "Rápida" : "Normal";
	elements.backgroundIntensityOutput.textContent = `${Math.round(intensity)}%`;
	elements.backgroundControls.classList.toggle("is-disabled", !enabled);
	elements.backgroundControls
		.querySelectorAll("input, select")
		.forEach((control) => (control.disabled = !enabled));
	updateChronoRings();
	syncConstellation();
}

function updateChronoRings() {
	if (
		document.body.dataset.backgroundEnabled !== "true" ||
		document.body.dataset.backgroundStyle !== "rings"
	) {
		return;
	}
	const now = new Date();
	const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
	const minuteSeconds = now.getMinutes() * 60 + seconds;
	document.documentElement.style.setProperty(
		"--chrono-seconds-delay",
		`${-seconds}s`,
	);
	document.documentElement.style.setProperty(
		"--chrono-minutes-delay",
		`${-minuteSeconds}s`,
	);
}

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const constellationState = {
	context: elements.constellationCanvas.getContext("2d"),
	dpr: 1,
	frame: null,
	height: 0,
	lastTime: 0,
	particles: [],
	pointerX: null,
	pointerY: null,
	width: 0,
};

function constellationIsActive() {
	return (
		document.body.dataset.backgroundEnabled === "true" &&
		document.body.dataset.backgroundStyle === "constellation" &&
		!document.hidden
	);
}

function hexToRgb(color) {
	const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
	return match
		? {
				r: Number.parseInt(match[1], 16),
				g: Number.parseInt(match[2], 16),
				b: Number.parseInt(match[3], 16),
			}
		: { r: 167, g: 139, b: 250 };
}

function createConstellationParticle() {
	return {
		x: Math.random() * constellationState.width,
		y: Math.random() * constellationState.height,
		vx: (Math.random() - 0.5) * 0.22,
		vy: (Math.random() - 0.5) * 0.22,
		radius: 2 + Math.random() * 3.25,
	};
}

function resizeConstellation() {
	const rectangle = elements.constellationCanvas.getBoundingClientRect();
	const width = Math.max(1, Math.round(rectangle.width));
	const height = Math.max(1, Math.round(rectangle.height));
	const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
	if (
		width === constellationState.width &&
		height === constellationState.height &&
		dpr === constellationState.dpr
	) {
		return;
	}
	constellationState.width = width;
	constellationState.height = height;
	constellationState.dpr = dpr;
	elements.constellationCanvas.width = Math.round(width * dpr);
	elements.constellationCanvas.height = Math.round(height * dpr);
	constellationState.context.setTransform(dpr, 0, 0, dpr, 0, 0);
	constellationState.particles = [];
}

function reconcileConstellationParticles() {
	const intensity = boundedNumber(
		elements.backgroundIntensity.value,
		15,
		100,
		DEFAULTS.backgroundIntensity,
	);
	const areaFactor = Math.max(
		0.58,
		Math.min(1.18, Math.sqrt((constellationState.width * constellationState.height) / 921600)),
	);
	const targetCount = Math.round((24 + intensity * 0.55) * areaFactor);
	while (constellationState.particles.length < targetCount) {
		constellationState.particles.push(createConstellationParticle());
	}
	if (constellationState.particles.length > targetCount) {
		constellationState.particles.length = targetCount;
	}
}

function drawConstellation(delta, shouldMove = true) {
	const context = constellationState.context;
	const width = constellationState.width;
	const height = constellationState.height;
	const intensity = boundedNumber(
		elements.backgroundIntensity.value,
		15,
		100,
		DEFAULTS.backgroundIntensity,
	);
	const speed = boundedNumber(
		elements.backgroundSpeed.value,
		20,
		100,
		DEFAULTS.backgroundSpeed,
	);
	const colorA = hexToRgb(elements.backgroundColorA.value);
	const colorB = hexToRgb(elements.backgroundColorB.value);
	const distanceLimit = 94 + intensity * 0.62;
	const movement = Math.min(delta / 16.67, 2) * (0.38 + speed / 72);
	context.clearRect(0, 0, width, height);

	for (const particle of constellationState.particles) {
		if (shouldMove) {
			particle.x += particle.vx * movement;
			particle.y += particle.vy * movement;
			if (particle.x < -8) particle.x = width + 8;
			if (particle.x > width + 8) particle.x = -8;
			if (particle.y < -8) particle.y = height + 8;
			if (particle.y > height + 8) particle.y = -8;

			if (constellationState.pointerX !== null) {
				const pointerX = particle.x - constellationState.pointerX;
				const pointerY = particle.y - constellationState.pointerY;
				const pointerDistance = Math.hypot(pointerX, pointerY);
				if (pointerDistance > 0 && pointerDistance < 170) {
					const force = (1 - pointerDistance / 170) * 0.018;
					particle.x += (pointerX / pointerDistance) * force * delta;
					particle.y += (pointerY / pointerDistance) * force * delta;
				}
			}
		}
	}

	context.lineWidth = 0.7;
	for (let index = 0; index < constellationState.particles.length; index += 1) {
		const first = constellationState.particles[index];
		for (
			let otherIndex = index + 1;
			otherIndex < constellationState.particles.length;
			otherIndex += 1
		) {
			const second = constellationState.particles[otherIndex];
			const distance = Math.hypot(first.x - second.x, first.y - second.y);
			if (distance >= distanceLimit) continue;
			const alpha =
				(1 - distance / distanceLimit) * (0.09 + intensity * 0.0024);
			context.strokeStyle = `rgba(${colorB.r}, ${colorB.g}, ${colorB.b}, ${alpha})`;
			context.beginPath();
			context.moveTo(first.x, first.y);
			context.lineTo(second.x, second.y);
			context.stroke();
		}
	}

	context.save();
	context.globalCompositeOperation = "screen";
	for (const particle of constellationState.particles) {
		const glowRadius = 20 + particle.radius * 11;
		const glow = context.createRadialGradient(
			particle.x,
			particle.y,
			0,
			particle.x,
			particle.y,
			glowRadius,
		);
		glow.addColorStop(0, `rgba(${colorA.r}, ${colorA.g}, ${colorA.b}, 0.26)`);
		glow.addColorStop(0.22, `rgba(${colorA.r}, ${colorA.g}, ${colorA.b}, 0.12)`);
		glow.addColorStop(0.55, `rgba(${colorA.r}, ${colorA.g}, ${colorA.b}, 0.04)`);
		glow.addColorStop(1, `rgba(${colorA.r}, ${colorA.g}, ${colorA.b}, 0)`);
		context.fillStyle = glow;
		context.beginPath();
		context.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
		context.fill();

		context.fillStyle = `rgb(${colorA.r}, ${colorA.g}, ${colorA.b})`;
		context.globalAlpha = 0.46 + intensity * 0.0048;
		context.beginPath();
		context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
		context.fill();
	}
	context.restore();
}

function stopConstellation() {
	if (constellationState.frame !== null) {
		window.cancelAnimationFrame(constellationState.frame);
		constellationState.frame = null;
	}
	constellationState.context.clearRect(
		0,
		0,
		constellationState.width,
		constellationState.height,
	);
}

function constellationLoop(time) {
	constellationState.frame = null;
	if (!constellationIsActive()) {
		stopConstellation();
		return;
	}
	const delta = constellationState.lastTime
		? Math.min(time - constellationState.lastTime, 40)
		: 16.67;
	constellationState.lastTime = time;
	drawConstellation(delta);
	constellationState.frame = window.requestAnimationFrame(constellationLoop);
}

function syncConstellation() {
	if (!constellationIsActive()) {
		stopConstellation();
		return;
	}
	resizeConstellation();
	reconcileConstellationParticles();
	if (reducedMotionQuery.matches) {
		stopConstellation();
		drawConstellation(0, false);
		return;
	}
	if (constellationState.frame === null) {
		constellationState.lastTime = 0;
		constellationState.frame = window.requestAnimationFrame(constellationLoop);
	}
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
		"auth/unauthorized-domain":
			"Este domínio ainda não está autorizado para o login Google.",
		"auth/network-request-failed":
			"Falha de rede durante o login. Verifique sua conexão.",
		"auth/user-mismatch":
			"Escolha a mesma conta Google para confirmar a exclusão.",
		"auth/requires-recent-login":
			"Entre novamente com a mesma conta antes de excluir seus dados.",
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
		);
		setCounterState("Ao vivo", "live");
		return true;
	} catch (error) {
		console.error("Falha ao salvar contadores.", error);
		console.table(
			counters.map((counter, index) => ({
				index,
				type: counter.type,
				fields: Object.keys(counter).sort().join(", "),
				imageIdType: typeof counter.imageId,
				imageIdLength: counter.imageId?.length,
				imageOpacity: counter.imageOpacity,
				overlayOpacity: counter.overlayOpacity,
			})),
		);
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
	const imageUrl = counter.imageId ? imageUrls.get(counter.imageId) : "";
	if (imageUrl) {
		const media = document.createElement("div");
		media.className = "counter-card-media";
		media.setAttribute("aria-hidden", "true");
		const image = document.createElement("div");
		image.className = "counter-card-image";
		image.style.backgroundImage = `url(${JSON.stringify(imageUrl)})`;
		image.style.opacity = String(counter.imageOpacity / 100);
		const overlay = document.createElement("div");
		overlay.className = "counter-card-overlay";
		overlay.style.opacity = String(counter.overlayOpacity / 100);
		media.append(image, overlay);
		panel.append(media);
	}

	const top = document.createElement("div");
	top.className = "panel-top";
	const panelIndex = document.createElement("span");
	panelIndex.className = "panel-index";
	panelIndex.textContent = String(index + 4).padStart(2, "0");
	const title = document.createElement("h2");
	title.className = "panel-title";
	title.textContent = counter.name;
	top.append(panelIndex, title);
	if (counter.imageId) {
		const removeImage = document.createElement("button");
		removeImage.type = "button";
		removeImage.className = "counter-card-image-remove";
		removeImage.title = `Remover imagem de ${counter.name}`;
		removeImage.setAttribute(
			"aria-label",
			`Remover imagem do contador ${counter.name}`,
		);
		removeImage.innerHTML = '<i class="material-icons" aria-hidden="true">close</i>';
		removeImage.addEventListener("click", () => removeImageFromCounter(counter));
		top.append(removeImage);
	}

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
	return `${formatter.format(new Date(counter.startAtMs))} → ${formatter.format(new Date(counter.endAtMs))}`;
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
	elements.customPanels.dataset.count = String(counters.length);
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
	applyBackground(userSettings);
	updateCustomVisibility(currentCounters);
}

function createCounterId() {
	return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function normalizeCounter(counter) {
	if (!counter || typeof counter !== "object") return null;
	const type = counter.type === "recurring" ? "recurring" : "fixed";
	const name = String(counter.name || "").trim().slice(0, 50);
	if (!name) return null;
	const normalized = {
		id: String(counter.id || createCounterId()).slice(0, 100),
		name,
		type,
		color: isHexColor(counter.color) ? counter.color : null,
		createdAt:
			typeof counter.createdAt === "string"
				? counter.createdAt.slice(0, 40)
				: new Date().toISOString(),
	};
	const imageId =
		typeof counter.imageId === "string" && counter.imageId.trim()
			? counter.imageId.trim().slice(0, 100)
			: null;
	if (imageId) {
		normalized.imageId = imageId;
		normalized.imageOpacity = Math.round(
			boundedNumber(counter.imageOpacity, 0, 100, 100),
		);
		normalized.overlayOpacity = Math.round(
			boundedNumber(counter.overlayOpacity, 0, 100, 55),
		);
	}
	if (type === "recurring") {
		const startTime = String(counter.startTime || "");
		const endTime = String(counter.endTime || "");
		const daysOfWeek = [
			...new Set(
				(Array.isArray(counter.daysOfWeek) ? counter.daysOfWeek : [])
					.map(Number)
					.filter(
						(day) => Number.isInteger(day) && day >= 0 && day <= 6,
					),
			),
		].sort((first, second) => first - second);
		if (
			!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(startTime) ||
			!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(endTime) ||
			daysOfWeek.length === 0
		) {
			return null;
		}
		return {
			...normalized,
			startTime,
			endTime,
			daysOfWeek,
		};
	}
	const startAtMs = Number.isInteger(counter.startAtMs)
		? counter.startAtMs
		: new Date(counter.startAt).getTime();
	const endAtMs = Number.isInteger(counter.endAtMs)
		? counter.endAtMs
		: new Date(counter.endAt).getTime();
	if (
		!Number.isInteger(startAtMs) ||
		startAtMs < 0 ||
		!Number.isInteger(endAtMs) ||
		endAtMs <= startAtMs
	) {
		return null;
	}
	return {
		...normalized,
		startAtMs,
		endAtMs,
	};
}

function normalizeCounters(counters) {
	return (Array.isArray(counters) ? counters : [])
		.slice(0, MAX_COUNTERS)
		.map(normalizeCounter)
		.filter(Boolean);
}

function applyCounters(counters) {
	userSettings.customCounters = normalizeCounters(counters);
	renderCustomCounters(userSettings.customCounters);
}

function unsubscribeUserData() {
	unsubscribeSettings?.();
	unsubscribeCounters?.();
	unsubscribeImages?.();
	unsubscribeSettings = null;
	unsubscribeCounters = null;
	unsubscribeImages = null;
	imageLoadVersion += 1;
}

async function accountDataOperation(label, operation) {
	try {
		return await operation();
	} catch (error) {
		error.accountOperation = label;
		console.error(`Falha na operação Firebase: ${label}.`, error);
		throw error;
	}
}

async function ensureUserData(user) {
	const profileReference = doc(db, "users", user.uid);
	const settingsDoc = settingsReference(user.uid);
	const countersDoc = countersReference(user.uid);
	const imagesDoc = imagesReference(user.uid);
	const [legacySnapshot, settingsSnapshot, countersSnapshot] = await Promise.all([
		accountDataOperation(`ler users/${user.uid}`, () =>
			getDoc(profileReference),
		),
		accountDataOperation(`ler users/${user.uid}/data/settings`, () =>
			getDoc(settingsDoc),
		),
		accountDataOperation(`ler users/${user.uid}/data/counters`, () =>
			getDoc(countersDoc),
		),
	]);
	let imagesSnapshot = null;
	let imagesAvailable = true;
	try {
		imagesSnapshot = await accountDataOperation(
			`ler users/${user.uid}/data/images`,
			() => getDoc(imagesDoc),
		);
	} catch (error) {
		if (error.code !== "permission-denied") throw error;
		imagesAvailable = false;
	}
	const legacy = legacySnapshot.exists() ? legacySnapshot.data() : {};
	if (!settingsSnapshot.exists()) {
		await accountDataOperation(
			`criar users/${user.uid}/data/settings`,
			() => setDoc(settingsDoc, {
				endHour: legacy.endHour ?? DEFAULTS.endHour,
				endMinutes: legacy.endMinutes ?? DEFAULTS.endMinutes,
				accentPrimary: isHexColor(legacy.accentPrimary)
					? legacy.accentPrimary
					: DEFAULTS.accentPrimary,
				accentSecondary: isHexColor(legacy.accentSecondary)
					? legacy.accentSecondary
					: DEFAULTS.accentSecondary,
				backgroundEnabled: legacy.backgroundEnabled === true,
				backgroundStyle: hasOwn(
					BACKGROUND_DESCRIPTIONS,
					legacy.backgroundStyle,
				)
					? legacy.backgroundStyle
					: DEFAULTS.backgroundStyle,
				backgroundColorA: isHexColor(legacy.backgroundColorA)
					? legacy.backgroundColorA
					: DEFAULTS.backgroundColorA,
				backgroundColorB: isHexColor(legacy.backgroundColorB)
					? legacy.backgroundColorB
					: DEFAULTS.backgroundColorB,
				backgroundSpeed: boundedNumber(
					legacy.backgroundSpeed,
					20,
					100,
					DEFAULTS.backgroundSpeed,
				),
				backgroundIntensity: boundedNumber(
					legacy.backgroundIntensity,
					15,
					100,
					DEFAULTS.backgroundIntensity,
				),
				showCustomCounters: legacy.showCustomCounters !== false,
				updatedAt: serverTimestamp(),
			}),
		);
	}
	if (!countersSnapshot.exists()) {
		await accountDataOperation(
			`criar users/${user.uid}/data/counters`,
			() => setDoc(countersDoc, {
				items: normalizeCounters(legacy.customCounters),
				updatedAt: serverTimestamp(),
			}),
		);
	}
	await accountDataOperation(`normalizar users/${user.uid}`, () =>
		setDoc(profileReference, {
			displayName: user.displayName || "",
			email: user.email || "",
			photoURL: user.photoURL || "",
			updatedAt: serverTimestamp(),
		}),
	);
	if (imagesAvailable && !imagesSnapshot.exists()) {
		try {
			await accountDataOperation(
				`criar users/${user.uid}/data/images`,
				() => setDoc(imagesDoc, {
					items: [],
					updatedAt: serverTimestamp(),
				}),
			);
		} catch (error) {
			if (error.code !== "permission-denied") throw error;
			imagesAvailable = false;
		}
	}
	return imagesAvailable;
}

async function subscribeToUserData(user) {
	unsubscribeUserData();
	setSaveState("Conectando...", true);
	setCounterState("Conectando...", "connecting");
	let imagesAvailable;
	try {
		imagesAvailable = await ensureUserData(user);
	} catch (error) {
		console.error("Falha ao preparar dados da conta.", error);
		setSaveState("Erro de conexão");
		setCounterState("Erro de conexão", "error");
		showToast(
			error.accountOperation
				? `Permissão negada ao ${error.accountOperation}.`
				: "Não foi possível preparar os dados da conta.",
		);
		return;
	}
	if (currentUser?.uid !== user.uid) return;
	setImageLibraryAvailability(imagesAvailable);

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
	if (!imagesAvailable) {
		applyImages([], user.uid);
		return;
	}
	unsubscribeImages = onSnapshot(
		imagesReference(user.uid),
		(snapshot) => {
			applyImages(snapshot.exists() ? snapshot.data().items : [], user.uid);
		},
		(error) => {
			console.error("Falha ao acompanhar biblioteca de imagens.", error);
			if (error.code === "permission-denied") {
				setImageLibraryAvailability(false);
			}
			showToast("Não foi possível atualizar a biblioteca de imagens.");
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

function withoutCounterImage(counter) {
	const {
		imageId: _imageId,
		imageOpacity: _imageOpacity,
		overlayOpacity: _overlayOpacity,
		...counterWithoutImage
	} = counter;
	return counterWithoutImage;
}

async function removeImageFromCounter(counter) {
	const previousCounters = userSettings.customCounters;
	const nextCounters = previousCounters.map((item) =>
		item.id === counter.id ? withoutCounterImage(item) : item,
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
	setSelectedCounterImage();
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
		const startDate = counter ? new Date(counter.startAtMs) : new Date();
		if (!counter) startDate.setSeconds(0, 0);
		const endDate = counter
			? new Date(counter.endAtMs)
			: new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
		elements.counterForm.elements.startAt.value = toLocalInputValue(startDate);
		elements.counterForm.elements.endAt.value = toLocalInputValue(endDate);
	}
	elements.counterColorEnabled.checked = Boolean(counter?.color);
	elements.counterColor.disabled = !counter?.color;
	elements.counterColor.value = counter?.color || userSettings.accentPrimary;
	elements.counterImageOpacity.value = String(counter?.imageOpacity ?? 100);
	elements.counterOverlayOpacity.value = String(counter?.overlayOpacity ?? 55);
	syncCounterOpacityOutputs();
	setSelectedCounterImage(counter?.imageId || null);
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
elements.openImageLibrary.addEventListener("click", () => openImageLibrary());
elements.chooseCounterImage.addEventListener("click", () =>
	openImageLibrary(true),
);
elements.removeCounterImage.addEventListener("click", () => {
	setSelectedCounterImage();
	renderImageLibrary();
});
elements.imageLibraryClose.addEventListener("click", closeImageLibrary);
elements.imageLibraryDialog.addEventListener("click", (event) => {
	if (event.target === elements.imageLibraryDialog) closeImageLibrary();
});
elements.imageUploadInput.addEventListener("change", () => {
	uploadLibraryImage(elements.imageUploadInput.files?.[0]);
});
elements.counterDialogClose.addEventListener("click", closeCounterDialog);
elements.counterDialogCancel.addEventListener("click", closeCounterDialog);
elements.counterDialog.addEventListener("click", (event) => {
	if (event.target === elements.counterDialog) closeCounterDialog();
});
elements.counterDialog.addEventListener("close", () => {
	editingCounterId = null;
	elements.counterForm.reset();
	elements.counterColor.disabled = true;
	setSelectedCounterImage();
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
elements.deleteAccountButton.addEventListener("click", async () => {
	if (!currentUser) return;
	const confirmed = window.confirm(
		"Excluir permanentemente sua conta, configurações, contadores e imagens? Esta ação não pode ser desfeita.",
	);
	if (!confirmed) return;

	const userToDelete = currentUser;
	elements.deleteAccountButton.disabled = true;
	try {
		await reauthenticateWithPopup(userToDelete, googleProvider);
		activeUploadTask?.cancel();
		await Promise.all(
			Array.from({ length: MAX_IMAGES }, async (_, slot) => {
				try {
					await deleteObject(imageStorageReference(userToDelete.uid, slot));
				} catch (error) {
					if (error.code !== "storage/object-not-found") throw error;
				}
			}),
		);
		const userRef = doc(db, "users", userToDelete.uid);
		await Promise.all([
			deleteDoc(doc(db, "users", userToDelete.uid, "data", "settings")),
			deleteDoc(doc(db, "users", userToDelete.uid, "data", "counters")),
			deleteDoc(doc(db, "users", userToDelete.uid, "data", "images")),
		]);
		await deleteDoc(userRef);
		await deleteUser(userToDelete);
		closeSidebar();
		showToast("Conta e dados excluídos permanentemente.");
	} catch (error) {
		console.error("Falha ao excluir a conta.", error);
		showToast(
			error.code?.startsWith("auth/")
				? friendlyAuthError(error)
				: "Não foi possível excluir todos os dados da conta.",
		);
	} finally {
		elements.deleteAccountButton.disabled = false;
	}
});
document.addEventListener("keydown", (event) => {
	if (
		event.key === "Escape" &&
		!elements.counterDialog.open &&
		!elements.imageLibraryDialog.open
	) {
		closeSidebar();
	}
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
elements.backgroundEnabled.addEventListener("change", () => {
	const settings = backgroundSettingsFromControls();
	applyBackground(settings);
	saveSettings({ backgroundEnabled: settings.backgroundEnabled });
});
elements.backgroundStyle.addEventListener("change", () => {
	const settings = backgroundSettingsFromControls();
	applyBackground(settings);
	saveSettings({ backgroundStyle: settings.backgroundStyle });
});
for (const [element, property] of [
	[elements.backgroundColorA, "backgroundColorA"],
	[elements.backgroundColorB, "backgroundColorB"],
]) {
	element.addEventListener("input", () => {
		applyBackground(backgroundSettingsFromControls());
	});
	element.addEventListener("change", () => {
		saveSettings({ [property]: element.value });
	});
}
for (const [element, property] of [
	[elements.backgroundSpeed, "backgroundSpeed"],
	[elements.backgroundIntensity, "backgroundIntensity"],
]) {
	element.addEventListener("input", () => {
		applyBackground(backgroundSettingsFromControls());
	});
	element.addEventListener("change", () => {
		saveSettings({ [property]: Number(element.value) });
	});
}
elements.counterColorEnabled.addEventListener("change", () => {
	elements.counterColor.disabled = !elements.counterColorEnabled.checked;
	if (!elements.counterColorEnabled.checked) {
		elements.counterColor.value = userSettings.accentPrimary;
	}
	updateCounterPreview();
});
elements.counterColor.addEventListener("input", updateCounterPreview);
elements.counterForm.elements.name.addEventListener("input", updateCounterPreview);
elements.counterType.addEventListener("change", () => {
	setCounterType(elements.counterType.value);
});
for (const input of [
	elements.counterImageOpacity,
	elements.counterOverlayOpacity,
]) {
	input.addEventListener("input", syncCounterOpacityOutputs);
}

elements.counterForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	elements.counterMessage.textContent = "";
	if (!editingCounterId && userSettings.customCounters.length >= MAX_COUNTERS) {
		elements.counterMessage.textContent = "Você já possui cinco contadores.";
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
			startAtMs: startAt.getTime(),
			endAtMs: endAt.getTime(),
		};
	}
	const existingCounter = editingCounterId
		? userSettings.customCounters.find((counter) => counter.id === editingCounterId)
		: null;
	if (editingCounterId && !existingCounter) {
		elements.counterMessage.textContent = "Este contador não está mais disponível.";
		return;
	}
	const requestedImageId = String(data.get("imageId") || "");
	const imageId = userImages.some((image) => image.id === requestedImageId)
		? requestedImageId
		: null;
	const counter = {
		id: existingCounter?.id || createCounterId(),
		name,
		...schedule,
		color: data.get("colorEnabled") ? String(data.get("color")) : null,
		createdAt: existingCounter?.createdAt || new Date().toISOString(),
	};
	if (imageId) {
		counter.imageId = imageId;
		counter.imageOpacity = Math.round(
			boundedNumber(data.get("imageOpacity"), 0, 100, 100),
		);
		counter.overlayOpacity = Math.round(
			boundedNumber(data.get("overlayOpacity"), 0, 100, 55),
		);
	}
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
	activeUploadTask?.cancel();
	activeUploadTask = null;
	closeImageLibrary();
	closeSidebar();
	userImages = [];
	imageUrls = new Map();
	setImageLibraryAvailability(true);
	renderImageLibrary();
	applySettings({ ...DEFAULTS, ...guestTimeSettings() });
	applyCounters([]);
});

window.addEventListener("resize", syncConstellation);
window.addEventListener("pointermove", (event) => {
	if (!constellationIsActive()) return;
	constellationState.pointerX = event.clientX;
	constellationState.pointerY = event.clientY;
});
window.addEventListener("blur", () => {
	constellationState.pointerX = null;
	constellationState.pointerY = null;
});
document.addEventListener("visibilitychange", syncConstellation);
if (typeof reducedMotionQuery.addEventListener === "function") {
	reducedMotionQuery.addEventListener("change", syncConstellation);
} else {
	reducedMotionQuery.addListener(syncConstellation);
}
window.setInterval(updateCustomCounters, 1000);
