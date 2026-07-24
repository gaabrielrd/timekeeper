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
	collection,
	connectFirestoreEmulator,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	getFirestore,
	initializeFirestore,
	onSnapshot,
	orderBy,
	query,
	runTransaction,
	serverTimestamp,
	setDoc,
	Timestamp,
	where,
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
import {
	connectFunctionsEmulator,
	getFunctions,
	httpsCallable,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js";
import {
	getMessaging,
	isSupported as messagingIsSupported,
	onMessage,
	onRegistered,
	onUnregistered,
	register as registerMessaging,
	unregister as unregisterMessaging,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js";
import {
	ReCaptchaEnterpriseProvider,
	initializeAppCheck,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app-check.js";
import {
	getAI,
	getGenerativeModel,
	GoogleAIBackend,
	ResponseModality,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-ai.js";
import { createWebGLBackground } from "./background-webgl.js";

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
const pushConfig = window.TimekeeperRuntimeConfig?.push || {};
const pushConfigured =
	!useLocalEmulators &&
	typeof pushConfig.vapidKey === "string" &&
	pushConfig.vapidKey.length > 20 &&
	typeof pushConfig.recaptchaEnterpriseSiteKey === "string" &&
	pushConfig.recaptchaEnterpriseSiteKey.length > 10;
let pushFunctions = null;
let sharedFunctions = null;
let appCheckInitialized = false;
/** Sentinel used in counterGroups to track the "ungrouped" row position. */
const OUTROS_KEY = "__outros__";

function ensureAppCheck() {
	if (appCheckInitialized) return;

	const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
	if (isLocal) {
		self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
	}

	const siteKey = pushConfig.recaptchaEnterpriseSiteKey;
	if (siteKey || isLocal) {
		try {
			initializeAppCheck(app, {
				provider: new ReCaptchaEnterpriseProvider(
					siteKey || "6Lfoo1otAAAAAGP_SSJWNcnGABOfmHBWL6djlmT8",
				),
				isTokenAutoRefreshEnabled: true,
			});
			appCheckInitialized = true;
		} catch (error) {
			console.warn("App Check failed to initialize, continuing anyway:", error);
		}
	}
}

function ensurePushBackend() {
	if (!pushConfigured) return null;
	ensureAppCheck();
	if (!pushFunctions) {
		pushFunctions = getFunctions(
			app,
			pushConfig.functionsRegion || "southamerica-east1",
		);
	}
	return pushFunctions;
}

function ensureFunctionsBackend() {
	ensureAppCheck();
	if (!sharedFunctions) {
		sharedFunctions = getFunctions(
			app,
			pushConfig.functionsRegion || "southamerica-east1",
		);
		if (useLocalEmulators) connectFunctionsEmulator(sharedFunctions, "127.0.0.1", 5001);
	}
	return sharedFunctions;
}

// Initialize Firebase AI Logic (Gemini API)
let aiInstance = null;
const modelInstances = new Map();

function getAIModel(modelName = "gemini-2.5-flash-lite") {
	ensureAppCheck();
	if (!aiInstance) {
		aiInstance = getAI(app, { backend: new GoogleAIBackend() });
	}
	if (!modelInstances.has(modelName)) {
		modelInstances.set(modelName, getGenerativeModel(aiInstance, { model: modelName }));
	}
	return modelInstances.get(modelName);
}

async function generateText(prompt, modelName = "gemini-2.5-flash-lite") {
	const model = getAIModel(modelName);
	const result = await model.generateContent(prompt);
	const response = await result.response;
	return response.text();
}

window.TimekeeperAI = {
	getAIModel,
	generateText,
};

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
	dashboardLayout: "balanced",
	dashboardSectionOrder: ["standard", "custom", "weather", "timeline"],
	hiddenDashboardSections: [],
	weatherWidgets: window.TimekeeperWeather.cloneDefaults(),
	...window.TimekeeperNotifications.normalizePreferences(),
	counterGroups: [],
	hiddenCounterGroups: [],
	activeWorkspace: "personal",
	customCounters: [],
};
const DASHBOARD_LAYOUTS = new Set(["focus", "balanced", "compact"]);
const DASHBOARD_CACHE_KEY = "timekeeper:dashboard-preferences";
const DASHBOARD_SECTION_IDS =
	window.TimekeeperOccurrences?.DASHBOARD_SECTION_IDS || [
		"standard",
		"custom",
		"weather",
		"timeline",
	];

function uniqueDashboardSections(value) {
	return [...new Set(Array.isArray(value) ? value : [])].filter((section) =>
		DASHBOARD_SECTION_IDS.includes(section),
	);
}

function normalizeWorkspacePreference(value) {
	const normalized = String(value || "personal");
	return normalized === "personal" || /^team:.{1,100}$/.test(normalized)
		? normalized
		: "personal";
}

function normalizeGroupSettings(data = {}) {
	return {
		counterGroups: (Array.isArray(data.counterGroups) ? data.counterGroups : [])
			.map((group) => String(group || "").trim().slice(0, 30))
			.filter(Boolean)
			.slice(0, 10),
		hiddenCounterGroups: (
			Array.isArray(data.hiddenCounterGroups) ? data.hiddenCounterGroups : []
		)
			.map((group) => String(group || "").trim().slice(0, 30))
			.filter(Boolean)
			.slice(0, 10),
	};
}

function normalizeDashboardPreferences(data = {}) {
	const requestedOrder = uniqueDashboardSections(data.dashboardSectionOrder);
	return {
		dashboardLayout: DASHBOARD_LAYOUTS.has(data.dashboardLayout)
			? data.dashboardLayout
			: "balanced",
		dashboardSectionOrder: [
			...requestedOrder,
			...DASHBOARD_SECTION_IDS.filter(
				(section) => !requestedOrder.includes(section),
			),
		],
		hiddenDashboardSections: uniqueDashboardSections(
			data.hiddenDashboardSections,
		).filter((section) => section !== "standard"),
	};
}

function applyDashboardPreferences(data = {}) {
	const preferences = normalizeDashboardPreferences(data);
	document.body.dataset.dashboardLayout = preferences.dashboardLayout;
	document.querySelectorAll("[data-dashboard-section]").forEach((section) => {
		const sectionId = section.dataset.dashboardSection;
		section.style.order = String(
			preferences.dashboardSectionOrder.indexOf(sectionId),
		);
		section.classList.toggle(
			"is-dashboard-hidden",
			preferences.hiddenDashboardSections.includes(sectionId),
		);
	});
	return preferences;
}

function cachedDashboardPreferences() {
	try {
		return normalizeDashboardPreferences(
			JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY) || "{}"),
		);
	} catch {
		return normalizeDashboardPreferences();
	}
}

function cacheDashboardPreferences(preferences) {
	try {
		localStorage.setItem(
			DASHBOARD_CACHE_KEY,
			JSON.stringify(normalizeDashboardPreferences(preferences)),
		);
	} catch {
		// O snapshot continua sendo a fonte de verdade sem armazenamento local.
	}
}

applyDashboardPreferences(cachedDashboardPreferences());
let userTier = "free";
function activeWorkspaceTier() {
	return activeWorkspace.type === "team"
		? activeWorkspace.ownerTier || "free"
		: userTier;
}

function isActiveWorkspacePremium() {
	return activeWorkspaceTier() === "premium";
}

function canEditActiveWorkspace() {
	return (
		activeWorkspace.type !== "team" ||
		["admin", "editor"].includes(activeWorkspace.role)
	);
}

function getMaxCounters() {
	return isActiveWorkspacePremium() ? 15 : 5;
}
const MAX_ARCHIVED_COUNTERS = 100;
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
const db = initializeFirestore(app, {
	experimentalAutoDetectLongPolling: true,
});
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
	sidebarUpgradeIcon: document.querySelector("#sidebar-upgrade-icon"),
	sidebarAvatar: document.querySelector("#sidebar-avatar"),
	sidebarName: document.querySelector("#sidebar-name"),
	sidebarEmail: document.querySelector("#sidebar-email"),
	signOutButton: document.querySelector("#sign-out-button"),
	deleteAccountButton: document.querySelector("#delete-account-button"),
	subscriptionTierBadge: document.querySelector("#subscription-tier-badge"),
	subscriptionStatusText: document.querySelector("#subscription-status-text"),
	subscriptionPriceText: document.querySelector("#subscription-price-text"),
	subscriptionRenewsRow: document.querySelector("#subscription-renews-row"),
	subscriptionRenewsLabel: document.querySelector("#subscription-renews-label"),
	subscriptionRenewsDate: document.querySelector("#subscription-renews-date"),
	manageSubscriptionButton: document.querySelector("#manage-subscription-button"),
	excessCountersWarning: document.querySelector("#excess-counters-warning"),
	excessCountersText: document.querySelector("#excess-counters-text"),
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
	dashboardLayout: document.querySelector("#dashboard-layout"),
	dashboardSectionControls: document.querySelector(
		"#dashboard-section-controls",
	),
	weatherWidgetList: document.querySelector("#weather-widget-list"),
	weatherWidgetCount: document.querySelector("#weather-widget-count"),
	addWeatherWidget: document.querySelector("#add-weather-widget"),
	weatherWidgetForm: document.querySelector("#weather-widget-form"),
	cancelWeatherWidget: document.querySelector("#cancel-weather-widget"),
	weatherWidgetMessage: document.querySelector("#weather-widget-message"),
	notificationsEnabled: document.querySelector("#notifications-enabled"),
	notificationState: document.querySelector("#notification-state"),
	notificationControls: document.querySelector("#notification-controls"),
	notificationDeliveryState: document.querySelector(
		"#notification-delivery-state",
	),
	notificationMessage: document.querySelector("#notification-message"),
	notificationQuietEnabled: document.querySelector(
		"#notification-quiet-enabled",
	),
	notificationQuietTimes: document.querySelector("#notification-quiet-times"),
	notificationQuietStart: document.querySelector("#notification-quiet-start"),
	notificationQuietEnd: document.querySelector("#notification-quiet-end"),
	timelineList: document.querySelector("#timeline-list"),
	workspaceSwitcher: document.querySelector("#workspace-switcher"),
	pendingInvitesButton: document.querySelector("#pending-invites-button"),
	pendingInvitesCount: document.querySelector("#pending-invites-count"),
	pendingInvitesDialog: document.querySelector("#pending-invites-dialog"),
	pendingInvitesClose: document.querySelector("#pending-invites-close"),
	pendingInvitesList: document.querySelector("#pending-invites-list"),
	teamManageDialog: document.querySelector("#team-manage-dialog"),
	teamManageClose: document.querySelector("#team-manage-close"),
	teamDetailsDialog: document.querySelector("#team-details-dialog"),
	teamDetailsTitle: document.querySelector("#team-details-title"),
	teamDetailsName: document.querySelector("#team-details-name"),
	teamDetailsSubtitle: document.querySelector("#team-details-subtitle"),
	teamDetailsRole: document.querySelector("#team-details-role"),
	teamDetailsClose: document.querySelector("#team-details-close"),
	teamNameInput: document.querySelector("#team-name-input"),
	saveTeamNameButton: document.querySelector("#save-team-name-button"),
	generateTeamInviteButton: document.querySelector("#generate-team-invite-button"),
	teamInviteLinkBox: document.querySelector("#team-invite-link-box"),
	teamInviteLinkInput: document.querySelector("#team-invite-link-input"),
	copyTeamInviteButton: document.querySelector("#copy-team-invite-button"),
	teamMemberCount: document.querySelector("#team-member-count"),
	teamMemberCapacity: document.querySelector("#team-member-capacity"),
	teamMembersList: document.querySelector("#team-members-list"),
	leaveTeamButton: document.querySelector("#leave-team-button"),
	teamsManageButton: document.querySelector("#teams-manage-button"),
	teamCreatePanel: document.querySelector("#team-create-panel"),
	teamDetailsPanel: document.querySelector("#team-details-panel"),
	teamQuotaInfo: document.querySelector("#team-quota-info"),
	userTeamsGrid: document.querySelector("#user-teams-grid"),
	createTeamNameInput: document.querySelector("#create-team-name-input"),
	createTeamSubmitButton: document.querySelector("#create-team-submit-button"),
	timelineEmpty: document.querySelector("#timeline-empty"),
	timelineRange: document.querySelector("#timeline-range"),
	timelineLegend: document.querySelector("#timeline-legend"),
	timelineSourceFilter: document.querySelector("#timeline-source-filter"),
	timelineViewOptions: document.querySelectorAll("[data-timeline-view]"),
	constellationCanvas: document.querySelector("#constellation-canvas"),
	webglBackgroundCanvas: document.querySelector("#webgl-background-canvas"),
	settingsState: document.querySelector("#settings-state"),
	confirmationDialog: document.querySelector("#confirmation-dialog"),
	confirmationDialogTitle: document.querySelector("#confirmation-dialog-title"),
	confirmationDialogMessage: document.querySelector(
		"#confirmation-dialog-message",
	),
	confirmationDialogConfirm: document.querySelector(
		"#confirmation-dialog-confirm",
	),
	counterForm: document.querySelector("#counter-form"),
	counterDialog: document.querySelector("#counter-dialog"),
	counterDialogKicker: document.querySelector("#counter-dialog-kicker"),
	counterDialogTitle: document.querySelector("#counter-dialog-title"),
	counterDialogClose: document.querySelector("#counter-dialog-close"),
	counterDialogCancel: document.querySelector("#counter-dialog-cancel"),
	nlpPromptInput: document.querySelector("#nlp-prompt-input"),
	nlpParseButton: document.querySelector("#nlp-parse-button"),
	generateAiChecklistButton: document.querySelector("#generate-ai-checklist-button"),
	nlpChecklistFieldset: document.querySelector("#nlp-checklist-fieldset"),
	nlpChecklistItems: document.querySelector("#nlp-checklist-items"),
	counterPreviewCard: document.querySelector("#counter-preview-card"),
	counterPreviewImage: document.querySelector("#counter-preview-image"),
	counterPreviewOverlay: document.querySelector("#counter-preview-overlay"),
	counterPreviewTitle: document.querySelector("#counter-preview-title"),
	counterPreviewPost: document.querySelector("#counter-preview-post"),
	openCounterModal: document.querySelector("#open-counter-modal"),
	openCounterModalLabel: document.querySelector("#open-counter-modal-label"),
	openImageLibrary: document.querySelector("#open-image-library"),
	openArchiveDialog: document.querySelector("#open-archive-dialog"),
	counterList: document.querySelector("#counter-list"),
	counterCount: document.querySelector("#counter-count"),
	counterLiveState: document.querySelector("#counter-live-state"),
	counterSidebarState: document.querySelector("#counter-sidebar-state"),
	archiveList: document.querySelector("#archive-list"),
	archiveEmpty: document.querySelector("#archive-empty"),
	archiveCount: document.querySelector("#archive-count"),
	archiveState: document.querySelector("#archive-state"),
	archiveDialog: document.querySelector("#archive-dialog"),
	archiveDialogClose: document.querySelector("#archive-dialog-close"),
	counterMessage: document.querySelector("#counter-message"),
	counterSubmit: document.querySelector("#counter-submit"),
	counterKicker: document.querySelector("#counter-kicker"),
	counterManagementLabel: document.querySelector("#counter-management-label"),
	userTierBadge: document.querySelector("#user-tier-badge"),
	openUpgradeDialog: document.querySelector("#open-upgrade-dialog"),
	upgradeDialog: document.querySelector("#upgrade-dialog"),
	upgradeDialogClose: document.querySelector("#upgrade-dialog-close"),
	startStripeCheckout: document.querySelector("#start-stripe-checkout"),
	counterGroup: document.querySelector("#counter-group"),
	counterHidden: document.querySelector("#counter-hidden"),
	counterFilterToolbar: document.querySelector("#counter-filter-toolbar"),
	counterGroupChips: document.querySelector("#counter-group-chips"),
	showHiddenCountersToggle: document.querySelector("#show-hidden-counters-toggle"),
	counterChecklistInputs: document.querySelector("#counter-checklist-inputs"),
	addChecklistItem: document.querySelector("#add-checklist-item"),
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
	counterIsPublic: document.querySelector("#counter-is-public"),
	counterPublicQuotaText: document.querySelector("#counter-public-quota-text"),
	counterPublicLinksPanel: document.querySelector("#counter-public-links-panel"),
	counterPublicLinkUrl: document.querySelector("#counter-public-link-url"),
	counterPublicIframeCode: document.querySelector("#counter-public-iframe-code"),
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
	libraryTabUpload: document.querySelector("#library-tab-upload"),
	libraryTabAi: document.querySelector("#library-tab-ai"),
	libraryPanelUpload: document.querySelector("#library-panel-upload"),
	libraryPanelAi: document.querySelector("#library-panel-ai"),
	aiPromptInput: document.querySelector("#ai-prompt-input"),
	aiThemeSelect: document.querySelector("#ai-theme-select"),
	aiRatioSelect: document.querySelector("#ai-ratio-select"),
	aiGenerateBtn: document.querySelector("#ai-generate-btn"),
	aiLoading: document.querySelector("#ai-loading"),
	aiLoadingText: document.querySelector("#ai-loading-text"),
	aiQuotaBadge: document.querySelector("#ai-quota-badge"),
	aiQuotaUsageText: document.querySelector("#ai-quota-usage-text"),
	aiQuotaRemainingText: document.querySelector("#ai-quota-remaining-text"),
	aiQuotaProgressBar: document.querySelector("#ai-quota-progress-bar"),
	aiQuotaResetText: document.querySelector("#ai-quota-reset-text"),
	counterGroupChips: document.querySelector("#counter-group-chips"),
	counterGroupControls: document.querySelector("#counter-group-controls"),
	counterGroupOrderList: document.querySelector("#counter-group-order-list"),
	createCounterGroupButton: document.querySelector("#create-counter-group-button"),
	openAdminModal: document.querySelector("#open-admin-modal"),
	adminDialog: document.querySelector("#admin-dialog"),
	adminDialogClose: document.querySelector("#admin-dialog-close"),
	adminTabs: Array.from(document.querySelectorAll("[data-admin-tab]")),
	adminPanels: Array.from(document.querySelectorAll("[data-admin-panel]")),
	adminWorkdayForm: document.querySelector("#admin-workday-form"),
	adminPaymentForm: document.querySelector("#admin-payment-form"),
	adminHolidayForm: document.querySelector("#admin-holiday-form"),
	adminPaymentList: document.querySelector("#admin-payment-list"),
	adminHolidayList: document.querySelector("#admin-holiday-list"),
	adminMessage: document.querySelector("#admin-message"),
	customSection: document.querySelector("#custom-counters-section"),
	customCountersKicker: document.querySelector("#custom-counters-kicker"),
	customPanels: document.querySelector("#custom-panels"),
	toast: document.querySelector("#app-toast"),
};

let currentUser = null;
let userSettings = { ...DEFAULTS };
let unsubscribeSettings = null;
let unsubscribeCounters = null;
let counterSlots = new Map();
let unsubscribeArchive = null;
let unsubscribeImages = null;
let unsubscribeProfile = null;
let unsubscribeTeams = null;
let unsubscribeWorkspaceSettings = null;
let unsubscribeGeneralConfig = null;
let userTeams = [];
let activeWorkspace = { type: "personal" };
let personalSettingsData = { ...DEFAULTS };
let workspaceGroupSettings = normalizeGroupSettings();
let preferredWorkspaceValue = "personal";
let teamsReady = false;
let workspaceSubscriptionVersion = 0;
let pendingInvites = [];
let customProgressBars = [];
let toastTimer = null;
let editingCounterId = null;
let userImages = [];
let imageUrls = new Map();
let imageLoadVersion = 0;
let activeUploadTask = null;
let librarySelectsCounter = false;
let imageLibraryAvailable = true;
let currentUserIsAdmin = false;
let countersReady = false;
let archivedCounters = [];
let archiveReady = false;
let timelineView = "linear";
let selectedCalendarDayKey = null;
let renderedCalendarTodayKey = null;
let generalConfigDocuments = [];
let generalConfigHasRemoteData = false;
let generalConfigSnapshotReady = false;
let weatherRenderTimer = null;
let notificationScanTimer = null;
let notificationScanInProgress = false;
let pushMessaging = null;
let pushListenersReady = false;
let pushRegistrationState = pushConfigured ? "idle" : "local";
let pushRegistrationPromise = null;
let pushDeviceId = null;

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
		endHour: Number.isInteger(savedHour) && savedHour >= 0 && savedHour <= 23
			? savedHour
			: DEFAULTS.endHour,
		endMinutes:
			Number.isInteger(savedMinutes) && savedMinutes >= 0 && savedMinutes <= 59
			? savedMinutes
			: DEFAULTS.endMinutes,
	};
}

function ensureSelectValue(select, value) {
	if (Array.from(select.options).some((option) => option.value === value)) return;
	const option = document.createElement("option");
	option.value = value;
	option.textContent = value.padStart(2, "0");
	select.append(option);
}

function syncTimeControls(hour, minutes) {
	const hourValue = String(hour);
	const minuteValue = String(minutes);
	for (const select of [elements.hour, elements.guestHour]) {
		ensureSelectValue(select, hourValue);
	}
	for (const select of [elements.minutes, elements.guestMinutes]) {
		ensureSelectValue(select, minuteValue);
	}
	elements.hour.value = hourValue;
	elements.minutes.value = minuteValue;
	elements.guestHour.value = hourValue;
	elements.guestMinutes.value = minuteValue;
	window.fill?.();
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

function confirmAction({
	title = "Confirmar ação",
	message,
	confirmLabel = "Confirmar",
	danger = true,
}) {
	elements.confirmationDialogTitle.textContent = title;
	elements.confirmationDialogMessage.textContent = message;
	elements.confirmationDialogConfirm.textContent = confirmLabel;
	elements.confirmationDialogConfirm.classList.toggle("is-danger", danger);
	elements.confirmationDialog.returnValue = "cancel";
	elements.confirmationDialog.showModal();

	return new Promise((resolve) => {
		elements.confirmationDialog.addEventListener(
			"close",
			() => resolve(elements.confirmationDialog.returnValue === "confirm"),
			{ once: true },
		);
	});
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
	if (state !== "live") elements.openCounterModal.disabled = true;
}

function setArchiveState(label, state = "live") {
	elements.archiveState.textContent = label;
	elements.archiveState.dataset.state = state;
}

function settingsReference(userId) {
	return doc(db, "users", userId, "data", "settings");
}

function teamSettingsReference(teamId) {
	return doc(db, "teams", teamId, "data", "settings");
}

function legacyCountersReference(userId) {
	return doc(db, "users", userId, "data", "counters");
}

function countersCollectionReference(userId) {
	return collection(db, "users", userId, "counters");
}

function teamCountersCollectionReference(teamId) {
	return collection(db, "teams", teamId, "counters");
}

function archiveReference(userId) {
	return doc(db, "users", userId, "data", "archive");
}

function imagesReference(userId) {
	return doc(db, "users", userId, "data", "images");
}

function generalConfigReference(configId) {
	return doc(db, "generalConfig", configId);
}

function generalConfigSeed() {
	return Array.isArray(window.GENERAL_CONFIG_SEED)
		? window.GENERAL_CONFIG_SEED.map((item) => ({ ...item }))
		: [];
}

function normalizeWorkdayConfig(item) {
	const fallback = generalConfigSeed().find((entry) => entry.id === "workday") || {
		startTime: "08:00",
		endTime: "17:55",
		daysOfWeek: [1, 2, 3, 4, 5],
	};
	const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
	const daysOfWeek = [
		...new Set(
			(Array.isArray(item?.daysOfWeek) ? item.daysOfWeek : fallback.daysOfWeek)
				.map(Number)
				.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
		),
	].sort((first, second) => first - second);
	return {
		id: "workday",
		type: "workday",
		startTime: timePattern.test(item?.startTime)
			? item.startTime
			: fallback.startTime,
		endTime: timePattern.test(item?.endTime) ? item.endTime : fallback.endTime,
		daysOfWeek: daysOfWeek.length ? daysOfWeek : fallback.daysOfWeek,
	};
}

function normalizeCalendarConfig(item) {
	if (!item || !["payment", "holiday"].includes(item.type)) return null;
	const dateTime = String(item.dateTime || "");
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dateTime)) return null;
	const parsed = new Date(dateTime);
	if (Number.isNaN(parsed.getTime())) return null;
	return { id: String(item.id || ""), type: item.type, dateTime };
}

function applyGeneralConfig(documents, hasRemoteData = false) {
	generalConfigHasRemoteData = hasRemoteData;
	generalConfigDocuments = documents.length ? documents : generalConfigSeed();
	const workday = normalizeWorkdayConfig(
		generalConfigDocuments.find((item) => item.id === "workday"),
	);
	const calendars = generalConfigDocuments
		.map(normalizeCalendarConfig)
		.filter(Boolean);
	window.expedientePadrao = workday;
	window.pagamentos = calendars
		.filter((item) => item.type === "payment")
		.map((item) => new Date(item.dateTime))
		.sort((first, second) => first - second);
	window.feriados = calendars
		.filter((item) => item.type === "holiday")
		.map((item) => new Date(item.dateTime))
		.sort((first, second) => first - second);
	renderTimeline();

	const [endHour, endMinutes] = workday.endTime.split(":").map(Number);
	DEFAULTS.endHour = endHour;
	DEFAULTS.endMinutes = endMinutes;
	if (
		!currentUser &&
		!getCookieValue("hourTime") &&
		!getCookieValue("minutesTime")
	) {
		applySettings({ ...DEFAULTS, endHour, endMinutes });
	}
	renderAdminConfig();
	window.fill?.();
}

let generalConfigSeedInProgress = false;

async function seedGeneralConfigIfNeeded() {
	if (
		!currentUserIsAdmin ||
		!generalConfigSnapshotReady ||
		generalConfigHasRemoteData ||
		generalConfigSeedInProgress
	) {
		return;
	}
	generalConfigSeedInProgress = true;
	try {
		const batch = writeBatch(db);
		for (const item of generalConfigSeed()) {
			const { id, ...data } = item;
			batch.set(generalConfigReference(id), {
				...data,
				updatedAt: serverTimestamp(),
			});
		}
		await batch.commit();
		showToast("Configuração geral inicializada.");
	} catch (error) {
		console.error("Falha ao inicializar configuração geral.", error);
		showToast("Não foi possível inicializar a configuração geral.");
	} finally {
		generalConfigSeedInProgress = false;
	}
}

function subscribeToGeneralConfig() {
	unsubscribeGeneralConfig?.();
	unsubscribeGeneralConfig = onSnapshot(
		collection(db, "generalConfig"),
		(snapshot) => {
			generalConfigSnapshotReady = true;
			const documents = snapshot.docs.map((item) => ({
				id: item.id,
				...item.data(),
			}));
			applyGeneralConfig(documents, !snapshot.empty);
			seedGeneralConfigIfNeeded();
		},
		(error) => {
			console.error("Falha ao acompanhar configuração geral.", error);
			applyGeneralConfig(generalConfigSeed());
		},
	);
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

	let previewChecklist = document.querySelector("#counter-preview-checklist");
	if (!previewChecklist) {
		previewChecklist = document.createElement("div");
		previewChecklist.id = "counter-preview-checklist";
		previewChecklist.className = "counter-card-checklist";
		elements.counterPreviewCard.append(previewChecklist);
	}
	previewChecklist.replaceChildren();
	if (currentChecklist.length > 0) {
		currentChecklist.forEach((item) => {
			const label = document.createElement("label");
			label.className = "checklist-item-row";

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = item.done;
			checkbox.disabled = true;

			const textSpan = document.createElement("span");
			textSpan.textContent = item.text || "Subtarefa";

			label.append(checkbox, textSpan);
			previewChecklist.append(label);
		});
	}
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

function switchLibraryTab(tabName) {
	const isUpload = tabName === "upload";
	elements.libraryTabUpload.setAttribute("aria-selected", String(isUpload));
	elements.libraryTabAi.setAttribute("aria-selected", String(!isUpload));
	elements.libraryPanelUpload.hidden = !isUpload;
	elements.libraryPanelAi.hidden = isUpload;
	elements.imageLibraryMessage.textContent = "";
}

function openImageLibrary(selectForCounter = false) {
	if (!currentUser) return;
	if (!imageLibraryAvailable) {
		showToast("Publique as novas regras do Firebase para ativar a biblioteca.");
		return;
	}
	librarySelectsCounter = selectForCounter;
	elements.imageLibraryMessage.textContent = "";
	switchLibraryTab("upload");
	if (elements.aiPromptInput) elements.aiPromptInput.value = "";
	if (elements.aiThemeSelect) elements.aiThemeSelect.value = "";
	if (elements.aiRatioSelect) elements.aiRatioSelect.value = "4:3";
	if (elements.aiLoading) elements.aiLoading.hidden = true;
	if (elements.aiGenerateBtn) elements.aiGenerateBtn.disabled = false;
	renderImageLibrary();
	if (!selectForCounter) closeSidebar();
	elements.imageLibraryDialog.showModal();
	window.requestAnimationFrame(() => elements.imageLibraryClose.focus());
}

function closeImageLibrary() {
	if (elements.imageLibraryDialog.open) elements.imageLibraryDialog.close();
}

function openArchiveDialog() {
	if (!currentUser) return;
	closeSidebar();
	renderArchive(archivedCounters);
	elements.archiveDialog.showModal();
	window.requestAnimationFrame(() => elements.archiveDialogClose.focus());
}

function closeArchiveDialog() {
	if (elements.archiveDialog.open) elements.archiveDialog.close();
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

async function generateImage({ prompt, theme, ratio }) {
	const aiStudioKey = window.TimekeeperRuntimeConfig?.aiStudioApiKey;
	if (aiStudioKey) {
		try {
			const { GoogleGenAI } = await import("https://esm.run/@google/genai");
			const ai = new GoogleGenAI({ apiKey: aiStudioKey });

			let fullPrompt = prompt;
			if (theme) {
				fullPrompt = `${prompt}, theme color palette is ${theme}`;
			}
			fullPrompt = `${fullPrompt}, beautiful abstract background, elegant modern minimal style, high resolution digital design, clean wallpaper composition, web UI background optimized, no text, no watermarks`;

			const response = await ai.models.generateImages({
				model: "imagen-3.0-generate-002",
				prompt: fullPrompt,
				config: {
					numberOfImages: 1,
					aspectRatio: ratio || "4:3",
				},
			});

			if (response?.generatedImages?.length > 0) {
				return {
					mimeType: "image/png",
					base64Data: response.generatedImages[0].image.imageBytes,
				};
			}
			throw new Error("Nenhuma imagem gerada ou o prompt foi bloqueado por filtros de segurança.");
		} catch (error) {
			console.error("Falha ao gerar com Google AI Studio SDK:", error);
			throw error;
		}
	}

	ensureAppCheck();
	if (!aiInstance) {
		aiInstance = getAI(app, { backend: new GoogleAIBackend() });
	}

	const model = getGenerativeModel(aiInstance, {
		model: "gemini-2.5-flash-image",
		generationConfig: {
			responseModalities: [ResponseModality.TEXT, ResponseModality.IMAGE],
			imageConfig: {
				aspectRatio: ratio || "4:3",
			}
		}
	});

	let fullPrompt = prompt;
	if (theme) {
		fullPrompt = `${prompt}, theme color palette is ${theme}`;
	}
	fullPrompt = `${fullPrompt}, beautiful abstract background, elegant modern minimal style, high resolution digital design, clean wallpaper composition, web UI background optimized, no text, no watermarks`;

	const result = await model.generateContent(fullPrompt);
	const response = await result.response;
	const parts = response.inlineDataParts();
	if (!parts || parts.length === 0) {
		throw new Error("Nenhuma imagem gerada ou o prompt foi bloqueado por filtros de segurança.");
	}

	const part = parts[0];
	if (!part.inlineData || !part.inlineData.data) {
		throw new Error("Formato de imagem inválido.");
	}

	return {
		mimeType: part.inlineData.mimeType,
		base64Data: part.inlineData.data,
	};
}

async function handleGenerateAiImage() {
	if (!currentUser) return;
	const prompt = elements.aiPromptInput.value.trim();
	if (!prompt) {
		elements.imageLibraryMessage.textContent = "Por favor, digite uma descrição para a imagem.";
		return;
	}

	elements.imageLibraryMessage.textContent = "";
	const theme = elements.aiThemeSelect.value;
	const ratio = elements.aiRatioSelect.value;

	const occupiedSlots = new Set(userImages.map((image) => image.slot));
	const slot = Array.from({ length: MAX_IMAGES }, (_, index) => index).find(
		(index) => !occupiedSlots.has(index),
	);
	if (slot === undefined) {
		elements.imageLibraryMessage.textContent = "Sua biblioteca já possui 10 imagens. Remova uma para liberar espaço.";
		return;
	}

	elements.aiLoading.hidden = false;
	elements.aiGenerateBtn.disabled = true;
	elements.imageLibraryMessage.textContent = "";
	elements.aiLoadingText.textContent = "Gerando imagem com Inteligência Artificial...";

	const ownerId = currentUser.uid;
	let activeSlotImageRef = imageStorageReference(ownerId, slot);

	try {
		const { mimeType, base64Data } = await generateImage({ prompt, theme, ratio });
		elements.aiLoadingText.textContent = "Processando e enviando para a biblioteca...";

		const res = await fetch(`data:${mimeType};base64,${base64Data}`);
		const blob = await res.blob();

		const cleanName = prompt.slice(0, 20).toLowerCase().replace(/[^a-z0-9]/g, "_") || "bg";
		const filename = `ai_${cleanName}_${Date.now()}.png`;
		const file = new File([blob], filename, { type: mimeType });

		const image = {
			id: createCounterId(),
			slot,
			name: `IA: ${prompt.slice(0, 30)}...`,
			size: file.size,
			contentType: file.type,
			createdAt: new Date().toISOString(),
		};

		activeUploadTask = uploadBytesResumable(
			activeSlotImageRef,
			file,
			{ contentType: file.type, customMetadata: { imageId: image.id, generatedByAi: "true" } },
		);

		await new Promise((resolve, reject) => {
			activeUploadTask.on(
				"state_changed",
				(snapshot) => {
					const progress = Math.round(
						(snapshot.bytesTransferred / snapshot.totalBytes) * 100,
					);
					elements.aiLoadingText.textContent = `Enviando imagem para biblioteca (${progress}%)`;
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
			await deleteObject(activeSlotImageRef);
			throw new Error("Não foi possível salvar os metadados da imagem.");
		}

		elements.imageLibraryMessage.textContent = "Imagem gerada e salva com sucesso!";
		elements.aiPromptInput.value = "";
		elements.aiThemeSelect.value = "";
		renderImageLibrary();
		if (librarySelectsCounter) {
			setSelectedCounterImage(image.id);
			renderImageLibrary();
			elements.imageLibraryDialog.close();
		}
	} catch (error) {
		console.error("Falha ao gerar/salvar imagem IA:", error);
		elements.imageLibraryMessage.textContent =
			error.message || "Erro desconhecido ao gerar a imagem. Verifique a conexão.";
	} finally {
		activeUploadTask = null;
		elements.aiLoading.hidden = true;
		elements.aiGenerateBtn.disabled = false;
	}
}

async function deleteLibraryImage(image) {
	if (!currentUser) return;
	const affectedCounters = userSettings.customCounters.filter(
		(counter) => counter.imageId === image.id,
	).length;
	if (affectedCounters && !canEditActiveWorkspace()) {
		showToast("Remova a imagem dos contadores com uma conta editora antes de excluí-la.");
		return;
	}
	const suffix = affectedCounters
		? ` Ela será removida de ${affectedCounters} ${affectedCounters === 1 ? "contador" : "contadores"}.`
		: "";
	if (
		!(await confirmAction({
			title: "Excluir imagem?",
			message: `“${image.name}” será excluída da biblioteca.${suffix}`,
			confirmLabel: "Excluir imagem",
		}))
	)
		return;

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
			const countersCollection = activeCountersCollectionReference();
			nextCounters.forEach((counter, order) => {
				const slot = counterSlots.get(counter.id);
				if (slot != null) {
					batch.set(doc(countersCollection, slot), counterPayload(counter, order));
				}
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

function renderWeatherWidgets() {
	window.TimekeeperWeather.render(document, userSettings.weatherWidgets, {
		primary: isHexColor(userSettings.accentPrimary)
			? userSettings.accentPrimary
			: DEFAULTS.accentPrimary,
		secondary: isHexColor(userSettings.accentSecondary)
			? userSettings.accentSecondary
			: DEFAULTS.accentSecondary,
	});
}

function scheduleWeatherRender(delay = 180) {
	window.clearTimeout(weatherRenderTimer);
	weatherRenderTimer = window.setTimeout(renderWeatherWidgets, delay);
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
	window.TimekeeperWeather?.applyColors(
		document,
		safePrimary,
		safeSecondary,
	);
	scheduleWeatherRender();
}

const BACKGROUND_DESCRIPTIONS = {
	lava: "Formas quentes que sobem, se fundem e mudam lentamente.",
	float: "Orbes mais definidos cruzam a tela em trajetórias independentes.",
	glass: "Faixas translúcidas refratam cor sob superfícies de vidro.",
	rings: "Arcos concêntricos acompanham segundos e minutos em órbitas lentas.",
	aurora: "Faixas luminosas atravessam a tela como uma aurora em movimento.",
	topography: "Linhas de contorno fluem como um mapa topográfico vivo.",
	constellation: "Pontos flutuantes formam conexões efêmeras e reagem ao cursor.",
	nebula: "Nuvens estelares atravessam o tempo em camadas de luz procedural.",
	grid: "Uma grade em perspectiva pulsa e avança por um horizonte quântico.",
	singularity: "Um horizonte orbital curva poeira luminosa ao redor de um núcleo escuro.",
	prism: "Ondas translúcidas se cruzam em faixas e reflexos prismáticos.",
	vortex: "Anéis e marcas radiais espiralam como um mecanismo cronológico.",
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
	webglBackground.configure({
		enabled,
		style,
		colorA,
		colorB,
		speed,
		intensity,
	});
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
const timelineOrientationQuery = window.matchMedia("(max-width: 700px)");
const webglBackground = createWebGLBackground(
	elements.webglBackgroundCanvas,
	reducedMotionQuery,
);
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

function setAdminAccess(isAdmin) {
	currentUserIsAdmin = isAdmin === true;
	elements.openAdminModal.hidden = !currentUserIsAdmin;
	if (!currentUserIsAdmin && elements.adminDialog.open) {
		elements.adminDialog.close();
	}
	if (currentUserIsAdmin) seedGeneralConfigIfNeeded();
}

function selectAdminTab(tabName, moveFocus = false) {
	for (const tab of elements.adminTabs) {
		const isSelected = tab.dataset.adminTab === tabName;
		tab.setAttribute("aria-selected", String(isSelected));
		tab.tabIndex = isSelected ? 0 : -1;
		if (isSelected && moveFocus) tab.focus();
	}
	for (const panel of elements.adminPanels) {
		panel.hidden = panel.dataset.adminPanel !== tabName;
	}
}

function resetAdminDateForm(form) {
	form.reset();
	form.elements.editingId.value = "";
	form.querySelector('[type="submit"]').textContent = "Salvar";
	form.querySelector(".admin-date-cancel").hidden = true;
}

function editAdminDate(form, item) {
	form.elements.editingId.value = item.id;
	form.elements.date.value = item.dateTime.slice(0, 10);
	form.querySelector('[type="submit"]').textContent = "Salvar";
	form.querySelector(".admin-date-cancel").hidden = false;
	form.elements.date.focus();
}

function formatAdminDate(dateTime) {
	const [year, month, day] = dateTime.slice(0, 10).split("-").map(Number);
	return new Intl.DateTimeFormat("pt-BR", {
		weekday: "short",
		day: "2-digit",
		month: "long",
		year: "numeric",
	}).format(new Date(year, month - 1, day, 12));
}

function adminActionButton(icon, label, handler) {
	const button = document.createElement("button");
	button.className = "counter-action";
	button.type = "button";
	button.title = label;
	button.setAttribute("aria-label", label);
	button.innerHTML = `<i class="material-icons" aria-hidden="true">${icon}</i>`;
	button.addEventListener("click", handler);
	return button;
}

async function deleteAdminDate(item) {
	if (!currentUserIsAdmin) return;
	if (
		!(await confirmAction({
			title: "Remover data?",
			message: `${formatAdminDate(item.dateTime)} será removida da configuração geral.`,
			confirmLabel: "Remover data",
		}))
	)
		return;
	try {
		await deleteDoc(generalConfigReference(item.id));
		showToast("Data removida.");
	} catch (error) {
		console.error("Falha ao remover data geral.", error);
		showToast("Não foi possível remover a data.");
	}
}

function renderAdminDateList(type, container, form) {
	const items = generalConfigDocuments
		.map(normalizeCalendarConfig)
		.filter((item) => item?.type === type)
		.sort((first, second) => first.dateTime.localeCompare(second.dateTime));
	container.replaceChildren();
	if (!items.length) {
		const empty = document.createElement("p");
		empty.className = "admin-date-empty";
		empty.textContent = "Nenhuma data cadastrada.";
		container.append(empty);
		return;
	}
	for (const item of items) {
		const row = document.createElement("div");
		row.className = "admin-date-row";
		const time = document.createElement("time");
		time.dateTime = item.dateTime.slice(0, 10);
		time.textContent = formatAdminDate(item.dateTime);
		const actions = document.createElement("div");
		actions.className = "admin-date-actions";
		actions.append(
			adminActionButton("edit", `Editar ${time.textContent}`, () =>
				editAdminDate(form, item),
			),
			adminActionButton("delete_outline", `Remover ${time.textContent}`, () =>
				deleteAdminDate(item),
			),
		);
		row.append(time, actions);
		container.append(row);
	}
}

function renderAdminConfig() {
	if (!elements.adminWorkdayForm) return;
	const workday = normalizeWorkdayConfig(
		generalConfigDocuments.find((item) => item.id === "workday"),
	);
	elements.adminWorkdayForm.elements.startTime.value = workday.startTime;
	elements.adminWorkdayForm.elements.endTime.value = workday.endTime;
	const selectedDays = new Set(workday.daysOfWeek);
	elements.adminWorkdayForm
		.querySelectorAll('input[name="daysOfWeek"]')
		.forEach((input) => (input.checked = selectedDays.has(Number(input.value))));
	renderAdminDateList(
		"payment",
		elements.adminPaymentList,
		elements.adminPaymentForm,
	);
	renderAdminDateList(
		"holiday",
		elements.adminHolidayList,
		elements.adminHolidayForm,
	);
}

function openAdminDialog() {
	if (!currentUser || !currentUserIsAdmin) return;
	closeSidebar();
	selectAdminTab("workday");
	elements.adminMessage.textContent = "";
	renderAdminConfig();
	elements.adminDialog.showModal();
	elements.adminDialogClose.focus();
}

function closeAdminDialog() {
	if (elements.adminDialog.open) elements.adminDialog.close();
	resetAdminDateForm(elements.adminPaymentForm);
	resetAdminDateForm(elements.adminHolidayForm);
	elements.adminMessage.textContent = "";
}

async function saveAdminCalendarDate(event, type) {
	event.preventDefault();
	if (!currentUserIsAdmin) return;
	const form = event.currentTarget;
	const date = String(form.elements.date.value || "");
	const editingId = String(form.elements.editingId.value || "");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
	const prefix = type === "payment" ? "payment" : "holiday";
	const nextId = `${prefix}-${date}`;
	const existing = generalConfigDocuments.find((item) => item.id === editingId);
	const duplicate = generalConfigDocuments.some(
		(item) => item.id === nextId && item.id !== editingId,
	);
	if (duplicate) {
		elements.adminMessage.textContent = "Essa data já está cadastrada.";
		return;
	}
	const defaultTime = type === "payment" ? "12:00:00" : "17:55:00";
	const preservedTime = existing?.dateTime?.slice(11) || defaultTime;
	const batch = writeBatch(db);
	if (editingId && editingId !== nextId) {
		batch.delete(generalConfigReference(editingId));
	}
	batch.set(generalConfigReference(nextId), {
		type,
		dateTime: `${date}T${preservedTime}`,
		updatedAt: serverTimestamp(),
	});
	form.querySelector('[type="submit"]').disabled = true;
	try {
		await batch.commit();
		if (form.elements.editingId.value === editingId) resetAdminDateForm(form);
		elements.adminMessage.textContent = editingId
			? "Data atualizada."
			: "Data adicionada.";
	} catch (error) {
		console.error("Falha ao salvar data geral.", error);
		elements.adminMessage.textContent = "Não foi possível salvar a data.";
	} finally {
		form.querySelector('[type="submit"]').disabled = false;
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
	const entries = Object.entries(partialSettings || {});
	const groupKeys = new Set(["counterGroups", "hiddenCounterGroups"]);
	const teamEntries =
		activeWorkspace.type === "team"
			? entries.filter(([key]) => groupKeys.has(key))
			: [];
	const personalEntries = entries.filter(
		([key]) => activeWorkspace.type !== "team" || !groupKeys.has(key),
	);
	if (teamEntries.length > 0 && !canEditActiveWorkspace()) {
		showToast("Seu acesso a esta equipe é somente para visualização.");
		return false;
	}
	setSaveState("Salvando...", true);
	try {
		const writes = [];
		if (personalEntries.length > 0) {
			writes.push(
				setDoc(
					settingsReference(currentUser.uid),
					{
						...Object.fromEntries(personalEntries),
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				),
			);
		}
		if (teamEntries.length > 0) {
			writes.push(
				setDoc(
					teamSettingsReference(activeWorkspace.id),
					{
						...Object.fromEntries(teamEntries),
						updatedAt: serverTimestamp(),
					},
					{ merge: true },
				),
			);
		}
		await Promise.all(writes);
		setSaveState("Sincronizado");
		return true;
	} catch (error) {
		console.error("Falha ao salvar configurações.", error);
		setSaveState("Erro ao salvar");
		showToast("Não foi possível sincronizar as alterações.");
		return false;
	}
}

function availableCounterSlot(usedSlots) {
	for (let slot = 0; slot < getMaxCounters(); slot += 1) {
		if (!usedSlots.has(String(slot))) return String(slot);
	}
	return null;
}

function counterPayload(counter, order) {
	return { ...counter, order, updatedAt: serverTimestamp() };
}

async function saveCounters(counters) {
	if (!currentUser) return false;
	if (!canEditActiveWorkspace()) {
		showToast("Seu acesso a esta equipe é somente para visualização.");
		return false;
	}
	setCounterState("Salvando...", "saving");
	const sanitized = normalizeCounters(counters).slice(0, getMaxCounters());
	try {
		const countersCollection = activeCountersCollectionReference();
		const nextSlots = new Map();
		const usedSlots = new Set();
		for (const counter of sanitized) {
			const existingSlot = counterSlots.get(counter.id);
			if (existingSlot != null && !usedSlots.has(existingSlot)) {
				nextSlots.set(counter.id, existingSlot);
				usedSlots.add(existingSlot);
			}
		}
		for (const counter of sanitized) {
			if (nextSlots.has(counter.id)) continue;
			const slot = availableCounterSlot(usedSlots);
			if (slot == null) throw new Error("counter-slot-limit-reached");
			nextSlots.set(counter.id, slot);
			usedSlots.add(slot);
		}

		const batch = writeBatch(db);
		sanitized.forEach((counter, order) => {
			batch.set(
				doc(countersCollection, nextSlots.get(counter.id)),
				counterPayload(counter, order),
			);
		});
		for (const [counterId, slot] of counterSlots) {
			if (!nextSlots.has(counterId)) batch.delete(doc(countersCollection, slot));
		}
		await batch.commit();
		counterSlots = nextSlots;
		userSettings.customCounters = sanitized;
		setCounterState("Ao vivo", "live");
		return true;
	} catch (error) {
		console.error("Falha ao salvar contadores.", error);
		console.error("Payload being sent:", JSON.stringify(sanitized, null, 2));
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
		const panel = elements.customPanels.querySelector(
			`.user-panel[data-id="${CSS.escape(counter.id)}"]`,
		);
		const archiveButton = panel?.querySelector(".counter-card-archive");
		if (archiveButton) {
			const isComplete =
				counter.type === "fixed" &&
				state.target - now < 1000;
			archiveButton.hidden =
				!isComplete || !canEditActiveWorkspace() || activeWorkspace.type === "team";
			archiveButton.disabled =
				!archiveReady || archivedCounters.length >= MAX_ARCHIVED_COUNTERS;
		}
	});
}

function createCustomPanel(counter, index) {
	const panel = document.createElement("article");
	panel.className = "a-panel user-panel";
	panel.dataset.id = counter.id;
	panel.dataset.focusId = counter.id;
	panel.style.setProperty(
		"--counter-color",
		counter.color || "var(--accent)",
	);
	const imageUrl = counter.imageId ? imageUrls.get(counter.imageId) : "";
	if (imageUrl) {
		panel.classList.add("has-media");
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
	const focusButton = document.createElement("button");
	focusButton.type = "button";
	focusButton.className = "focus-mode-trigger";
	focusButton.dataset.focusTrigger = "";
	focusButton.title = "Modo de foco";
	focusButton.setAttribute("aria-label", `Focar contador ${counter.name}`);
	focusButton.innerHTML =
		'<i class="material-icons" aria-hidden="true">center_focus_strong</i>';
	top.append(focusButton);
	const archiveButton = document.createElement("button");
	archiveButton.type = "button";
	archiveButton.className = "counter-card-archive";
	archiveButton.hidden = true;
	archiveButton.title = `Arquivar ${counter.name}`;
	archiveButton.setAttribute("aria-label", `Arquivar contador ${counter.name}`);
	archiveButton.innerHTML =
		'<i class="material-icons" aria-hidden="true">archive</i>';
	archiveButton.addEventListener("click", () => {
		const currentCounter = userSettings.customCounters.find(
			(item) => item.id === panel.dataset.id,
		);
		if (currentCounter) archiveCounter(currentCounter);
	});
	top.append(archiveButton);
	if (counter.imageId && canEditActiveWorkspace()) {
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

	if (Array.isArray(counter.checklist) && counter.checklist.length > 0) {
		const checklistContainer = document.createElement("div");
		checklistContainer.className = "counter-card-checklist";
		counter.checklist.forEach((item) => {
			const label = document.createElement("label");
			label.className = "checklist-item-row";

			const checkbox = document.createElement("input");
			checkbox.type = "checkbox";
			checkbox.checked = item.done;
			checkbox.disabled = !canEditActiveWorkspace();
			checkbox.addEventListener("change", async () => {
				checkbox.disabled = true;
				const isChecked = checkbox.checked;
				const nextCounters = userSettings.customCounters.map((c) => {
					if (c.id !== counter.id) return c;
					const nextChecklist = (c.checklist || []).map((t) => {
						if (t.id !== item.id) return t;
						return { ...t, done: isChecked };
					});
					return { ...c, checklist: nextChecklist };
				});
				if (!(await saveCounters(nextCounters))) {
					checkbox.checked = !isChecked;
				}
				checkbox.disabled = false;
			});

			const textSpan = document.createElement("span");
			textSpan.textContent = item.text;

			label.append(checkbox, textSpan);
			checklistContainer.append(label);
		});
		panel.append(top, pre, main, post, checklistContainer, progress);
	} else {
		panel.append(top, pre, main, post, progress);
	}

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

async function toggleCounterVisibility(counter) {
	if (!canEditActiveWorkspace()) {
		showToast("Seu acesso a esta equipe é somente para visualização.");
		return;
	}
	if (!isActiveWorkspacePremium()) {
		showToast("🔒 Ocultar contadores da dashboard é um recurso do plano Premium.");
		return;
	}
	const nextCounters = userSettings.customCounters.map((c) =>
		c.id === counter.id ? { ...c, hidden: !c.hidden } : c,
	);
	applyCounters(nextCounters);
	try {
		await saveCounters(nextCounters);
	} catch (error) {
		console.error("Falha ao atualizar visibilidade do contador.", error);
		showToast("Não foi possível salvar a visibilidade do contador.");
	}
}

function renderCounterList(counters) {
	elements.counterList.replaceChildren();
	const canEdit = canEditActiveWorkspace();
	const isPremium = isActiveWorkspacePremium();
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
		if (!canEdit) {
			item.append(dot, copy);
			elements.counterList.append(item);
			return;
		}
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

		const isHidden = Boolean(counter.hidden);
		const toggleVisibility = actionButton(
			isHidden ? "visibility_off" : "visibility",
			isPremium
				? (isHidden ? `Exibir ${counter.name} na dashboard` : `Ocultar ${counter.name} da dashboard`)
				: "🔒 Ocultar contador (Recurso Premium)",
			() => toggleCounterVisibility(counter),
			!isPremium,
		);
		if (isHidden) toggleVisibility.classList.add("counter-is-hidden");

		actions.append(
			toggleVisibility,
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
		if (counter.type === "fixed" && activeWorkspace.type !== "team") {
			const archive = actionButton(
				"archive",
				`Arquivar contador ${counter.name}`,
				() => archiveCounter(counter),
				!archiveReady || archivedCounters.length >= MAX_ARCHIVED_COUNTERS,
			);
			archive.classList.add("archive-counter");
			actions.append(archive);
		}
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

function formatArchivedAt(value) {
	return new Intl.DateTimeFormat("pt-BR", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function renderArchive(counters) {
	elements.archiveList.replaceChildren();
	elements.archiveEmpty.hidden = counters.length > 0;
	elements.archiveCount.textContent = `${counters.length} / ${MAX_ARCHIVED_COUNTERS}`;
	for (const counter of counters) {
		const item = document.createElement("article");
		item.className = "archive-item";
		const copy = document.createElement("div");
		copy.className = "archive-item-copy";
		const name = document.createElement("strong");
		name.textContent = counter.name;
		const date = document.createElement("span");
		date.textContent = `Arquivado em ${formatArchivedAt(counter.archivedAt)}`;
		copy.append(name, date);
		if (Array.isArray(counter.checklist) && counter.checklist.length > 0) {
			const checklist = document.createElement("span");
			const completed = counter.checklist.filter((entry) => entry.done).length;
			checklist.textContent = `${completed} de ${counter.checklist.length} subtarefas concluídas`;
			copy.append(checklist);
		}
		const remove = document.createElement("button");
		remove.className = "counter-action delete-counter";
		remove.type = "button";
		remove.title = `Excluir ${counter.name} permanentemente`;
		remove.setAttribute(
			"aria-label",
			`Excluir ${counter.name} permanentemente`,
		);
		remove.disabled = !archiveReady;
		remove.innerHTML = '<i class="material-icons" aria-hidden="true">delete_forever</i>';
		remove.addEventListener("click", () => deleteArchivedCounter(counter));
		item.append(copy, remove);
		elements.archiveList.append(item);
	}
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

	const visibleCounters = counters.filter(
		(c) => !isActiveWorkspacePremium() || !c.hidden,
	);
	const rawGroups = userSettings.counterGroups || [];
	const namedGroups = rawGroups.filter((g) => g !== OUTROS_KEY);
	// Effective render order: OUTROS_KEY marks position of the ungrouped row.
	// If not present, ungrouped always comes first (backward compat).
	const effectiveOrder =
		namedGroups.length > 0
			? rawGroups.includes(OUTROS_KEY)
				? rawGroups
				: [OUTROS_KEY, ...namedGroups]
			: [];

	if (effectiveOrder.length > 0 && visibleCounters.length > 0) {
		const ungrouped = visibleCounters.filter(
			(c) => !c.group || !namedGroups.includes(c.group),
		);
		const groupedMap = new Map(namedGroups.map((g) => [g, []]));
		visibleCounters.forEach((c) => {
			if (c.group && groupedMap.has(c.group)) {
				groupedMap.get(c.group).push(c);
			}
		});

		let renderedCount = 0;
		const hiddenGroups = new Set(userSettings.hiddenCounterGroups || []);

		effectiveOrder.forEach((entry) => {
			if (isActiveWorkspacePremium() && hiddenGroups.has(entry)) return;
			if (entry === OUTROS_KEY) {
				if (ungrouped.length === 0) return;
				const groupRow = document.createElement("div");
				groupRow.className = "custom-counter-group-row";
				const header = document.createElement("div");
				header.className = "group-row-header";
				header.innerHTML = `
					<div class="group-row-title-wrap">
						<span class="group-row-badge group-row-default">
							<i class="material-icons" style="font-size: 14px;" aria-hidden="true">label_outline</i>
							Outros Contadores
						</span>
					</div>
					<span class="group-row-count">${ungrouped.length} contador(es)</span>
				`;
				const grid = document.createElement("div");
				grid.className = "custom-panels-grid";
				grid.dataset.count = String(ungrouped.length);
				ungrouped.forEach((counter) => {
					grid.append(createCustomPanel(counter, renderedCount++));
				});
				groupRow.append(header, grid);
				elements.customPanels.append(groupRow);
			} else {
				const groupCounters = groupedMap.get(entry) || [];
				if (groupCounters.length === 0) return;
				const groupRow = document.createElement("div");
				groupRow.className = "custom-counter-group-row";
				groupRow.dataset.group = entry;
				const header = document.createElement("div");
				header.className = "group-row-header";
				header.innerHTML = `
					<div class="group-row-title-wrap">
						<span class="group-row-badge">
							<i class="material-icons" style="font-size: 14px;" aria-hidden="true">folder</i>
							${escapeHtml(entry)}
						</span>
					</div>
					<span class="group-row-count">${groupCounters.length} contador(es)</span>
				`;
				const grid = document.createElement("div");
				grid.className = "custom-panels-grid";
				grid.dataset.count = String(groupCounters.length);
				groupCounters.forEach((counter) => {
					grid.append(createCustomPanel(counter, renderedCount++));
				});
				groupRow.append(header, grid);
				elements.customPanels.append(groupRow);
			}
		});

		elements.customPanels.dataset.count = String(renderedCount);
	} else {
		elements.customPanels.dataset.count = String(visibleCounters.length);
		visibleCounters.forEach((counter, index) => {
			elements.customPanels.append(createCustomPanel(counter, index));
		});
	}
	updateCustomCounters();
	renderCounterList(counters);
	elements.counterCount.textContent = `${counters.length} / ${getMaxCounters()}`;
	const isFull = counters.length >= getMaxCounters();
	elements.openCounterModal.disabled =
		isFull || !countersReady || !canEditActiveWorkspace();
	elements.openCounterModalLabel.textContent = isFull
		? "Limite atingido"
		: canEditActiveWorkspace()
			? "Novo contador"
			: "Somente leitura";
	updateCustomVisibility(counters);
	if (!editingCounterId) {
		elements.counterSubmit.disabled = isFull || !canEditActiveWorkspace();
		elements.counterSubmit.textContent = isFull
			? "Limite atingido"
			: "Criar contador";
	}
}

const DASHBOARD_SECTION_LABELS = {
	standard: "Contadores padrão",
	custom: "Meus contadores",
	timeline: "Timeline",
	weather: "Previsão do tempo",
};

function iconButton(icon, label, handler) {
	const button = document.createElement("button");
	button.className = "icon-button";
	button.type = "button";
	button.title = label;
	button.setAttribute("aria-label", label);
	const glyph = document.createElement("i");
	glyph.className = "material-icons";
	glyph.setAttribute("aria-hidden", "true");
	glyph.textContent = icon;
	button.append(glyph);
	button.addEventListener("click", handler);
	return button;
}

async function persistDashboardPreferences(preferences) {
	const previous = normalizeDashboardPreferences(userSettings);
	const normalized = applyDashboardPreferences(preferences);
	Object.assign(userSettings, normalized);
	cacheDashboardPreferences(normalized);
	renderDashboardSectionControls(normalized);
	if (!(await saveSettings(normalized))) {
		Object.assign(userSettings, previous);
		applyDashboardPreferences(previous);
		cacheDashboardPreferences(previous);
		renderDashboardSectionControls(previous);
	}
}

async function toggleGroupVisibility(groupName) {
	if (!canEditActiveWorkspace()) return;
	const hidden = new Set(userSettings.hiddenCounterGroups || []);
	if (hidden.has(groupName)) {
		hidden.delete(groupName);
	} else {
		hidden.add(groupName);
	}
	const nextHidden = [...hidden];
	userSettings.hiddenCounterGroups = nextHidden;
	renderDashboardSectionControls();
	renderCustomCounters(userSettings.customCounters);
	await saveSettings({ hiddenCounterGroups: nextHidden });
}

function buildGroupOrderSubmenu(groups) {
	const effectiveOrder = groups.includes(OUTROS_KEY)
		? groups
		: [OUTROS_KEY, ...groups.filter((g) => g !== OUTROS_KEY)];
	const hiddenSet = new Set(userSettings.hiddenCounterGroups || []);
	const submenu = document.createElement("div");
	submenu.className = "group-order-submenu";
	effectiveOrder.forEach((entry, index) => {
		const item = document.createElement("div");
		item.className = "group-order-item";

		const toggle = document.createElement("label");
		toggle.className = "dashboard-section-toggle";

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = !hiddenSet.has(entry);
		const displayTitle = entry === OUTROS_KEY ? "Outros (Não agrupados)" : entry;
		checkbox.setAttribute("aria-label", `Exibir grupo ${displayTitle}`);
		checkbox.addEventListener("change", () => toggleGroupVisibility(entry));

		const label = document.createElement("span");
		label.className = "group-order-item-label";
		const icon = document.createElement("i");
		icon.className = "material-icons";
		icon.style.fontSize = "14px";
		icon.setAttribute("aria-hidden", "true");
		icon.textContent = entry === OUTROS_KEY ? "label_outline" : "folder";
		label.append(icon, document.createTextNode(displayTitle));
		toggle.append(checkbox, label);

		const acts = document.createElement("div");
		acts.className = "dashboard-section-actions";
		const upBtn = iconButton("arrow_upward", `Mover ${entry === OUTROS_KEY ? "Outros" : entry} para cima`, () =>
			reorderCounterGroup(index, -1),
		);
		upBtn.disabled = index === 0;
		const downBtn = iconButton("arrow_downward", `Mover ${entry === OUTROS_KEY ? "Outros" : entry} para baixo`, () =>
			reorderCounterGroup(index, 1),
		);
		downBtn.disabled = index === effectiveOrder.length - 1;
		acts.append(upBtn, downBtn);
		item.append(toggle, acts);
		submenu.append(item);
	});
	return submenu;
}

function renderDashboardSectionControls(data = userSettings) {
	if (!elements.dashboardLayout || !elements.dashboardSectionControls) return;
	const preferences = normalizeDashboardPreferences(data);
	elements.dashboardLayout.value = preferences.dashboardLayout;
	elements.dashboardSectionControls.replaceChildren();
	const availableOrder = preferences.dashboardSectionOrder.filter((sectionId) =>
		document.querySelector(`[data-dashboard-section="${sectionId}"]`),
	);
	availableOrder.forEach((sectionId, index) => {
		const row = document.createElement("div");
		row.className = "dashboard-section-control";
		row.dataset.dashboardSectionControl = sectionId;

		// Inner line: toggle + arrows
		const mainLine = document.createElement("div");
		mainLine.className = "dashboard-section-main-line";

		const toggle = document.createElement("label");
		toggle.className = "dashboard-section-toggle";
		const input = document.createElement("input");
		input.type = "checkbox";
		input.checked = !preferences.hiddenDashboardSections.includes(sectionId);
		input.disabled = sectionId === "standard";
		input.setAttribute(
			"aria-label",
			`Exibir ${DASHBOARD_SECTION_LABELS[sectionId]}`,
		);
		input.addEventListener("change", () => {
			const hidden = new Set(preferences.hiddenDashboardSections);
			if (input.checked) hidden.delete(sectionId);
			else hidden.add(sectionId);
			persistDashboardPreferences({
				...preferences,
				hiddenDashboardSections: [...hidden],
			});
		});
		const label = document.createElement("span");
		label.textContent =
			sectionId === "custom" && activeWorkspace.type === "team"
				? "Contadores da equipe"
				: DASHBOARD_SECTION_LABELS[sectionId];
		toggle.append(input, label);

		const actions = document.createElement("div");
		actions.className = "dashboard-section-actions";
		for (const [direction, icon, title] of [
			[-1, "arrow_upward", "Mover seção para cima"],
			[1, "arrow_downward", "Mover seção para baixo"],
		]) {
			const button = iconButton(icon, title, () => {
				const siblingId = availableOrder[index + direction];
				if (!siblingId) return;
				const nextOrder = [...preferences.dashboardSectionOrder];
				const currentIndex = nextOrder.indexOf(sectionId);
				const siblingIndex = nextOrder.indexOf(siblingId);
				[nextOrder[currentIndex], nextOrder[siblingIndex]] = [
					nextOrder[siblingIndex],
					nextOrder[currentIndex],
				];
				persistDashboardPreferences({
					...preferences,
					dashboardSectionOrder: nextOrder,
				});
			});
			button.disabled = !availableOrder[index + direction];
			actions.append(button);
		}
		mainLine.append(toggle, actions);
		row.append(mainLine);

		elements.dashboardSectionControls.append(row);
		
		if (sectionId === "custom" && elements.counterGroupControls) {
			row.append(elements.counterGroupControls);
		}
	});
}

function closeWeatherWidgetForm() {
	elements.weatherWidgetForm.hidden = true;
	elements.weatherWidgetForm.reset();
	elements.weatherWidgetForm.elements.id.value = "";
	elements.weatherWidgetForm.elements.enabled.checked = true;
	elements.weatherWidgetMessage.textContent = "";
}

function openWeatherWidgetForm(widget = null) {
	elements.weatherWidgetForm.hidden = false;
	elements.weatherWidgetForm.elements.id.value = widget?.id || "";
	elements.weatherWidgetForm.elements.label1.value = widget?.label1 || "";
	elements.weatherWidgetForm.elements.label2.value = widget?.label2 || "";
	elements.weatherWidgetForm.elements.forecastUrl.value =
		widget?.forecastUrl || "";
	elements.weatherWidgetForm.elements.enabled.checked = widget?.enabled !== false;
	elements.weatherWidgetMessage.textContent = "";
	elements.weatherWidgetForm.elements.label1.focus();
}

async function persistWeatherWidgets(nextWidgets) {
	const previous = window.TimekeeperWeather.normalizeWidgets(
		userSettings.weatherWidgets,
	);
	const normalized = window.TimekeeperWeather.normalizeWidgets(nextWidgets, false);
	userSettings.weatherWidgets = normalized;
	renderWeatherWidgetList();
	renderWeatherWidgets();
	if (!(await saveSettings({ weatherWidgets: normalized }))) {
		userSettings.weatherWidgets = previous;
		renderWeatherWidgetList();
		renderWeatherWidgets();
		return false;
	}
	return true;
}

function renderWeatherWidgetList() {
	if (!elements.weatherWidgetList) return;
	const widgets = window.TimekeeperWeather.normalizeWidgets(
		userSettings.weatherWidgets,
	);
	userSettings.weatherWidgets = widgets;
	elements.weatherWidgetList.replaceChildren();
	elements.weatherWidgetCount.textContent = `${widgets.length} / ${window.TimekeeperWeather.MAX_WIDGETS}`;
	elements.addWeatherWidget.disabled =
		widgets.length >= window.TimekeeperWeather.MAX_WIDGETS;
	widgets.forEach((widget, index) => {
		const row = document.createElement("div");
		row.className = "weather-widget-row";
		row.classList.toggle("is-disabled", !widget.enabled);
		row.dataset.weatherSettingId = widget.id;

		const copy = document.createElement("div");
		copy.className = "weather-widget-copy";
		const title = document.createElement("strong");
		title.textContent = widget.label1;
		const region = document.createElement("span");
		region.textContent = `${widget.label2} · ${widget.enabled ? "Visível" : "Oculto"}`;
		copy.append(title, region);

		const actions = document.createElement("div");
		actions.className = "weather-widget-actions";
		const visibility = iconButton(
			widget.enabled ? "visibility" : "visibility_off",
			`${widget.enabled ? "Ocultar" : "Exibir"} ${widget.label1}`,
			() => {
				const next = widgets.map((item) =>
					item.id === widget.id ? { ...item, enabled: !item.enabled } : item,
				);
				persistWeatherWidgets(next);
			},
		);
		const edit = iconButton("edit", `Editar ${widget.label1}`, () =>
			openWeatherWidgetForm(widget),
		);
		actions.append(visibility, edit);
		for (const [direction, icon, label] of [
			[-1, "arrow_upward", "Mover para cima"],
			[1, "arrow_downward", "Mover para baixo"],
		]) {
			const move = iconButton(icon, `${label}: ${widget.label1}`, () => {
				const target = index + direction;
				if (target < 0 || target >= widgets.length) return;
				const next = [...widgets];
				[next[index], next[target]] = [next[target], next[index]];
				persistWeatherWidgets(next);
			});
			move.disabled = index + direction < 0 || index + direction >= widgets.length;
			actions.append(move);
		}
		const remove = iconButton("delete", `Remover ${widget.label1}`, async () => {
			if (
				!(await confirmAction({
					title: "Remover previsão?",
					message: `O widget de ${widget.label1} será removido da dashboard.`,
					confirmLabel: "Remover previsão",
				}))
			)
				return;
			persistWeatherWidgets(widgets.filter((item) => item.id !== widget.id));
		});
		remove.classList.add("delete-counter");
		actions.append(remove);
		row.append(copy, actions);
		elements.weatherWidgetList.append(row);
	});
}

const TIMELINE_SOURCE_FILTERS = {
	all: [],
	workday: ["workday"],
	calendar: ["payment", "holiday"],
	counters: ["fixed", "recurring"],
};
const TIMELINE_SOURCE_LABELS = {
	workday: "Expediente",
	payment: "Pagamento",
	holiday: "Feriado",
	fixed: "Contador fixo",
	recurring: "Contador recorrente",
};

function timelineTimeLabel(occurrence) {
	const formatter = new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
	const start = formatter.format(new Date(occurrence.startAtMs));
	if (occurrence.endAtMs == null) return start;
	return `${start}–${formatter.format(new Date(occurrence.endAtMs))}`;
}

function updateTimelineTemporalStates() {
	if (!elements.timelineList) return;
	if (timelineView === "calendar") {
		const todayKey = calendarDateKey(new Date());
		if (renderedCalendarTodayKey !== todayKey) renderTimeline();
		return;
	}
	const now = Date.now();
	const items = Array.from(
		elements.timelineList.querySelectorAll("[data-timeline-occurrence]"),
	);
	let nextAtMs = Number.POSITIVE_INFINITY;
	for (const item of items) {
		const startAtMs = Number(item.dataset.startAt);
		const endAtMs = Number(item.dataset.endAt) || startAtMs;
		item.classList.toggle("is-active", startAtMs <= now && now < endAtMs);
		item.classList.remove("is-next");
		if (startAtMs > now) nextAtMs = Math.min(nextAtMs, startAtMs);
	}
	items.forEach((item) => {
		item.classList.toggle("is-next", Number(item.dataset.startAt) === nextAtMs);
	});
}

function buildUpcomingOccurrences(from = new Date(), horizonDays = 90) {
	const endTime = `${String(userSettings.endHour).padStart(2, "0")}:${String(
		userSettings.endMinutes,
	).padStart(2, "0")}`;
	const workday = {
		...(window.expedientePadrao || {
			startTime: "08:00",
			daysOfWeek: [1, 2, 3, 4, 5],
		}),
		endTime,
	};
	const to = new Date(from);
	to.setDate(to.getDate() + horizonDays);
	return window.TimekeeperOccurrences.buildOccurrences(
		{
			workday,
			payments: window.pagamentos || [],
			holidays: window.feriados || [],
			counters: userSettings.customCounters || [],
		},
		{
			from,
			to,
		},
	);
}

const TIMELINE_SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function timelineSvgElement(tagName, attributes = {}, text = "") {
	const element = document.createElementNS(TIMELINE_SVG_NAMESPACE, tagName);
	for (const [name, value] of Object.entries(attributes)) {
		if (value != null) element.setAttribute(name, String(value));
	}
	if (text) element.textContent = text;
	return element;
}

function timelineOccurrenceBoundary(occurrence) {
	return Math.max(occurrence.startAtMs, occurrence.endAtMs ?? occurrence.startAtMs);
}

function timelineScale(value, fromAtMs, toAtMs, start, end) {
	if (toAtMs <= fromAtMs) return start;
	const ratio = Math.max(0, Math.min(1, (value - fromAtMs) / (toAtMs - fromAtMs)));
	return start + ratio * (end - start);
}

function timelineTickLabel(value, fromAtMs, toAtMs, first) {
	if (first) return "agora";
	const duration = toAtMs - fromAtMs;
	return new Intl.DateTimeFormat("pt-BR", {
		...(duration <= 36 * 60 * 60 * 1000
			? { hour: "2-digit", minute: "2-digit" }
			: { day: "2-digit", month: "short" }),
	}).format(new Date(value));
}

function timelineTicks(fromAtMs, toAtMs) {
	return Array.from({ length: 5 }, (_, index) => {
		const value = fromAtMs + ((toAtMs - fromAtMs) * index) / 4;
		return {
			value,
			label: timelineTickLabel(value, fromAtMs, toAtMs, index === 0),
		};
	});
}

function timelineLaneKey(occurrence) {
	if (["workday", "payment", "holiday"].includes(occurrence.sourceType)) {
		return occurrence.sourceType;
	}
	return `counter:${occurrence.sourceId}`;
}

function timelineLaneMeta(occurrence) {
	if (occurrence.sourceType === "workday") return "Recorrente";
	if (occurrence.sourceType === "payment") return "Próximo pagamento";
	if (occurrence.sourceType === "holiday") return "Próximo feriado";
	return TIMELINE_SOURCE_LABELS[occurrence.sourceType];
}

function timelineLanes(occurrences) {
	const laneMap = new Map();
	for (const occurrence of occurrences) {
		const key = timelineLaneKey(occurrence);
		let lane = laneMap.get(key);
		if (!lane) {
			lane = {
				key,
				label: occurrence.title,
				meta: timelineLaneMeta(occurrence),
				sourceId: occurrence.sourceId,
				sourceType: occurrence.sourceType,
				editable: occurrence.editable,
				color: occurrence.color,
				occurrences: [],
			};
			laneMap.set(key, lane);
		}
		lane.occurrences.push(occurrence);
	}
	const sourceRank = { workday: 0, payment: 1, holiday: 2, fixed: 3, recurring: 3 };
	return [...laneMap.values()].sort(
		(first, second) =>
			(sourceRank[first.sourceType] ?? 4) - (sourceRank[second.sourceType] ?? 4) ||
			first.occurrences[0].startAtMs - second.occurrences[0].startAtMs,
	);
}

function timelineLaneColor(lane) {
	if (isHexColor(lane.color)) return lane.color;
	if (lane.sourceType === "holiday") return "var(--accent-secondary)";
	return "var(--accent)";
}

function makeTimelineLaneInteractive(group, lane) {
	if (!lane.editable || !canEditActiveWorkspace()) return;
	const openEditor = () => {
		const counter = userSettings.customCounters.find(
			(candidate) => candidate.id === lane.sourceId,
		);
		if (counter) openCounterDialog(counter);
	};
	group.classList.add("is-editable");
	group.setAttribute("role", "button");
	group.setAttribute("tabindex", "0");
	group.setAttribute("aria-label", `Editar ${lane.label}`);
	group.addEventListener("click", openEditor);
	group.addEventListener("keydown", (event) => {
		if (!["Enter", " "].includes(event.key)) return;
		event.preventDefault();
		openEditor();
	});
}

function timelineOccurrenceGroup(occurrence, conflicts) {
	const group = timelineSvgElement("g", {
		class: `timeline-svg-occurrence timeline-source-${occurrence.sourceType}`,
		"data-timeline-occurrence": occurrence.id,
		"data-source-type": occurrence.sourceType,
		"data-start-at": occurrence.startAtMs,
		"data-end-at": occurrence.endAtMs ?? "",
	});
	if (occurrence.isAnchor) group.classList.add("is-anchor");
	if ((conflicts.get(occurrence.startAtMs) || 0) > 1) {
		group.classList.add("has-conflict");
	}
	group.append(
		timelineSvgElement(
			"title",
			{},
			`${occurrence.title} · ${timelineTimeLabel(occurrence)}`,
		),
	);
	return group;
}

function appendTimelineMarker(group, x, y, occurrence, anchor = false) {
	const className = `timeline-svg-marker${anchor ? " is-anchor-marker" : ""}`;
	if (occurrence.sourceType === "payment") {
		group.append(
			timelineSvgElement("path", {
				class: className,
				d: `M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z`,
			}),
		);
		return;
	}
	group.append(
		timelineSvgElement("circle", {
			class: className,
			cx: x,
			cy: y,
			r: anchor ? 6 : 4,
		}),
	);
}

function appendTimelineOccurrence(
	parent,
	occurrence,
	coordinates,
	conflicts,
) {
	const group = timelineOccurrenceGroup(occurrence, conflicts);
	const { x1, y1, x2, y2 } = coordinates;
	if (occurrence.endAtMs != null) {
		group.append(
			timelineSvgElement("line", {
				class: "timeline-svg-segment",
				x1,
				y1,
				x2,
				y2,
			}),
		);
		if (occurrence.isAnchor) {
			appendTimelineMarker(group, x2, y2, occurrence, true);
		}
	} else {
		appendTimelineMarker(group, x1, y1, occurrence, occurrence.isAnchor);
	}
	parent.append(group);
	return group;
}

function timelineAnchorLabel(occurrence) {
	return new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(timelineOccurrenceBoundary(occurrence)));
}

function renderHorizontalTimeline(lanes, projection, conflicts) {
	const width = 1200;
	const left = 190;
	const right = 42;
	const top = 84;
	const laneHeight = 70;
	const height = Math.max(250, top + lanes.length * laneHeight + 38);
	const axisEnd = width - right;
	const lanesEnd = top + Math.max(0, lanes.length - 1) * laneHeight;
	const svg = timelineSvgElement("svg", {
		id: "timeline-svg",
		class: "timeline-svg",
		viewBox: `0 0 ${width} ${height}`,
		role: "group",
		"data-orientation": "horizontal",
		"aria-label": `Timeline horizontal com ${lanes.length} trilhas`,
	});
	const grid = timelineSvgElement("g", { class: "timeline-svg-grid" });
	for (const tick of timelineTicks(projection.fromAtMs, projection.toAtMs)) {
		const x = timelineScale(
			tick.value,
			projection.fromAtMs,
			projection.toAtMs,
			left,
			axisEnd,
		);
		grid.append(
			timelineSvgElement("line", {
				x1: x,
				y1: 42,
				x2: x,
				y2: lanesEnd + 24,
			}),
			timelineSvgElement(
				"text",
				{ x, y: 25, "text-anchor": x === left ? "start" : x === axisEnd ? "end" : "middle" },
				tick.label,
			),
		);
	}
	svg.append(grid);
	lanes.forEach((lane, laneIndex) => {
		const y = top + laneIndex * laneHeight;
		const laneGroup = timelineSvgElement("g", {
			class: `timeline-svg-lane timeline-source-${lane.sourceType}`,
			"data-timeline-lane": lane.key,
		});
		laneGroup.style.setProperty("--timeline-color", timelineLaneColor(lane));
		makeTimelineLaneInteractive(laneGroup, lane);
		if (lane.editable) {
			laneGroup.append(
				timelineSvgElement("rect", {
					class: "timeline-svg-hit-area",
					x: 0,
					y: y - 27,
					width,
					height: 54,
				}),
			);
		}
		laneGroup.append(
			timelineSvgElement("text", { class: "timeline-svg-lane-title", x: 12, y: y - 3 }, lane.label),
			timelineSvgElement("text", { class: "timeline-svg-lane-meta", x: 12, y: y + 16 }, lane.meta),
			timelineSvgElement("line", {
				class: "timeline-svg-rail",
				x1: left,
				y1: y,
				x2: axisEnd,
				y2: y,
			}),
		);
		for (const occurrence of lane.occurrences) {
			const startX = timelineScale(
				Math.max(occurrence.startAtMs, projection.fromAtMs),
				projection.fromAtMs,
				projection.toAtMs,
				left,
				axisEnd,
			);
			let endX = timelineScale(
				Math.min(timelineOccurrenceBoundary(occurrence), projection.toAtMs),
				projection.fromAtMs,
				projection.toAtMs,
				left,
				axisEnd,
			);
			if (occurrence.endAtMs != null) endX = Math.min(axisEnd, Math.max(startX + 4, endX));
			appendTimelineOccurrence(
				laneGroup,
				occurrence,
				{ x1: startX, y1: y, x2: endX, y2: y },
				conflicts,
			);
			if (occurrence.isAnchor) {
				const anchorX = occurrence.endAtMs != null ? endX : startX;
				laneGroup.append(
					timelineSvgElement(
						"text",
						{
							class: "timeline-svg-anchor-label",
							x: anchorX,
							y: y - 15,
							"text-anchor": anchorX > axisEnd - 95 ? "end" : anchorX < left + 95 ? "start" : "middle",
						},
						timelineAnchorLabel(occurrence),
					),
				);
			}
		}
		svg.append(laneGroup);
	});
	return svg;
}

function resolveVerticalAnchorLabels(anchorItems, top, bottom) {
	const minimumGap = 52;
	const resolved = [];
	for (const item of [...anchorItems].sort((first, second) => first.y - second.y)) {
		resolved.push({
			...item,
			labelY: Math.max(
				item.y,
				resolved.length
					? resolved[resolved.length - 1].labelY + minimumGap
					: top,
			),
		});
	}
	const overflow = resolved.length
		? Math.max(0, resolved[resolved.length - 1].labelY - bottom)
		: 0;
	if (overflow) resolved.forEach((item) => (item.labelY -= overflow));
	return resolved;
}

function renderVerticalTimeline(lanes, projection, conflicts) {
	const width = 360;
	const top = 76;
	const occurrenceCount = lanes.reduce(
		(total, lane) => total + lane.occurrences.length,
		0,
	);
	const height = Math.min(1500, Math.max(600, 360 + occurrenceCount * 18));
	const bottom = height - 42;
	const axisX = 74;
	const svg = timelineSvgElement("svg", {
		id: "timeline-svg",
		class: "timeline-svg",
		viewBox: `0 0 ${width} ${height}`,
		role: "group",
		"data-orientation": "vertical",
		"aria-label": `Timeline vertical com ${lanes.length} trilhas`,
	});
	const grid = timelineSvgElement("g", { class: "timeline-svg-grid" });
	grid.append(
		timelineSvgElement("line", {
			class: "timeline-svg-main-axis",
			x1: axisX,
			y1: top,
			x2: axisX,
			y2: bottom,
		}),
	);
	for (const tick of timelineTicks(projection.fromAtMs, projection.toAtMs)) {
		const y = timelineScale(
			tick.value,
			projection.fromAtMs,
			projection.toAtMs,
			top,
			bottom,
		);
		grid.append(
			timelineSvgElement("line", { x1: axisX - 7, y1: y, x2: width - 10, y2: y }),
			timelineSvgElement("text", { x: 8, y: y + 4 }, tick.label),
		);
	}
	svg.append(grid);
	const anchorItems = [];
	lanes.forEach((lane, laneIndex) => {
		const x = axisX + ((laneIndex % 7) - 3) * 4;
		const laneGroup = timelineSvgElement("g", {
			class: `timeline-svg-lane timeline-source-${lane.sourceType}`,
			"data-timeline-lane": lane.key,
		});
		laneGroup.style.setProperty("--timeline-color", timelineLaneColor(lane));
		for (const occurrence of lane.occurrences) {
			const startY = timelineScale(
				Math.max(occurrence.startAtMs, projection.fromAtMs),
				projection.fromAtMs,
				projection.toAtMs,
				top,
				bottom,
			);
			let endY = timelineScale(
				Math.min(timelineOccurrenceBoundary(occurrence), projection.toAtMs),
				projection.fromAtMs,
				projection.toAtMs,
				top,
				bottom,
			);
			if (occurrence.endAtMs != null) endY = Math.min(bottom, Math.max(startY + 5, endY));
			appendTimelineOccurrence(
				laneGroup,
				occurrence,
				{ x1: x, y1: startY, x2: x, y2: endY },
				conflicts,
			);
			if (occurrence.isAnchor) {
				anchorItems.push({
					x,
					y: occurrence.endAtMs != null ? endY : startY,
					occurrence,
					lane,
				});
			}
		}
		svg.append(laneGroup);
	});
	for (const item of resolveVerticalAnchorLabels(anchorItems, top + 18, bottom - 18)) {
		const connector = timelineSvgElement("g", { class: "timeline-svg-callout" });
		connector.style.setProperty("--timeline-color", timelineLaneColor(item.lane));
		connector.append(
			timelineSvgElement("path", {
				d: `M ${item.x + 7} ${item.y} L 100 ${item.y} L 108 ${item.labelY}`,
			}),
			timelineSvgElement("text", { class: "timeline-svg-callout-title", x: 116, y: item.labelY - 3 }, item.occurrence.title),
			timelineSvgElement("text", { class: "timeline-svg-callout-meta", x: 116, y: item.labelY + 15 }, timelineAnchorLabel(item.occurrence)),
		);
		svg.append(connector);
	}
	return svg;
}

function renderTimelineLegend(lanes) {
	elements.timelineLegend.replaceChildren();
	for (const lane of lanes) {
		const isEditable = lane.editable && canEditActiveWorkspace();
		const item = document.createElement(isEditable ? "button" : "span");
		if (isEditable) item.type = "button";
		item.className = "timeline-legend-item";
		item.style.setProperty("--timeline-color", timelineLaneColor(lane));
		const marker = document.createElement("i");
		marker.setAttribute("aria-hidden", "true");
		const label = document.createElement("span");
		label.textContent = lane.label;
		item.append(marker, label);
		if (isEditable) {
			item.setAttribute("aria-label", `Editar ${lane.label}`);
			item.addEventListener("click", () => {
				const counter = userSettings.customCounters.find(
					(candidate) => candidate.id === lane.sourceId,
				);
				if (counter) openCounterDialog(counter);
			});
		}
		elements.timelineLegend.append(item);
	}
}

function timelineProjection(from) {
	const endTime = `${String(userSettings.endHour).padStart(2, "0")}:${String(
		userSettings.endMinutes,
	).padStart(2, "0")}`;
	return window.TimekeeperOccurrences.buildTimelineProjection(
		{
			workday: {
				...(window.expedientePadrao || {
					startTime: "08:00",
					daysOfWeek: [1, 2, 3, 4, 5],
				}),
				endTime,
			},
			payments: window.pagamentos || [],
			holidays: window.feriados || [],
			counters: userSettings.customCounters || [],
		},
		{ from },
	);
}

function timelineRangeText(projection) {
	const durationMs = projection.toAtMs - projection.fromAtMs;
	const totalHours = Math.max(1, Math.ceil(durationMs / (60 * 60 * 1000)));
	const span = totalHours >= 48
		? `${Math.ceil(totalHours / 24)} dias`
		: `${totalHours} ${totalHours === 1 ? "hora" : "horas"}`;
	const end = new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "long",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(projection.toAtMs));
	return `Agora → ${end} · ${span} · escala automática`;
}

function calendarDateKey(value) {
	const date = value instanceof Date ? value : new Date(value);
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

function calendarProjection(from) {
	const endTime = `${String(userSettings.endHour).padStart(2, "0")}:${String(
		userSettings.endMinutes,
	).padStart(2, "0")}`;
	return window.TimekeeperOccurrences.buildCalendarProjection(
		{
			workday: {
				...(window.expedientePadrao || {
					startTime: "08:00",
					daysOfWeek: [1, 2, 3, 4, 5],
				}),
				endTime,
			},
			payments: window.pagamentos || [],
			holidays: window.feriados || [],
			counters: userSettings.customCounters || [],
		},
		{
			month: from,
			actualTime: from,
			weekOnly: timelineOrientationQuery.matches,
		},
	);
}

function calendarRangeText(projection) {
	if (projection.weekOnly) {
		const formatter = new Intl.DateTimeFormat("pt-BR", {
			day: "numeric",
			month: "long",
			year: "numeric",
		});
		return `Semana de ${formatter.format(new Date(projection.fromAtMs))} a ${formatter.format(new Date(projection.toAtMs))} · fuso local`;
	}
	const label = new Intl.DateTimeFormat("pt-BR", {
		month: "long",
		year: "numeric",
	}).format(new Date(projection.monthAtMs));
	return `${label} · grade mensal · fuso local`;
}

function calendarDayLabel(day, count) {
	const date = new Intl.DateTimeFormat("pt-BR", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	}).format(new Date(day.dateAtMs));
	return `${date}, ${count} ${count === 1 ? "evento" : "eventos"}`;
}

function calendarOccurrenceColor(occurrence) {
	return timelineLaneColor({
		color: occurrence.color,
		sourceType: occurrence.sourceType,
	});
}

function renderCalendarDayDetails(day, occurrences) {
	const details = document.createElement("section");
	details.id = "timeline-calendar-details";
	details.className = "timeline-calendar-details";
	details.setAttribute("aria-live", "polite");
	const kicker = document.createElement("p");
	kicker.className = "section-kicker";
	kicker.textContent = "Eventos do dia";
	const heading = document.createElement("h3");
	heading.textContent = new Intl.DateTimeFormat("pt-BR", {
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(new Date(day.dateAtMs));
	details.append(kicker, heading);
	if (!occurrences.length) {
		const empty = document.createElement("p");
		empty.className = "timeline-calendar-detail-empty";
		empty.textContent = "Nenhum evento neste dia para o filtro selecionado.";
		details.append(empty);
		return details;
	}
	const list = document.createElement("div");
	list.className = "timeline-calendar-detail-list";
	for (const occurrence of occurrences) {
		const isEditable = occurrence.editable && canEditActiveWorkspace();
		const item = document.createElement(isEditable ? "button" : "div");
		if (isEditable) item.type = "button";
		item.className = "timeline-calendar-detail-item";
		item.style.setProperty("--timeline-color", calendarOccurrenceColor(occurrence));
		const marker = document.createElement("i");
		marker.setAttribute("aria-hidden", "true");
		const copy = document.createElement("span");
		const title = document.createElement("strong");
		title.textContent = occurrence.title;
		const meta = document.createElement("span");
		meta.textContent = `${TIMELINE_SOURCE_LABELS[occurrence.sourceType]} · ${timelineTimeLabel(occurrence)}`;
		copy.append(title, meta);
		item.append(marker, copy);
		if (isEditable) {
			item.setAttribute("aria-label", `Editar ${occurrence.title}`);
			item.addEventListener("click", () => {
				const counter = userSettings.customCounters.find(
					(candidate) => candidate.id === occurrence.sourceId,
				);
				if (counter) openCounterDialog(counter);
			});
		}
		list.append(item);
	}
	details.append(list);
	return details;
}

function renderCalendarTimeline(projection, sourceTypes) {
	const days = projection.days.map((day) => ({
		...day,
		occurrences: day.occurrences.filter(
			(occurrence) =>
				sourceTypes.size === 0 || sourceTypes.has(occurrence.sourceType),
		),
	}));
	if (!days.some((day) => day.key === selectedCalendarDayKey)) {
		selectedCalendarDayKey =
			days.find((day) => day.isToday)?.key ||
			days.find((day) => day.inMonth)?.key ||
			days[0]?.key ||
			null;
	}
	const calendar = document.createElement("section");
	calendar.className = "timeline-calendar";
	calendar.dataset.calendarMode = projection.weekOnly ? "week" : "month";
	calendar.setAttribute(
		"aria-label",
		projection.weekOnly ? "Calendário da semana atual" : "Calendário do mês atual",
	);
	const weekdays = document.createElement("div");
	weekdays.className = "timeline-calendar-weekdays";
	for (const label of ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]) {
		const weekday = document.createElement("span");
		weekday.textContent = label;
		weekdays.append(weekday);
	}
	const grid = document.createElement("div");
	grid.className = "timeline-calendar-grid";
	for (const day of days) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "timeline-calendar-day";
		button.dataset.date = day.key;
		button.classList.toggle("is-outside-month", !day.inMonth);
		button.classList.toggle("is-today", day.isToday);
		button.classList.toggle("has-events", day.occurrences.length > 0);
		button.setAttribute(
			"aria-pressed",
			String(day.key === selectedCalendarDayKey),
		);
		button.setAttribute("aria-label", calendarDayLabel(day, day.occurrences.length));
		button.setAttribute("aria-controls", "timeline-calendar-details");
		if (day.isToday) button.setAttribute("aria-current", "date");
		const date = document.createElement("time");
		date.dateTime = day.key;
		date.textContent = String(new Date(day.dateAtMs).getDate());
		button.append(date);
		const tags = document.createElement("span");
		tags.className = "timeline-calendar-tags";
		for (const occurrence of day.occurrences.slice(0, 3)) {
			const tag = document.createElement("span");
			tag.className = `timeline-calendar-tag timeline-source-${occurrence.sourceType}`;
			tag.style.setProperty("--timeline-color", calendarOccurrenceColor(occurrence));
			tag.title = occurrence.title;
			tag.textContent = occurrence.title;
			tags.append(tag);
		}
		if (day.occurrences.length > 3) {
			const more = document.createElement("span");
			more.className = "timeline-calendar-more";
			more.textContent = `+${day.occurrences.length - 3}`;
			tags.append(more);
		}
		button.append(tags);
		button.addEventListener("click", () => {
			selectedCalendarDayKey = day.key;
			renderCalendarTimeline(projection, sourceTypes);
			elements.timelineList
				.querySelector(`[data-date="${day.key}"]`)
				?.focus();
		});
		grid.append(button);
	}
	calendar.append(weekdays, grid);
	const selectedDay =
		days.find((day) => day.key === selectedCalendarDayKey) || days[0];
	elements.timelineList.replaceChildren(
		calendar,
		...(selectedDay
			? [renderCalendarDayDetails(selectedDay, selectedDay.occurrences)]
			: []),
	);
}

function renderTimeline() {
	if (!elements.timelineList) return;
	for (const option of elements.timelineViewOptions) {
		option.setAttribute(
			"aria-pressed",
			String(option.dataset.timelineView === timelineView),
		);
	}
	const sourceTypes = new Set(
		TIMELINE_SOURCE_FILTERS[elements.timelineSourceFilter.value] || [],
	);
	if (timelineView === "calendar") {
		const projection = calendarProjection(new Date());
		const filtered = projection.occurrences.filter(
			(occurrence) =>
				sourceTypes.size === 0 || sourceTypes.has(occurrence.sourceType),
		);
		renderedCalendarTodayKey = calendarDateKey(new Date());
		elements.timelineList.dataset.view = "calendar";
		elements.timelineList.setAttribute(
			"aria-label",
			projection.weekOnly
				? "Visualização semanal do calendário"
				: "Visualização mensal do calendário",
		);
		elements.timelineRange.hidden = false;
		elements.timelineRange.textContent = calendarRangeText(projection);
		elements.timelineEmpty.hidden = filtered.length !== 0;
		renderTimelineLegend(timelineLanes(filtered));
		renderCalendarTimeline(projection, sourceTypes);
		scheduleNotificationScan();
		return;
	}
	renderedCalendarTodayKey = null;
	elements.timelineList.dataset.view = "linear";
	elements.timelineList.setAttribute("aria-label", "Visualização cronológica");
	const projection = timelineProjection(new Date());
	const filtered = projection.occurrences.filter(
		(occurrence) => sourceTypes.size === 0 || sourceTypes.has(occurrence.sourceType),
	);
	const lanes = timelineLanes(filtered);
	const conflicts = new Map();
	for (const occurrence of filtered) {
		conflicts.set(
			occurrence.startAtMs,
			(conflicts.get(occurrence.startAtMs) || 0) + 1,
		);
	}
	elements.timelineList.replaceChildren();
	elements.timelineRange.hidden = projection.anchors.length === 0;
	elements.timelineRange.textContent = projection.anchors.length
		? timelineRangeText(projection)
		: "Aguardando um próximo evento.";
	elements.timelineEmpty.hidden = lanes.length !== 0;
	renderTimelineLegend(lanes);
	if (lanes.length) {
		const svg = timelineOrientationQuery.matches
			? renderVerticalTimeline(lanes, projection, conflicts)
			: renderHorizontalTimeline(lanes, projection, conflicts);
		elements.timelineList.append(svg);
	}
	updateTimelineTemporalStates();
	scheduleNotificationScan();
}

function notificationSupportState() {
	if (
		typeof window.Notification !== "function" ||
		!("serviceWorker" in navigator)
	) {
		return "unsupported";
	}
	return Notification.permission;
}

function notificationStorageKey(userId) {
	return `timekeeper:notification-deliveries:${userId}`;
}

function readNotificationDeliveries(userId) {
	try {
		const parsed = JSON.parse(
			localStorage.getItem(notificationStorageKey(userId)) || "{}",
		);
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function writeNotificationDeliveries(userId, deliveries) {
	const now = Date.now();
	const active = Object.fromEntries(
		Object.entries(deliveries)
			.filter(([, value]) => Number(value?.expiresAtMs) > now)
			.sort(
				([, first], [, second]) =>
					Number(second.expiresAtMs) - Number(first.expiresAtMs),
			)
			.slice(0, 500),
	);
	try {
		localStorage.setItem(notificationStorageKey(userId), JSON.stringify(active));
		return true;
	} catch {
		return false;
	}
}

async function claimNotificationDelivery(candidate) {
	if (!currentUser) return false;
	const userId = currentUser.uid;
	const token = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
	const claim = () => {
		const deliveries = readNotificationDeliveries(userId);
		if (Number(deliveries[candidate.id]?.expiresAtMs) > Date.now()) return false;
		deliveries[candidate.id] = {
			token,
			expiresAtMs: candidate.eventAtMs + 2 * 86400000,
		};
		return writeNotificationDeliveries(userId, deliveries);
	};
	if (navigator.locks?.request) {
		return navigator.locks.request(
			`timekeeper-notifications:${userId}`,
			{ mode: "exclusive" },
			claim,
		);
	}
	if (!claim()) return false;
	await new Promise((resolve) => window.setTimeout(resolve, 40));
	return readNotificationDeliveries(userId)[candidate.id]?.token === token;
}

function releaseNotificationDelivery(candidateId, userId = currentUser?.uid) {
	if (!userId) return;
	const deliveries = readNotificationDeliveries(userId);
	delete deliveries[candidateId];
	writeNotificationDeliveries(userId, deliveries);
}

function clearNotificationDeliveryState(userId) {
	if (!userId) return;
	try {
		localStorage.removeItem(notificationStorageKey(userId));
	} catch {
		// O armazenamento local pode estar indisponível em modo privado restrito.
	}
}

function currentPushDeviceId() {
	if (pushDeviceId) return pushDeviceId;
	try {
		pushDeviceId = localStorage.getItem("timekeeper:push-device-id");
		if (!pushDeviceId) {
			pushDeviceId = crypto.randomUUID();
			localStorage.setItem("timekeeper:push-device-id", pushDeviceId);
		}
	} catch {
		pushDeviceId = crypto.randomUUID();
	}
	return pushDeviceId;
}

function pushCallable(name) {
	const functions = ensurePushBackend();
	return functions ? httpsCallable(functions, name) : null;
}

async function uploadPushFid(fid) {
	const user = currentUser;
	const registerDevice = pushCallable("registerPushDevice");
	if (!user || !registerDevice || !fid) return false;
	try {
		await registerDevice({
			deviceId: currentPushDeviceId(),
			fid,
			timeZone:
				Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo",
			platform:
				navigator.userAgentData?.platform || navigator.platform || "Web",
		});
		if (currentUser?.uid === user.uid) {
			pushRegistrationState = "active";
			syncNotificationUi();
		}
		return true;
	} catch (error) {
		console.error("Falha ao registrar dispositivo para push.", error);
		if (currentUser?.uid === user.uid) {
			pushRegistrationState = "error";
			elements.notificationMessage.textContent =
				"Os alertas locais continuam ativos, mas o push não pôde ser configurado.";
			syncNotificationUi();
		}
		return false;
	}
}

async function showPushNotification(payload) {
	if (Notification.permission !== "granted") return;
	const data = payload?.data || {};
	const registration = await navigator.serviceWorker.ready;
	await registration.showNotification(data.title || "Timekeeper", {
		body: data.body || "Um evento da sua Timeline está próximo.",
		icon: "/src/assets/icon-192.png",
		badge: "/src/assets/icon-192.png",
		tag: data.tag || "timekeeper-push",
		renotify: false,
		data: {
			url: data.url || "/#dashboard-timeline-section",
			sourceId: data.sourceId || "",
		},
	});
}

async function ensurePushListeners() {
	if (pushListenersReady) return true;
	if (!pushConfigured || !(await messagingIsSupported())) return false;
	pushMessaging = getMessaging(app);
	onRegistered(pushMessaging, (fid) => {
		uploadPushFid(fid);
	});
	onUnregistered(pushMessaging, async () => {
		const revokeDevice = pushCallable("revokePushDevice");
		if (!currentUser || !revokeDevice) return;
		try {
			await revokeDevice({ deviceId: currentPushDeviceId() });
		} catch (error) {
			console.error("Falha ao confirmar revogação do dispositivo.", error);
		}
	});
	onMessage(pushMessaging, (payload) => {
		showPushNotification(payload).catch((error) => {
			console.error("Falha ao exibir push em primeiro plano.", error);
		});
	});
	pushListenersReady = true;
	return true;
}

async function registerPushForCurrentUser() {
	if (
		!pushConfigured ||
		!currentUser ||
		!userSettings.notificationsEnabled ||
		Notification.permission !== "granted"
	) {
		return false;
	}
	if (pushRegistrationState === "active") return true;
	if (pushRegistrationPromise) return pushRegistrationPromise;
	pushRegistrationState = "registering";
	syncNotificationUi();
	pushRegistrationPromise = (async () => {
		if (!(await ensurePushListeners())) {
			throw new Error("FCM não é suportado neste navegador.");
		}
		const registration = await navigator.serviceWorker.ready;
		await registerMessaging(pushMessaging, {
			vapidKey: pushConfig.vapidKey,
			serviceWorkerRegistration: registration,
		});
		return true;
	})()
		.catch((error) => {
			console.error("Falha ao iniciar o push.", error);
			pushRegistrationState = "error";
			elements.notificationMessage.textContent =
				"Os alertas locais continuam ativos, mas o push não está disponível.";
			syncNotificationUi();
			return false;
		})
		.finally(() => {
			pushRegistrationPromise = null;
		});
	return pushRegistrationPromise;
}

async function revokeCurrentPushDevice({ deleteAll = false } = {}) {
	if (!pushConfigured) return true;
	const user = currentUser;
	let serverRevoked = true;
	if (user) {
		const callable = pushCallable(deleteAll ? "deletePushData" : "revokePushDevice");
		if (callable) {
			try {
				await callable(
					deleteAll ? {} : { deviceId: currentPushDeviceId() },
				);
			} catch (error) {
				serverRevoked = false;
				console.error("Falha ao remover dados de push.", error);
			}
		}
	}
	try {
		if (pushMessaging) await unregisterMessaging(pushMessaging);
	} catch (error) {
		console.error("Falha ao remover a inscrição FCM local.", error);
	}
	pushRegistrationState = "idle";
	syncNotificationUi();
	return serverRevoked;
}

function syncNotificationUi() {
	if (!elements.notificationsEnabled) return;
	if (currentUser) {
		writeNotificationDeliveries(
			currentUser.uid,
			readNotificationDeliveries(currentUser.uid),
		);
	}
	const preferences = window.TimekeeperNotifications.normalizePreferences(
		userSettings,
	);
	const support = notificationSupportState();
	const active =
		preferences.notificationsEnabled && support === "granted" && Boolean(currentUser);
	elements.notificationsEnabled.checked =
		active || (preferences.notificationsEnabled && support === "denied");
	elements.notificationsEnabled.disabled =
		!currentUser ||
		support === "unsupported" ||
		(support === "denied" && !preferences.notificationsEnabled);
	elements.notificationControls.classList.toggle("is-disabled", !active);
	for (const input of document.querySelectorAll('[name="notificationLead"]')) {
		input.checked = preferences.notificationLeadMinutes.includes(
			Number(input.value),
		);
		input.disabled = !active;
	}
	for (const input of document.querySelectorAll('[name="notificationSource"]')) {
		input.checked = preferences.notificationSources[input.value] === true;
		input.disabled = !active;
	}
	elements.notificationQuietEnabled.checked =
		preferences.notificationQuietHours.enabled;
	elements.notificationQuietEnabled.disabled = !active;
	elements.notificationQuietStart.value =
		preferences.notificationQuietHours.startTime;
	elements.notificationQuietEnd.value = preferences.notificationQuietHours.endTime;
	const quietDisabled = !active || !preferences.notificationQuietHours.enabled;
	elements.notificationQuietTimes.classList.toggle("is-disabled", quietDisabled);
	elements.notificationQuietStart.disabled = quietDisabled;
	elements.notificationQuietEnd.disabled = quietDisabled;

	let state = "connecting";
	let label = "Não autorizado";
	let delivery = "Ative para escolher os alertas e autorizar este dispositivo.";
	if (support === "unsupported") {
		state = "error";
		label = "Não suportado";
		delivery = "Este navegador não oferece notificações locais via service worker.";
	} else if (support === "denied") {
		state = "error";
		label = "Bloqueado";
		delivery = "A permissão foi negada. Reative-a nas configurações do navegador.";
	} else if (active) {
		state = "live";
		if (pushRegistrationState === "active") {
			label = "Push ativo";
			delivery =
				"Entrega por push configurada neste dispositivo, inclusive com o app fechado.";
		} else if (pushRegistrationState === "registering") {
			label = "Configurando";
			delivery = "Registrando este dispositivo no Firebase Cloud Messaging...";
		} else {
			label = "Ativo";
			delivery = pushConfigured
				? "Entrega local ativa; o cadastro push será tentado novamente."
				: "Entrega limitada: mantenha a página ou o PWA em execução. Configure FCM e App Check para ativar push.";
		}
	} else if (support === "granted") {
		label = "Desativado";
		delivery = "Este dispositivo está autorizado, mas os alertas estão desativados.";
	}
	elements.notificationState.dataset.state = state;
	elements.notificationState.textContent = label;
	elements.notificationDeliveryState.textContent = delivery;
}

function notificationPreferencesFromControls() {
	const leadMinutes = Array.from(
		document.querySelectorAll('[name="notificationLead"]:checked'),
	).map((input) => Number(input.value));
	const notificationSources = Object.fromEntries(
		window.TimekeeperNotifications.SOURCE_KEYS.map((key) => [
			key,
			document.querySelector(
				`[name="notificationSource"][value="${key}"]`,
			)?.checked === true,
		]),
	);
	return window.TimekeeperNotifications.normalizePreferences({
		notificationsEnabled: true,
		notificationLeadMinutes: leadMinutes,
		notificationSources,
		notificationQuietHours: {
			enabled: elements.notificationQuietEnabled.checked,
			startTime: elements.notificationQuietStart.value,
			endTime: elements.notificationQuietEnd.value,
		},
	});
}

async function persistNotificationPreferences(nextPreferences) {
	const previous = window.TimekeeperNotifications.normalizePreferences(userSettings);
	const normalized = window.TimekeeperNotifications.normalizePreferences(
		nextPreferences,
	);
	Object.assign(userSettings, normalized);
	syncNotificationUi();
	scheduleNotificationScan();
	if (!(await saveSettings(normalized))) {
		Object.assign(userSettings, previous);
		syncNotificationUi();
		return false;
	}
	return true;
}

async function showLocalNotification(candidate) {
	const userId = currentUser?.uid;
	if (!userId || !(await claimNotificationDelivery(candidate))) return;
	try {
		const registration = await navigator.serviceWorker.ready;
		await registration.showNotification(`Timekeeper · ${candidate.title}`, {
			body: window.TimekeeperNotifications.candidateBody(candidate),
			icon: "/src/assets/icon-192.png",
			badge: "/src/assets/icon-192.png",
			tag: candidate.id,
			renotify: false,
			data: {
				url: "/#dashboard-timeline-section",
				sourceId: candidate.sourceId,
			},
		});
	} catch (error) {
		releaseNotificationDelivery(candidate.id, userId);
		console.error("Falha ao emitir notificação local.", error);
		elements.notificationMessage.textContent =
			"Não foi possível emitir um alerta neste dispositivo.";
	}
}

async function scanNotifications() {
	if (notificationScanInProgress || !currentUser) return;
	const preferences = window.TimekeeperNotifications.normalizePreferences(
		userSettings,
	);
	if (
		!preferences.notificationsEnabled ||
		notificationSupportState() !== "granted" ||
		pushRegistrationState === "active"
	) {
		return;
	}
	notificationScanInProgress = true;
	try {
		const now = Date.now();
		const occurrences = buildUpcomingOccurrences(new Date(now), 90);
		const candidates = window.TimekeeperNotifications.buildCandidates(
			occurrences,
			preferences,
		);
		const due = window.TimekeeperNotifications.dueCandidates(candidates, now);
		for (const candidate of due) {
			if (
				window.TimekeeperNotifications.isQuietTime(
					new Date(now),
					preferences.notificationQuietHours,
				)
			) {
				continue;
			}
			await showLocalNotification(candidate);
		}
	} finally {
		notificationScanInProgress = false;
	}
}

function scheduleNotificationScan(delay = 250) {
	window.clearTimeout(notificationScanTimer);
	notificationScanTimer = window.setTimeout(scanNotifications, delay);
}

function applySettings(data) {
	const currentCounters = userSettings.customCounters || [];
	const personalGroups = normalizeGroupSettings(data);
	personalSettingsData = {
		...DEFAULTS,
		...data,
		...personalGroups,
		activeWorkspace: normalizeWorkspacePreference(data.activeWorkspace),
	};
	const effectiveGroups =
		activeWorkspace.type === "team" ? workspaceGroupSettings : personalGroups;
	userSettings = {
		...personalSettingsData,
		...effectiveGroups,
		customCounters: currentCounters,
	};
	userSettings.weatherWidgets = window.TimekeeperWeather.normalizeWidgets(
		data.weatherWidgets,
	);
	Object.assign(
		userSettings,
		window.TimekeeperNotifications.normalizePreferences(data),
	);
	syncTimeControls(userSettings.endHour, userSettings.endMinutes);
	applyAccents(userSettings.accentPrimary, userSettings.accentSecondary);
	applyBackground(userSettings);
	Object.assign(userSettings, applyDashboardPreferences(userSettings));
	if (currentUser) cacheDashboardPreferences(userSettings);
	renderDashboardSectionControls(userSettings);
	renderCounterGroupControls();

	renderWeatherWidgetList();
	renderWeatherWidgets();
	syncNotificationUi();
	if (
		currentUser &&
		userSettings.notificationsEnabled &&
		notificationSupportState() === "granted"
	) {
		registerPushForCurrentUser();
	}
	renderTimeline();
	renderCustomCounters(currentCounters);
}

function applyWorkspaceGroupSettings(data = {}) {
	workspaceGroupSettings = normalizeGroupSettings(data);
	Object.assign(userSettings, workspaceGroupSettings);
	if (elements.counterDialog?.open) {
		renderGroupChips(elements.counterGroup?.value || "");
	}
	renderDashboardSectionControls(userSettings);
	renderCounterGroupControls();
	renderCustomCounters(userSettings.customCounters || []);
	renderTimeline();
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
	if (Array.isArray(counter.checklist)) {
		const items = counter.checklist
			.slice(0, 3)
			.map((item) => {
				if (!item || typeof item !== "object") return null;
				const text = String(item.text || "").trim().slice(0, 30);
				if (!text) return null;
				return {
					id: String(item.id || createCounterId()).slice(0, 100),
					text,
					done: Boolean(item.done),
				};
			})
			.filter(Boolean);
		if (items.length > 0) {
			normalized.checklist = items;
		}
	}
	if (typeof counter.group === "string" && counter.group.trim()) {
		normalized.group = counter.group.trim().slice(0, 30);
	}
	if (counter.hidden === true) {
		normalized.hidden = true;
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

function normalizeCounters(counters, maxCounters = getMaxCounters()) {
	return (Array.isArray(counters) ? counters : [])
		.slice(0, maxCounters)
		.map(normalizeCounter)
		.filter(Boolean);
}

function normalizeArchivedCounter(counter) {
	if (counter?.type !== "fixed" || typeof counter.archivedAt !== "string") {
		return null;
	}
	const archivedAt = counter.archivedAt.slice(0, 40);
	if (!archivedAt || Number.isNaN(new Date(archivedAt).getTime())) return null;
	const normalized = normalizeCounter(counter);
	return normalized?.type === "fixed"
		? { ...normalized, archivedAt }
		: null;
}

function normalizeArchive(counters) {
	return (Array.isArray(counters) ? counters : [])
		.slice(0, MAX_ARCHIVED_COUNTERS)
		.map(normalizeArchivedCounter)
		.filter(Boolean);
}

function applyCounterCollectionSnapshot(snapshot, legacyFallback = []) {
	if (snapshot.empty && legacyFallback.length > 0) {
		counterSlots = new Map();
		applyCounters(legacyFallback);
		return;
	}
	const records = snapshot.docs
		.map((counterDoc) => ({
			slot: counterDoc.id,
			order: Number(counterDoc.data().order),
			counter: normalizeCounter(counterDoc.data()),
		}))
		.filter((record) => record.counter)
		.sort((a, b) => {
			const orderA = Number.isInteger(a.order) ? a.order : Number(a.slot);
			const orderB = Number.isInteger(b.order) ? b.order : Number(b.slot);
			return orderA - orderB || Number(a.slot) - Number(b.slot);
		});
	counterSlots = new Map(
		records.map(({ slot, counter }) => [counter.id, slot]),
	);
	applyCounters(records.map(({ counter }) => counter));
}

function applyCounters(counters) {
	userSettings.customCounters = normalizeCounters(counters);
	renderCustomCounters(userSettings.customCounters);
	renderTimeline();
	updateDowngradeRestrictions();
}

function applyArchive(counters) {
	archivedCounters = normalizeArchive(counters);
	renderArchive(archivedCounters);
	renderCounterList(userSettings.customCounters);
	updateCustomCounters();
}

function unsubscribeUserData() {
	unsubscribeSettings?.();
	unsubscribeWorkspaceSettings?.();
	unsubscribeCounters?.();
	unsubscribeArchive?.();
	unsubscribeImages?.();
	unsubscribeProfile?.();
	unsubscribeTeams?.();
	unsubscribeSettings = null;
	unsubscribeWorkspaceSettings = null;
	unsubscribeCounters = null;
	unsubscribeArchive = null;
	unsubscribeImages = null;
	unsubscribeProfile = null;
	unsubscribeTeams = null;
	userTeams = [];
	pendingInvites = [];
	activeWorkspace = { type: "personal" };
	personalSettingsData = { ...DEFAULTS };
	workspaceGroupSettings = normalizeGroupSettings();
	preferredWorkspaceValue = "personal";
	teamsReady = false;
	workspaceSubscriptionVersion += 1;
	counterSlots = new Map();
	if (elements.workspaceSwitcher) elements.workspaceSwitcher.hidden = true;
	if (elements.pendingInvitesButton) elements.pendingInvitesButton.hidden = true;
	countersReady = false;
	archiveReady = false;
	userTier = "free";
	if (elements.openUpgradeDialog) elements.openUpgradeDialog.hidden = false;
	if (elements.sidebarUpgradeIcon) elements.sidebarUpgradeIcon.hidden = false;
	elements.openCounterModal.disabled = true;
	setAdminAccess(false);
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

async function migrateLegacyCounters(
	legacyReference,
	countersCollection,
	legacySnapshot = null,
	collectionSnapshot = null,
	maxCounters = getMaxCounters(),
) {
	const [legacy, current] = await Promise.all([
		legacySnapshot ? Promise.resolve(legacySnapshot) : getDoc(legacyReference),
		collectionSnapshot
			? Promise.resolve(collectionSnapshot)
			: getDocs(countersCollection),
	]);
	if (!legacy.exists()) return;

	const batch = writeBatch(db);
	if (current.empty) {
		const counters = normalizeCounters(legacy.data().items, maxCounters);
		counters.forEach((counter, order) => {
			batch.set(
				doc(countersCollection, String(order)),
				counterPayload(counter, order),
			);
		});
	}
	batch.delete(legacyReference);
	await batch.commit();
}

async function ensureUserData(user) {
	const profileReference = doc(db, "users", user.uid);
	const settingsDoc = settingsReference(user.uid);
	const countersDoc = legacyCountersReference(user.uid);
	const countersCollection = countersCollectionReference(user.uid);
	const archiveDoc = archiveReference(user.uid);
	const imagesDoc = imagesReference(user.uid);
	const [
		legacySnapshot,
		settingsSnapshot,
		countersSnapshot,
		counterItemsSnapshot,
		archiveSnapshot,
	] =
		await Promise.all([
			accountDataOperation(`ler users/${user.uid}`, () =>
				getDoc(profileReference),
			),
			accountDataOperation(`ler users/${user.uid}/data/settings`, () =>
				getDoc(settingsDoc),
			),
			accountDataOperation(`ler users/${user.uid}/data/counters`, () =>
				getDoc(countersDoc),
			),
			accountDataOperation(`listar users/${user.uid}/counters`, () =>
				getDocs(countersCollection),
			),
			accountDataOperation(`ler users/${user.uid}/data/archive`, () =>
				getDoc(archiveDoc),
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
	const migrationMaxCounters = legacy.tier === "premium" ? 15 : 5;
	if (!settingsSnapshot.exists()) {
		await accountDataOperation(
			`criar users/${user.uid}/data/settings`,
			() => {
				const dashboardPreferences = normalizeDashboardPreferences(legacy);
				const weatherWidgets = window.TimekeeperWeather.normalizeWidgets(
					legacy.weatherWidgets,
				);
				const notificationPreferences =
					window.TimekeeperNotifications.normalizePreferences(legacy);
				return setDoc(settingsDoc, {
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
				...dashboardPreferences,
				weatherWidgets,
				...notificationPreferences,
				counterGroups: Array.isArray(legacy.counterGroups) ? legacy.counterGroups : [],
				hiddenCounterGroups: Array.isArray(legacy.hiddenCounterGroups) ? legacy.hiddenCounterGroups : [],
				activeWorkspace: normalizeWorkspacePreference(legacy.activeWorkspace),
				updatedAt: serverTimestamp(),
				});
			},
		);
	}
	if (countersSnapshot.exists()) {
		await accountDataOperation(
			`migrar users/${user.uid}/data/counters`,
			() =>
				migrateLegacyCounters(
					countersDoc,
					countersCollection,
					countersSnapshot,
					counterItemsSnapshot,
					migrationMaxCounters,
				),
		);
	} else if (counterItemsSnapshot.empty && Array.isArray(legacy.customCounters)) {
		const batch = writeBatch(db);
		normalizeCounters(legacy.customCounters, migrationMaxCounters).forEach(
			(counter, order) => {
				batch.set(
					doc(countersCollection, String(order)),
					counterPayload(counter, order),
				);
			},
		);
		await accountDataOperation(`migrar users/${user.uid}/customCounters`, () =>
			batch.commit(),
		);
	}
	if (!archiveSnapshot.exists()) {
		await accountDataOperation(
			`criar users/${user.uid}/data/archive`,
			() => setDoc(archiveDoc, {
				items: [],
				updatedAt: serverTimestamp(),
			}),
		);
	}
	await accountDataOperation(`normalizar users/${user.uid}`, () =>
		setDoc(
			profileReference,
			{
				displayName: user.displayName || "",
				email: user.email || "",
				photoURL: user.photoURL || "",
				...(typeof legacy.isAdmin === "boolean"
					? { isAdmin: legacy.isAdmin }
					: {}),
				...(typeof legacy.tier === "string"
					? { tier: legacy.tier }
					: {}),
				updatedAt: serverTimestamp(),
			},
			{ merge: true },
		),
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

function isTransientFirestoreError(error) {
	return (
		error?.code === "unavailable" ||
		/ client is offline|could not reach cloud firestore backend/i.test(
			String(error?.message || ""),
		)
	);
}

async function ensureUserDataWithRetry(user) {
	let lastError;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			return await ensureUserData(user);
		} catch (error) {
			lastError = error;
			if (!isTransientFirestoreError(error) || attempt === 2) throw error;
			await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
			if (currentUser?.uid !== user.uid) throw error;
		}
	}
	throw lastError;
}

async function subscribeToUserData(user) {
	unsubscribeUserData();
	setSaveState("Conectando...", true);
	countersReady = false;
	setCounterState("Conectando...", "connecting");
	archiveReady = false;
	setArchiveState("Conectando...", "connecting");
	let imagesAvailable;
	try {
		imagesAvailable = await ensureUserDataWithRetry(user);
	} catch (error) {
		console.error("Falha ao preparar dados da conta.", error);
		setSaveState("Erro de conexão");
		setCounterState("Erro de conexão", "error");
		setArchiveState("Erro de conexão", "error");
		showToast(
			error.accountOperation
				? `Permissão negada ao ${error.accountOperation}.`
				: "Não foi possível preparar os dados da conta.",
		);
		return;
	}
	if (currentUser?.uid !== user.uid) return;
	setImageLibraryAvailability(imagesAvailable);
	unsubscribeProfile = onSnapshot(
		doc(db, "users", user.uid),
		(snapshot) => {
			const data = snapshot.data() || {};
			setAdminAccess(snapshot.data()?.isAdmin === true);
			userTier = data.tier === "premium" ? "premium" : "free";
			const isPremium = userTier === "premium";
			const cancelAtPeriodEnd = data.cancelAtPeriodEnd === true;
			const renewsAt = data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null;
			const formattedDate =
				renewsAt && !Number.isNaN(renewsAt.getTime())
					? renewsAt.toLocaleDateString("pt-BR")
					: null;

			if (elements.userTierBadge) {
				elements.userTierBadge.textContent = isPremium ? "★ Premium" : "Free";
				elements.userTierBadge.className = `user-tier-badge ${isPremium ? "tier-premium" : "tier-free"}`;
			}
			if (elements.subscriptionTierBadge) {
				elements.subscriptionTierBadge.textContent = isPremium ? "★ Premium" : "Free";
				elements.subscriptionTierBadge.className = `user-tier-badge ${isPremium ? "tier-premium" : "tier-free"}`;
			}
			if (elements.subscriptionStatusText) {
				if (isPremium) {
					elements.subscriptionStatusText.textContent = cancelAtPeriodEnd
						? `Cancelada (ativa até ${formattedDate || "fim do período"})`
						: "Assinatura Ativa";
				} else {
					elements.subscriptionStatusText.textContent = "Plano Gratuito";
				}
			}
			if (elements.subscriptionPriceText) {
				elements.subscriptionPriceText.textContent = isPremium ? "R$ 4,90/mês" : "R$ 0,00";
			}
			if (elements.subscriptionRenewsRow) {
				if (isPremium && formattedDate) {
					elements.subscriptionRenewsRow.hidden = false;
					if (elements.subscriptionRenewsLabel) {
						elements.subscriptionRenewsLabel.textContent = cancelAtPeriodEnd
							? "Expira em"
							: "Próxima renovação";
					}
					if (elements.subscriptionRenewsDate) {
						elements.subscriptionRenewsDate.textContent = formattedDate;
					}
				} else {
					elements.subscriptionRenewsRow.hidden = true;
				}
			}
			if (elements.manageSubscriptionButton) {
				elements.manageSubscriptionButton.hidden = !data.stripeCustomerId;
			}
			if (elements.counterKicker) {
				elements.counterKicker.textContent = isPremium ? "Até 15 contadores" : "Até cinco";
			}
			if (elements.openUpgradeDialog) {
				elements.openUpgradeDialog.hidden = isPremium;
			}
			if (elements.sidebarUpgradeIcon) {
				elements.sidebarUpgradeIcon.hidden = isPremium;
			}
			renderAiQuota(data);
			updateDowngradeRestrictions();
			updateActiveWorkspaceUi();
		},
		(error) => {
			console.error("Falha ao acompanhar perfil do usuário.", error);
			setAdminAccess(false);
		},
	);

	unsubscribeSettings = onSnapshot(
		settingsReference(user.uid),
		(snapshot) => {
			if (snapshot.exists()) {
				const data = snapshot.data();
				preferredWorkspaceValue = normalizeWorkspacePreference(
					data.activeWorkspace,
				);
				applySettings(data);
				restorePreferredWorkspace();
			}
			setSaveState("Sincronizado");
		},
		(error) => {
			console.error("Falha ao acompanhar configurações.", error);
			setSaveState("Erro de conexão");
			showToast("Não foi possível carregar os dados da conta.");
		},
	);
	unsubscribeCounters = onSnapshot(
		query(countersCollectionReference(user.uid), orderBy("order")),
		(snapshot) => {
			countersReady = true;
			applyCounterCollectionSnapshot(snapshot);
			setCounterState("Ao vivo", "live");
		},
		(error) => {
			console.error("Falha ao acompanhar contadores.", error);
			setCounterState("Erro de conexão", "error");
			showToast("Não foi possível atualizar os contadores em tempo real.");
		},
	);
	unsubscribeArchive = onSnapshot(
		archiveReference(user.uid),
		(snapshot) => {
			archiveReady = true;
			applyArchive(snapshot.exists() ? snapshot.data().items : []);
			setArchiveState("Ao vivo", "live");
		},
		(error) => {
			console.error("Falha ao acompanhar o arquivo de contadores.", error);
			archiveReady = false;
			setArchiveState("Erro de conexão", "error");
			showToast("Não foi possível atualizar o histórico em tempo real.");
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
	if (
		!(await confirmAction({
			title: "Excluir contador?",
			message: `“${counter.name}” será excluído dos seus contadores.`,
			confirmLabel: "Excluir contador",
		}))
	)
		return;
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

async function archiveCounter(counter) {
	if (!currentUser || counter.type !== "fixed" || !archiveReady) return;
	if (archivedCounters.length >= MAX_ARCHIVED_COUNTERS) {
		showToast("O histórico atingiu o limite de 100 conquistas.");
		return;
	}
	if (
		!(await confirmAction({
			title: "Arquivar contador?",
			message: `“${counter.name}” será movido para Conquistas.`,
			confirmLabel: "Arquivar contador",
			danger: false,
		}))
	)
		return;
	const userId = currentUser.uid;
	archiveReady = false;
	setCounterState("Arquivando...", "saving");
	setArchiveState("Arquivando...", "saving");
	renderCounterList(userSettings.customCounters);
	updateCustomCounters();
	try {
		await runTransaction(db, async (transaction) => {
			const slot = counterSlots.get(counter.id);
			if (slot == null) throw new Error("counter-no-longer-available");
			const counterDoc = doc(activeCountersCollectionReference(), slot);
			const archiveDoc = archiveReference(userId);
			const [counterSnapshot, archiveSnapshot] = await Promise.all([
				transaction.get(counterDoc),
				transaction.get(archiveDoc),
			]);
			if (!counterSnapshot.exists() || !archiveSnapshot.exists()) {
				throw new Error("archive-documents-missing");
			}
			const target = normalizeCounter(counterSnapshot.data());
			if (!target || target.type !== "fixed") {
				throw new Error("counter-no-longer-available");
			}
			const archive = normalizeArchive(archiveSnapshot.data().items);
			if (archive.length >= MAX_ARCHIVED_COUNTERS) {
				throw new Error("archive-limit-reached");
			}
			transaction.delete(counterDoc);
			transaction.set(archiveDoc, {
				items: [
					{ ...target, archivedAt: new Date().toISOString() },
					...archive,
				],
				updatedAt: serverTimestamp(),
			});
		});
		showToast("Contador movido para Conquistas.");
	} catch (error) {
		console.error("Falha ao arquivar contador.", error);
		archiveReady = true;
		setCounterState("Ao vivo", "live");
		setArchiveState("Ao vivo", "live");
		renderCounterList(userSettings.customCounters);
		updateCustomCounters();
		showToast(
			error.code === "permission-denied"
				? "As regras do Firestore precisam ser publicadas para arquivar."
				: error.message === "archive-limit-reached"
				? "O histórico atingiu o limite de 100 conquistas."
				: "Não foi possível arquivar o contador.",
		);
	}
}

async function deleteArchivedCounter(counter) {
	if (!currentUser || !archiveReady) return;
	if (
		!(await confirmAction({
			title: "Excluir conquista?",
			message: `“${counter.name}” será excluído permanentemente do histórico.`,
			confirmLabel: "Excluir conquista",
		}))
	)
		return;
	const userId = currentUser.uid;
	archiveReady = false;
	setArchiveState("Excluindo...", "saving");
	renderArchive(archivedCounters);
	try {
		await runTransaction(db, async (transaction) => {
			const archiveDoc = archiveReference(userId);
			const snapshot = await transaction.get(archiveDoc);
			if (!snapshot.exists()) throw new Error("archive-document-missing");
			const archive = normalizeArchive(snapshot.data().items);
			if (!archive.some((item) => item.id === counter.id)) {
				throw new Error("archive-item-no-longer-available");
			}
			transaction.set(archiveDoc, {
				items: archive.filter((item) => item.id !== counter.id),
				updatedAt: serverTimestamp(),
			});
		});
		showToast("Conquista excluída permanentemente.");
	} catch (error) {
		console.error("Falha ao excluir contador arquivado.", error);
		archiveReady = true;
		setArchiveState("Ao vivo", "live");
		renderArchive(archivedCounters);
		showToast(
			error.code === "permission-denied"
				? "As regras do Firestore precisam ser publicadas para alterar o histórico."
				: "Não foi possível excluir a conquista.",
		);
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

let currentChecklist = [];

function renderChecklistInputs() {
	if (!elements.counterChecklistInputs) return;
	elements.counterChecklistInputs.replaceChildren();

	currentChecklist.forEach((item, index) => {
		const row = document.createElement("div");
		row.className = "checklist-input-row";

		const input = document.createElement("input");
		input.type = "text";
		input.className = "field-control checklist-text-input";
		input.placeholder = "Ex.: Revisão";
		input.maxLength = 30;
		input.value = item.text;
		input.required = true;
		input.addEventListener("input", (e) => {
			currentChecklist[index].text = e.target.value;
			updateCounterPreview();
		});

		const removeBtn = document.createElement("button");
		removeBtn.type = "button";
		removeBtn.className = "icon-button remove-checklist-item-btn";
		removeBtn.setAttribute("aria-label", "Remover subtarefa");
		removeBtn.innerHTML = '<i class="material-icons">delete</i>';
		removeBtn.addEventListener("click", () => {
			currentChecklist.splice(index, 1);
			renderChecklistInputs();
			updateCounterPreview();
		});

		row.append(input, removeBtn);
		elements.counterChecklistInputs.append(row);
	});

	if (elements.addChecklistItem) {
		const isFull = currentChecklist.length >= 3;
		elements.addChecklistItem.disabled = isFull;
		if (elements.generateAiChecklistButton) {
			elements.generateAiChecklistButton.disabled = isFull;
		}
	}
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

function renderGroupChips(selectedGroup = "") {
	const container = document.querySelector("#counter-group-chips") || elements.counterGroupChips;
	if (!container) return;
	container.replaceChildren();

	const hiddenInput = document.querySelector("#counter-group") || elements.counterGroup;
	if (hiddenInput) hiddenInput.value = selectedGroup;

	const isPremium = isActiveWorkspacePremium();
	const canEdit = canEditActiveWorkspace();

	const noneChip = document.createElement("button");
	noneChip.type = "button";
	noneChip.disabled = !canEdit;
	noneChip.className = `counter-group-chip ${!selectedGroup ? "active" : ""}`;
	noneChip.textContent = "Nenhum";
	noneChip.addEventListener("click", () => {
		if (hiddenInput) hiddenInput.value = "";
		renderGroupChips("");
	});
	container.append(noneChip);

	const groups = (userSettings.counterGroups || []).filter((g) => g !== OUTROS_KEY);
	groups.forEach((groupName, index) => {
		const chip = document.createElement("div");
		chip.className = `counter-group-chip ${selectedGroup === groupName ? "active" : ""}`;

		if (isPremium && canEdit && groups.length > 1) {
			const moveLeft = document.createElement("button");
			moveLeft.type = "button";
			moveLeft.className = "counter-group-chip-btn";
			moveLeft.disabled = index === 0;
			moveLeft.title = `Mover "${groupName}" para a esquerda`;
			moveLeft.innerHTML = '<i class="material-icons" style="font-size: 14px;">chevron_left</i>';
			moveLeft.addEventListener("click", (e) => {
				e.stopPropagation();
				reorderCounterGroup(index, -1, selectedGroup);
			});
			chip.append(moveLeft);
		}

		const chipText = document.createElement("span");
		chipText.textContent = groupName;
		chipText.addEventListener("click", () => {
			if (!canEdit) return;
			if (!isPremium) {
				showToast("🔒 Grupos de contadores são um recurso Premium.");
				return;
			}
			if (hiddenInput) hiddenInput.value = groupName;
			renderGroupChips(groupName);
		});
		chip.append(chipText);

		if (isPremium && canEdit) {
			if (groups.length > 1) {
				const moveRight = document.createElement("button");
				moveRight.type = "button";
				moveRight.className = "counter-group-chip-btn";
				moveRight.disabled = index === groups.length - 1;
				moveRight.title = `Mover "${groupName}" para a direita`;
				moveRight.innerHTML = '<i class="material-icons" style="font-size: 14px;">chevron_right</i>';
				moveRight.addEventListener("click", (e) => {
					e.stopPropagation();
					reorderCounterGroup(index, 1, selectedGroup);
				});
				chip.append(moveRight);
			}

			const deleteBtn = document.createElement("button");
			deleteBtn.type = "button";
			deleteBtn.className = "counter-group-chip-delete";
			deleteBtn.title = `Excluir grupo "${groupName}"`;
			deleteBtn.setAttribute("aria-label", `Excluir grupo ${groupName}`);
			deleteBtn.innerHTML = '<i class="material-icons" style="font-size: 14px;">close</i>';
			deleteBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				deleteCounterGroup(groupName);
			});
			chip.append(deleteBtn);
		}

		container.append(chip);
	});

	if (groups.length < 3 && isPremium && canEdit) {
		const addBtn = document.createElement("button");
		addBtn.type = "button";
		addBtn.className = "counter-group-add-btn";
		addBtn.innerHTML = '<i class="material-icons" style="font-size: 14px;">add</i> Criar grupo';
		addBtn.addEventListener("click", () => promptCreateCounterGroup());
		container.append(addBtn);
	}
}

async function promptCreateCounterGroup() {
	if (!canEditActiveWorkspace()) {
		showToast("Seu acesso a esta equipe é somente para visualização.");
		return;
	}
	if (!isActiveWorkspacePremium()) {
		showToast("🔒 Criar grupos de contadores é um recurso do plano Premium.");
		return;
	}
	const currentGroups = userSettings.counterGroups || [];
	const namedGroups = currentGroups.filter((g) => g !== OUTROS_KEY);
	if (namedGroups.length >= 3) {
		showToast("Você pode criar no máximo 3 grupos no plano Premium.");
		return;
	}
	const newName = prompt("Nome do novo grupo (até 30 caracteres):");
	if (!newName) return;
	const trimmed = newName.trim().slice(0, 30);
	if (!trimmed) return;
	if (namedGroups.includes(trimmed)) {
		showToast("Este grupo já existe.");
		return;
	}
	// Auto-insert OUTROS_KEY at start if not present (first group creation)
	const nextGroups = currentGroups.includes(OUTROS_KEY)
		? [...currentGroups, trimmed]
		: [OUTROS_KEY, ...namedGroups, trimmed];
	userSettings.counterGroups = nextGroups;
	renderGroupChips(trimmed);
	renderDashboardSectionControls();
	renderCustomCounters(userSettings.customCounters);
	await saveSettings({ counterGroups: nextGroups });
}

async function deleteCounterGroup(groupName) {
	if (!canEditActiveWorkspace()) return;
	const currentGroups = userSettings.counterGroups || [];
	let nextGroups = currentGroups.filter((g) => g !== groupName);
	// If no named groups remain, remove OUTROS_KEY too (ordering is meaningless)
	const remainingNamed = nextGroups.filter((g) => g !== OUTROS_KEY);
	if (remainingNamed.length === 0) nextGroups = [];
	userSettings.counterGroups = nextGroups;
	const selected =
		elements.counterGroup?.value === groupName ? "" : elements.counterGroup?.value || "";
	renderGroupChips(selected);
	renderDashboardSectionControls();
	renderCustomCounters(userSettings.customCounters);
	await saveSettings({ counterGroups: nextGroups });
}

function renderCounterGroupControls() {
	if (!elements.counterGroupControls || !elements.counterGroupOrderList) return;
	const groups = (userSettings.counterGroups || []).filter((g) => g !== OUTROS_KEY);
	const canManage = isActiveWorkspacePremium() && canEditActiveWorkspace();
	elements.counterGroupControls.hidden = !canManage;
	if (!canManage) return;
	elements.counterGroupOrderList.replaceChildren();
	if (elements.createCounterGroupButton) {
		elements.createCounterGroupButton.disabled = groups.length >= 3;
	}
	if (groups.length === 0) {
		const empty = document.createElement("p");
		empty.className = "counter-group-empty";
		empty.textContent = "Crie um grupo para organizar os contadores deste espaço.";
		elements.counterGroupOrderList.append(empty);
		return;
	}
	elements.counterGroupOrderList.append(
		buildGroupOrderSubmenu(userSettings.counterGroups || []),
	);
}

async function reorderCounterGroup(index, delta, preserveSelection = "") {
	if (!canEditActiveWorkspace()) return;
	const effectiveOrder = (userSettings.counterGroups || []).includes(OUTROS_KEY)
		? [...(userSettings.counterGroups || [])]
		: [OUTROS_KEY, ...(userSettings.counterGroups || []).filter((g) => g !== OUTROS_KEY)];
	const targetIndex = index + delta;
	if (targetIndex < 0 || targetIndex >= effectiveOrder.length) return;

	const [moved] = effectiveOrder.splice(index, 1);
	effectiveOrder.splice(targetIndex, 0, moved);
	userSettings.counterGroups = effectiveOrder;

	const selectedGroup = preserveSelection || elements.counterGroup?.value || "";
	renderGroupChips(selectedGroup);
	renderDashboardSectionControls();
	renderCustomCounters(userSettings.customCounters);
	await saveSettings({ counterGroups: effectiveOrder });
}

function openCounterDialog(counter = null) {
	if (!canEditActiveWorkspace()) {
		showToast("Seu acesso a esta equipe é somente para visualização.");
		return;
	}
	editingCounterId = counter?.id || null;
	elements.counterForm.reset();
	if (elements.nlpPromptInput) elements.nlpPromptInput.value = "";
	if (elements.nlpChecklistItems) {
		elements.nlpChecklistItems.innerHTML = "";
		elements.nlpChecklistFieldset.hidden = true;
	}
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

	const promptContainer = document.getElementById("nlp-prompt-container");
	if (promptContainer) {
		promptContainer.hidden = isEditing;
	}

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
	renderGroupChips(counter?.group || "");
	if (elements.counterHidden) {
		elements.counterHidden.checked = Boolean(counter?.hidden);
		elements.counterHidden.disabled = !isActiveWorkspacePremium();
	}
	if (elements.counterIsPublic) {
		const isPremium = isActiveWorkspacePremium();
		const maxPublic = isPremium ? 5 : 1;
		const currentPublicCount = userSettings.customCounters.filter(
			(c) => c.isPublic && c.id !== counter?.id,
		).length;
		
		elements.counterIsPublic.checked = Boolean(counter?.isPublic);
		if (currentPublicCount >= maxPublic && !elements.counterIsPublic.checked) {
			elements.counterIsPublic.disabled = true;
			elements.counterPublicQuotaText.textContent = `(Limite de ${maxPublic} atingido)`;
		} else {
			elements.counterIsPublic.disabled = false;
			elements.counterPublicQuotaText.textContent = `(Você pode ter até ${maxPublic})`;
		}
		syncPublicLinksPanel(counter?.id);
	}
	currentChecklist = counter?.checklist ? JSON.parse(JSON.stringify(counter.checklist)) : [];
	renderChecklistInputs();
	updateCounterPreview();
	elements.counterDialog.showModal();
	elements.counterForm.elements.name.focus();
}

function syncPublicLinksPanel(counterId) {
	if (!elements.counterIsPublic || !elements.counterPublicLinksPanel) return;

	if (elements.counterIsPublic.checked) {
		elements.counterPublicLinksPanel.hidden = false;
		const baseUrl = window.location.origin;
		const id = counterId || "novo-contador";
		const workspacePrefix = activeWorkspace.type === "team" ? "t" : "u";
		const workspaceId = activeWorkspace.id || currentUser.uid;
		const link = `${baseUrl}/p/${workspacePrefix}/${workspaceId}/c/${id}`;
		
		elements.counterPublicLinkUrl.value = link;
		elements.counterPublicIframeCode.value = `<iframe src="${link}?embed=true" width="100%" height="100%" style="min-height: 400px; border: none; border-radius: 8px;"></iframe>`;
	} else {
		elements.counterPublicLinksPanel.hidden = true;
	}
}
elements.counterIsPublic?.addEventListener("change", () => {
	syncPublicLinksPanel(editingCounterId);
});

function renderAiQuota(userData = {}) {
	const tier = userData.tier === "premium" ? "premium" : "free";
	const isPremium = tier === "premium";
	const now = new Date();
	const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

	let used = 0;
	let limit = 8;
	let hint = "Plano Free: limite de 8 imagens no total.";

	if (isPremium) {
		limit = 40;
		const storedMonth = typeof userData.aiGenerationsMonth === "string" ? userData.aiGenerationsMonth : "";
		used = storedMonth === currentMonth && typeof userData.aiGenerationsMonthCount === "number"
			? userData.aiGenerationsMonthCount
			: 0;
		hint = "Plano Premium: 40 gerações/mês com renovação automática no 1º dia de cada mês.";
	} else {
		used = typeof userData.aiGenerationsTotal === "number" ? userData.aiGenerationsTotal : 0;
		if (used >= limit) {
			hint = "Limite vitalício do plano Free atingido. Assine o Premium para ter 40/mês!";
		}
	}

	const remaining = Math.max(0, limit - used);
	const percentage = Math.min(100, Math.round((used / limit) * 100));

	if (elements.aiQuotaBadge) {
		elements.aiQuotaBadge.textContent = isPremium ? "★ Premium" : "Free";
		elements.aiQuotaBadge.className = `user-tier-badge ${isPremium ? "tier-premium" : "tier-free"}`;
	}
	if (elements.aiQuotaUsageText) {
		elements.aiQuotaUsageText.textContent = `${used} de ${limit} geradas`;
	}
	if (elements.aiQuotaRemainingText) {
		elements.aiQuotaRemainingText.textContent = `${remaining} disponível(is)`;
	}
	if (elements.aiQuotaProgressBar) {
		elements.aiQuotaProgressBar.style.width = `${percentage}%`;
	}
	if (elements.aiQuotaResetText) {
		elements.aiQuotaResetText.textContent = hint;
	}
}

function updateDowngradeRestrictions() {
	if (activeWorkspace.type === "team") {
		if (elements.excessCountersWarning) {
			elements.excessCountersWarning.hidden = true;
		}
		return;
	}
	const counterCount = userSettings.customCounters.length;
	const isOverCounterLimit = userTier === "free" && counterCount > 5;
	if (elements.excessCountersWarning) {
		if (isOverCounterLimit) {
			elements.excessCountersWarning.hidden = false;
			if (elements.excessCountersText) {
				elements.excessCountersText.textContent = `Sua conta está no plano Free e possui ${counterCount} contadores (limite: 5). Edições e novos grupos estão pausados até você arquivar ou excluir ${counterCount - 5} contador(es).`;
			}
		} else {
			elements.excessCountersWarning.hidden = true;
		}
	}
}

elements.manageSubscriptionButton?.addEventListener("click", async () => {
	if (!currentUser) return;
	elements.manageSubscriptionButton.disabled = true;
	try {
		ensureAppCheck();
		const functionsInstance = getFunctions(app, pushConfig.functionsRegion || "southamerica-east1");
		const createPortal = httpsCallable(functionsInstance, "createStripePortalSession");
		const result = await createPortal();
		if (result?.data?.url) {
			window.location.href = result.data.url;
		} else {
			showToast("Não foi possível abrir o gerenciador de assinaturas.");
		}
	} catch (error) {
		console.error("Falha ao abrir o Stripe Customer Portal:", error);
		showToast(error.message || "Erro ao conectar ao gerenciador de assinaturas.");
	} finally {
		elements.manageSubscriptionButton.disabled = false;
	}
});

elements.openUpgradeDialog?.addEventListener("click", () => {
	elements.upgradeDialog?.showModal();
});
elements.sidebarUpgradeIcon?.addEventListener("click", () => {
	elements.upgradeDialog?.showModal();
});
elements.upgradeDialogClose?.addEventListener("click", () => {
	elements.upgradeDialog?.close();
});
elements.startStripeCheckout?.addEventListener("click", async () => {
	if (!currentUser) {
		showToast("Faça login com sua conta Google para assinar o Timekeeper Premium.");
		return;
	}
	elements.startStripeCheckout.disabled = true;
	elements.startStripeCheckout.textContent = "Carregando Checkout...";
	try {
		ensureAppCheck();
		const functionsInstance = getFunctions(app, pushConfig.functionsRegion || "southamerica-east1");
		const createCheckout = httpsCallable(functionsInstance, "createStripeCheckoutSession");
		const result = await createCheckout();
		if (result?.data?.url) {
			window.location.href = result.data.url;
		} else {
			showToast("Não foi possível gerar a sessão do Stripe Checkout.");
		}
	} catch (error) {
		console.error("Falha ao iniciar o Stripe Checkout:", error);
		showToast(error.message || "Erro ao conectar com o servidor do Stripe.");
	} finally {
		elements.startStripeCheckout.disabled = false;
		elements.startStripeCheckout.textContent = "Assinar Timekeeper Premium (R$ 4,90/mês)";
	}
});

try {
	const urlParams = new URLSearchParams(window.location.search);
	if (urlParams.has("stripe_success")) {
		showToast("🎉 Assinatura do Timekeeper Premium ativada com sucesso!");
		window.history.replaceState({}, document.title, window.location.pathname);
		(async () => {
			try {
				ensureAppCheck();
				const functionsInstance = getFunctions(app, pushConfig.functionsRegion || "southamerica-east1");
				const confirmCheckout = httpsCallable(functionsInstance, "confirmStripeCheckout");
				await confirmCheckout();
			} catch (err) {
				console.error("Falha ao confirmar status da assinatura:", err);
			}
		})();
	} else if (urlParams.has("stripe_cancel")) {
		showToast("Operação de assinatura cancelada.");
		window.history.replaceState({}, document.title, window.location.pathname);
	}
} catch {}

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
elements.openAdminModal.addEventListener("click", openAdminDialog);
elements.adminDialogClose.addEventListener("click", closeAdminDialog);
elements.adminDialog.addEventListener("click", (event) => {
	if (event.target === elements.adminDialog) closeAdminDialog();
});
elements.adminDialog.addEventListener("close", () => {
	resetAdminDateForm(elements.adminPaymentForm);
	resetAdminDateForm(elements.adminHolidayForm);
	elements.adminMessage.textContent = "";
});
for (const [index, tab] of elements.adminTabs.entries()) {
	tab.addEventListener("click", () => selectAdminTab(tab.dataset.adminTab));
	tab.addEventListener("keydown", (event) => {
		if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
		event.preventDefault();
		const direction = event.key === "ArrowRight" ? 1 : -1;
		const nextIndex =
			(index + direction + elements.adminTabs.length) % elements.adminTabs.length;
		selectAdminTab(elements.adminTabs[nextIndex].dataset.adminTab, true);
	});
}
elements.adminWorkdayForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!currentUserIsAdmin) return;
	const data = new FormData(elements.adminWorkdayForm);
	const startTime = String(data.get("startTime") || "");
	const endTime = String(data.get("endTime") || "");
	const daysOfWeek = [...new Set(data.getAll("daysOfWeek").map(Number))].sort(
		(first, second) => first - second,
	);
	if (!daysOfWeek.length) {
		elements.adminMessage.textContent = "Selecione pelo menos um dia de expediente.";
		return;
	}
	const submit = elements.adminWorkdayForm.querySelector('[type="submit"]');
	submit.disabled = true;
	try {
		await setDoc(generalConfigReference("workday"), {
			type: "workday",
			startTime,
			endTime,
			daysOfWeek,
			updatedAt: serverTimestamp(),
		});
		elements.adminMessage.textContent = "Expediente padrão atualizado.";
	} catch (error) {
		console.error("Falha ao salvar expediente geral.", error);
		elements.adminMessage.textContent = "Não foi possível salvar o expediente.";
	} finally {
		submit.disabled = false;
	}
});
elements.adminPaymentForm.addEventListener("submit", (event) =>
	saveAdminCalendarDate(event, "payment"),
);
elements.adminHolidayForm.addEventListener("submit", (event) =>
	saveAdminCalendarDate(event, "holiday"),
);
for (const form of [elements.adminPaymentForm, elements.adminHolidayForm]) {
	form.querySelector(".admin-date-cancel").addEventListener("click", () =>
		resetAdminDateForm(form),
	);
}
elements.openCounterModal.addEventListener("click", () => openCounterDialog());
elements.createCounterGroupButton?.addEventListener("click", () =>
	promptCreateCounterGroup(),
);
elements.openImageLibrary.addEventListener("click", () => openImageLibrary());
elements.openArchiveDialog.addEventListener("click", openArchiveDialog);
elements.chooseCounterImage.addEventListener("click", () =>
	openImageLibrary(true),
);
elements.removeCounterImage.addEventListener("click", () => {
	setSelectedCounterImage();
	renderImageLibrary();
});
elements.addChecklistItem.addEventListener("click", () => {
	if (currentChecklist.length >= 3) return;
	currentChecklist.push({ id: createCounterId(), text: "", done: false });
	renderChecklistInputs();
	updateCounterPreview();
	const inputs = elements.counterChecklistInputs.querySelectorAll(".checklist-text-input");
	if (inputs.length > 0) {
		inputs[inputs.length - 1].focus();
	}
});
elements.imageLibraryClose.addEventListener("click", closeImageLibrary);
elements.imageLibraryDialog.addEventListener("click", (event) => {
	if (event.target === elements.imageLibraryDialog) closeImageLibrary();
});
elements.archiveDialogClose.addEventListener("click", closeArchiveDialog);
elements.archiveDialog.addEventListener("click", (event) => {
	if (event.target === elements.archiveDialog) closeArchiveDialog();
});
elements.archiveDialog.addEventListener("close", () => {
	elements.authButton.focus();
});
elements.imageUploadInput.addEventListener("change", () => {
	uploadLibraryImage(elements.imageUploadInput.files?.[0]);
});
elements.libraryTabUpload.addEventListener("click", () => switchLibraryTab("upload"));
elements.libraryTabAi.addEventListener("click", () => switchLibraryTab("ai"));
document.querySelectorAll(".ai-preset-btn").forEach((button) => {
	button.addEventListener("click", () => {
		elements.aiPromptInput.value = button.getAttribute("data-prompt") || "";
		elements.imageLibraryMessage.textContent = "";
	});
});
elements.aiGenerateBtn.addEventListener("click", () => handleGenerateAiImage());
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
	clearNotificationDeliveryState(currentUser?.uid);
	localStorage.removeItem(DASHBOARD_CACHE_KEY);
	await revokeCurrentPushDevice();
	await signOut(auth);
});
elements.deleteAccountButton.addEventListener("click", async () => {
	if (!currentUser) return;
	const confirmed = await confirmAction({
		title: "Excluir conta e dados?",
		message:
			"Sua conta, configurações, contadores, histórico e imagens serão excluídos permanentemente. Esta ação não pode ser desfeita.",
		confirmLabel: "Excluir minha conta",
	});
	if (!confirmed) return;

	const userToDelete = currentUser;
	elements.deleteAccountButton.disabled = true;
	try {
		await reauthenticateWithPopup(userToDelete, googleProvider);
		if (!(await revokeCurrentPushDevice({ deleteAll: true }))) {
			throw new Error("push-data-delete-failed");
		}
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
		const counterItems = await getDocs(
			countersCollectionReference(userToDelete.uid),
		);
		const deleteBatch = writeBatch(db);
		counterItems.forEach((counterDoc) => deleteBatch.delete(counterDoc.ref));
		deleteBatch.delete(doc(db, "users", userToDelete.uid, "data", "settings"));
		deleteBatch.delete(legacyCountersReference(userToDelete.uid));
		deleteBatch.delete(doc(db, "users", userToDelete.uid, "data", "archive"));
		deleteBatch.delete(doc(db, "users", userToDelete.uid, "data", "images"));
		deleteBatch.delete(userRef);
		await deleteBatch.commit();
		clearNotificationDeliveryState(userToDelete.uid);
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
		!elements.imageLibraryDialog.open &&
		!elements.adminDialog.open
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
elements.dashboardLayout.addEventListener("change", () => {
	persistDashboardPreferences({
		...userSettings,
		dashboardLayout: elements.dashboardLayout.value,
	});
});
elements.timelineSourceFilter.addEventListener("change", renderTimeline);
for (const option of elements.timelineViewOptions) {
	option.addEventListener("click", () => {
		timelineView = option.dataset.timelineView === "calendar" ? "calendar" : "linear";
		selectedCalendarDayKey = null;
		renderTimeline();
	});
}
elements.notificationsEnabled.addEventListener("change", async () => {
	elements.notificationMessage.textContent = "";
	if (!elements.notificationsEnabled.checked) {
		const disabled = await persistNotificationPreferences({
			...userSettings,
			notificationsEnabled: false,
		});
		if (disabled) await revokeCurrentPushDevice();
		return;
	}
	if (notificationSupportState() === "unsupported") {
		syncNotificationUi();
		return;
	}
	let permission = Notification.permission;
	if (permission === "default") {
		permission = await Notification.requestPermission();
	}
	if (permission !== "granted") {
		elements.notificationMessage.textContent =
			permission === "denied"
				? "Permissão negada. O app não solicitará novamente automaticamente."
				: "A permissão não foi concedida.";
		syncNotificationUi();
		return;
	}
	const enabled = await persistNotificationPreferences({
		...userSettings,
		notificationsEnabled: true,
	});
	if (enabled) await registerPushForCurrentUser();
});
for (const input of document.querySelectorAll(
	'[name="notificationLead"], [name="notificationSource"]',
)) {
	input.addEventListener("change", async () => {
		elements.notificationMessage.textContent = "";
		const checkedLeads = document.querySelectorAll(
			'[name="notificationLead"]:checked',
		);
		if (input.name === "notificationLead" && checkedLeads.length === 0) {
			input.checked = true;
			elements.notificationMessage.textContent =
				"Mantenha pelo menos uma antecedência.";
			return;
		}
		await persistNotificationPreferences(notificationPreferencesFromControls());
	});
}
elements.notificationQuietEnabled.addEventListener("change", async () => {
	await persistNotificationPreferences(notificationPreferencesFromControls());
});
for (const input of [
	elements.notificationQuietStart,
	elements.notificationQuietEnd,
]) {
	input.addEventListener("change", async () => {
		await persistNotificationPreferences(notificationPreferencesFromControls());
	});
}
elements.addWeatherWidget.addEventListener("click", () => openWeatherWidgetForm());
elements.cancelWeatherWidget.addEventListener("click", closeWeatherWidgetForm);
elements.weatherWidgetForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const data = new FormData(elements.weatherWidgetForm);
	const editingId = String(data.get("id") || "");
	const widget = window.TimekeeperWeather.normalizeWidget({
		id: editingId || undefined,
		label1: data.get("label1"),
		label2: data.get("label2"),
		forecastUrl: data.get("forecastUrl"),
		enabled: data.get("enabled") === "on",
	});
	if (!widget) {
		elements.weatherWidgetMessage.textContent =
			"Use um link completo do Forecast7, como https://forecast7.com/pt/.../.../.";
		return;
	}
	const current = window.TimekeeperWeather.normalizeWidgets(
		userSettings.weatherWidgets,
	);
	if (!editingId && current.length >= window.TimekeeperWeather.MAX_WIDGETS) {
		elements.weatherWidgetMessage.textContent = "O limite é de cinco cidades.";
		return;
	}
	const next = editingId
		? current.map((item) => (item.id === editingId ? widget : item))
		: [...current, widget];
	const submit = elements.weatherWidgetForm.querySelector('[type="submit"]');
	submit.disabled = true;
	if (await persistWeatherWidgets(next)) closeWeatherWidgetForm();
	submit.disabled = false;
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
	if (!editingCounterId && userSettings.customCounters.length >= getMaxCounters()) {
		elements.counterMessage.textContent = `Você atingiu o limite de ${getMaxCounters()} contadores.`;
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
	if (isActiveWorkspacePremium()) {
		const groupName = String(data.get("group") || "").trim().slice(0, 30);
		if (groupName) counter.group = groupName;
		if (existingCounter?.hidden) counter.hidden = true;
	}
	if (elements.counterIsPublic) {
		if (elements.counterIsPublic.checked) {
			counter.isPublic = true;
		}
	}
	if (currentChecklist.length > 0) {
		counter.checklist = currentChecklist.map((item) => ({
			id: item.id || createCounterId(),
			text: String(item.text).trim().slice(0, 30),
			done: Boolean(item.done),
		}));
	}
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

const PUBLIC_PATH_REGEX = /^\/p\/([ut])\/([^\/]+)\/c\/([^\/]+)/;
const publicPathMatch = window.location.pathname.match(PUBLIC_PATH_REGEX);

if (publicPathMatch) {
	initPublicMode(publicPathMatch[1], publicPathMatch[2], publicPathMatch[3]);
} else {
	onAuthStateChanged(auth, (user) => {
		currentUser = user;
		if (!user) pushRegistrationState = pushConfigured ? "idle" : "local";
		document.body.classList.toggle("signed-in", Boolean(user));
		elements.guestTimeConfig.hidden = Boolean(user);
		updateAccountUi(user);
		if (user) {
			subscribeToUserData(user);
			subscribeToTeams(user);
			checkInviteUrlParams();
			return;
		}
		unsubscribeUserData();
		activeUploadTask?.cancel();
		activeUploadTask = null;
		closeImageLibrary();
		closeArchiveDialog();
		closeAdminDialog();
		closeSidebar();
		userImages = [];
		imageUrls = new Map();
		setImageLibraryAvailability(true);
		renderImageLibrary();
		applySettings({ ...DEFAULTS, ...guestTimeSettings() });
		applyCounters([]);
		applyArchive([]);
		setArchiveState("Conectando...", "connecting");
	});

	subscribeToGeneralConfig();
}

async function initPublicMode(workspaceType, workspaceId, counterId) {
	document.body.classList.add("public-focus-mode");
	
	const isEmbed = new URLSearchParams(window.location.search).get("embed") === "true";
	if (isEmbed) {
		document.body.classList.add("embed-mode");
	}

	try {
		const getPublicCounterData = httpsCallable(ensureFunctionsBackend(), "getPublicCounterData");
		const result = await getPublicCounterData({
			uid: workspaceType === "u" ? workspaceId : undefined,
			teamId: workspaceType === "t" ? workspaceId : undefined,
			counterId
		});
		
		const { counter, settings } = result.data;
		
		applySettings({ ...DEFAULTS, ...settings });
		userSettings.customCounters = normalizeCounters([counter]);
		
		// Iniciar o modo de foco diretamente no contador público
		if (typeof root !== "undefined" && root.TimekeeperFocus) {
			const counterEl = document.querySelector(`[data-focus-id="${counter.id}"]`);
			if (counterEl) {
				const openFn = root.TimekeeperFocus.open || window.TimekeeperFocus.open;
				openFn(counter.id);
				
				// Garantir que os botões de fechar e pausar sumam se for embed
				const closeBtn = document.getElementById("focus-close");
				const controls = document.getElementById("focus-controls");
				if (isEmbed) {
					if (closeBtn) closeBtn.style.display = "none";
					if (controls) controls.style.display = "none";
				} else {
					if (closeBtn) {
						closeBtn.onclick = () => {
							window.location.href = "/";
						};
					}
				}
			}
		} else if (window.TimekeeperFocus) {
			window.TimekeeperFocus.open(counter.id);
			const closeBtn = document.getElementById("focus-close");
			const controls = document.getElementById("focus-controls");
			if (isEmbed) {
				if (closeBtn) closeBtn.style.display = "none";
				if (controls) controls.style.display = "none";
			} else {
				if (closeBtn) {
					closeBtn.onclick = () => {
						window.location.href = "/";
					};
				}
			}
		}
	} catch (error) {
		console.error("Erro ao carregar contador público:", error);
		document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--text-primary);font-family:var(--font-sans);"><div style="text-align:center;"><i class="material-icons" style="font-size:48px;margin-bottom:16px;opacity:0.5;">lock</i><h2>Acesso Negado</h2><p>Este contador não é público ou não existe.</p></div></div>`;
	}
}

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
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState !== "visible") return;
	syncNotificationUi();
	scheduleNotificationScan();
});
if (typeof reducedMotionQuery.addEventListener === "function") {
	reducedMotionQuery.addEventListener("change", syncConstellation);
} else {
	reducedMotionQuery.addListener(syncConstellation);
}
if (typeof timelineOrientationQuery.addEventListener === "function") {
	timelineOrientationQuery.addEventListener("change", renderTimeline);
} else {
	timelineOrientationQuery.addListener(renderTimeline);
}
window.setInterval(updateCustomCounters, 1000);
window.setInterval(updateTimelineTemporalStates, 60000);
window.setInterval(scanNotifications, 15000);

// --- Phase 12: Teams & Collaboration Implementation ---

function activeLegacyCountersReference() {
	if (activeWorkspace.type === "team" && activeWorkspace.id) {
		return doc(db, "teams", activeWorkspace.id, "data", "counters");
	}
	return legacyCountersReference(currentUser.uid);
}

function activeCountersCollectionReference() {
	if (activeWorkspace.type === "team" && activeWorkspace.id) {
		return teamCountersCollectionReference(activeWorkspace.id);
	}
	return countersCollectionReference(currentUser.uid);
}

function activeWorkspaceValue() {
	return activeWorkspace.type === "team" && activeWorkspace.id
		? `team:${activeWorkspace.id}`
		: "personal";
}

function updateActiveWorkspaceUi() {
	const canEdit = canEditActiveWorkspace();
	const isPremium = isActiveWorkspacePremium();
	document.body.dataset.workspaceType = activeWorkspace.type;
	document.body.dataset.workspaceRole =
		activeWorkspace.type === "team" ? activeWorkspace.role || "viewer" : "owner";
	const mainTitle = document.querySelector("#custom-counters-title");
	if (elements.customCountersKicker) {
		elements.customCountersKicker.textContent =
			activeWorkspace.type === "team" ? "Equipe" : "Sua conta";
	}
	if (mainTitle) {
		mainTitle.textContent =
			activeWorkspace.type === "team"
				? activeWorkspace.name || "Contadores da equipe"
				: "Meus contadores";
	}
	if (elements.counterKicker) {
		elements.counterKicker.textContent = isPremium
			? "Até 15 contadores"
			: "Até cinco";
	}
	if (elements.counterManagementLabel) {
		elements.counterManagementLabel.textContent =
			activeWorkspace.type === "team"
				? activeWorkspace.name || "Equipe"
				: "Meus contadores";
	}
	if (elements.userTierBadge) {
		elements.userTierBadge.textContent = isPremium ? "★ Premium" : "Free";
		elements.userTierBadge.className = `user-tier-badge ${isPremium ? "tier-premium" : "tier-free"}`;
	}
	const timelineCountersOption = elements.timelineSourceFilter?.querySelector(
		'option[value="counters"]',
	);
	if (timelineCountersOption) {
		timelineCountersOption.textContent =
			activeWorkspace.type === "team"
				? "Contadores da equipe"
				: "Meus contadores";
	}
	const counterSettings = elements.counterList?.closest(".counter-settings");
	counterSettings?.classList.toggle("is-readonly", !canEdit);
	if (!canEdit && elements.counterDialog?.open) closeCounterDialog();
	renderDashboardSectionControls(userSettings);
	renderCounterGroupControls();
	renderCustomCounters(userSettings.customCounters || []);
	renderTimeline();
}

function restorePreferredWorkspace() {
	if (!currentUser) return;
	const preferred = normalizeWorkspacePreference(preferredWorkspaceValue);
	if (preferred === "personal") {
		if (activeWorkspace.type !== "personal") {
			switchWorkspace("personal", { persist: false });
		}
		return;
	}
	if (!teamsReady) return;
	const teamId = preferred.slice(5);
	if (userTeams.some((team) => team.id === teamId)) {
		if (activeWorkspaceValue() !== preferred) {
			switchWorkspace(preferred, { persist: false });
		}
		return;
	}
	preferredWorkspaceValue = "personal";
	switchWorkspace("personal", { persist: true });
}

function getMaxCreatedTeams() {
	return userTier === "premium" ? 3 : 1;
}

function getMaxTeamMembers(ownerTier = "free") {
	return ownerTier === "premium" ? 12 : 5;
}

function escapeHtml(text) {
	return String(text || "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function subscribeToTeams(user) {
	if (unsubscribeTeams) unsubscribeTeams();
	const userTeamsQuery = query(
		collection(db, "teams"),
		where(`members.${user.uid}.role`, "in", ["admin", "editor", "viewer"]),
	);
	unsubscribeTeams = onSnapshot(
		userTeamsQuery,
		(snapshot) => {
			userTeams = snapshot.docs.map((d) => d.data());
			teamsReady = true;
			renderWorkspaceSwitcher();
			if (activeWorkspace.type === "team") {
				const currentTeam = userTeams.find((t) => t.id === activeWorkspace.id);
				if (currentTeam) {
					activeWorkspace.name = currentTeam.name;
					activeWorkspace.ownerTier = currentTeam.ownerTier || "free";
					activeWorkspace.role = currentTeam.members[user.uid]?.role || "viewer";
					updateActiveWorkspaceUi();
				} else {
					preferredWorkspaceValue = "personal";
					switchWorkspace("personal", { persist: true });
				}
			}
			restorePreferredWorkspace();
		},
		(error) => {
			console.error("Falha ao acompanhar equipes.", error);
		},
	);
}

function renderWorkspaceSwitcher() {
	if (elements.teamsManageButton) {
		elements.teamsManageButton.hidden = !currentUser;
	}
	if (!elements.workspaceSwitcher) return;
	if (!currentUser || userTeams.length === 0) {
		elements.workspaceSwitcher.hidden = true;
		if (activeWorkspace.type !== "personal") {
			switchWorkspace("personal");
		}
		return;
	}
	elements.workspaceSwitcher.hidden = false;
	const optionsHTML = [
		'<option value="personal">👤 Meu Espaço Pessoal</option>',
		...userTeams.map(
			(team) =>
				`<option value="team:${team.id}">👥 Equipe: ${escapeHtml(team.name)}</option>`,
		),
		'<option value="create_team">+ Criar nova equipe...</option>',
	].join("");
	elements.workspaceSwitcher.innerHTML = optionsHTML;
	if (activeWorkspace.type === "team") {
		elements.workspaceSwitcher.value = `team:${activeWorkspace.id}`;
	} else {
		elements.workspaceSwitcher.value = "personal";
	}
}

async function switchWorkspace(workspaceValue, { persist = true } = {}) {
	if (workspaceValue === "create_team") {
		renderWorkspaceSwitcher();
		openTeamManageModal();
		return;
	}
	if (!currentUser) return;
	const normalizedValue = normalizeWorkspacePreference(workspaceValue);
	if (normalizedValue === activeWorkspaceValue()) {
		renderWorkspaceSwitcher();
		updateActiveWorkspaceUi();
		if (
			persist &&
			normalizeWorkspacePreference(personalSettingsData.activeWorkspace) !==
				normalizedValue
		) {
			preferredWorkspaceValue = normalizedValue;
			await saveSettings({ activeWorkspace: normalizedValue });
		}
		return;
	}

	if (normalizedValue === "personal") {
		activeWorkspace = { type: "personal" };
		workspaceGroupSettings = normalizeGroupSettings(personalSettingsData);
		listenToWorkspaceData();
		renderWorkspaceSwitcher();
	} else if (normalizedValue.startsWith("team:")) {
		const teamId = normalizedValue.slice(5);
		const team = userTeams.find((t) => t.id === teamId);
		if (!team) return;
		const myRole = team.members[currentUser.uid]?.role || "viewer";
		activeWorkspace = {
			type: "team",
			id: team.id,
			name: team.name,
			ownerUid: team.ownerUid,
			ownerTier: team.ownerTier || "free",
			role: myRole,
		};
		workspaceGroupSettings = normalizeGroupSettings();
		listenToWorkspaceData();
		renderWorkspaceSwitcher();
	}
	updateActiveWorkspaceUi();
	if (persist) {
		preferredWorkspaceValue = normalizedValue;
		await saveSettings({ activeWorkspace: normalizedValue });
	}
}

async function listenToWorkspaceData() {
	workspaceSubscriptionVersion += 1;
	const subscriptionVersion = workspaceSubscriptionVersion;
	if (unsubscribeCounters) {
		unsubscribeCounters();
		unsubscribeCounters = null;
	}
	unsubscribeWorkspaceSettings?.();
	unsubscribeWorkspaceSettings = null;
	countersReady = false;
	applyCounters([]);
	setCounterState("Conectando...", "connecting");

	if (activeWorkspace.type === "team") {
		applyWorkspaceGroupSettings({});
		const settingsTarget = teamSettingsReference(activeWorkspace.id);
		unsubscribeWorkspaceSettings = onSnapshot(
			settingsTarget,
			(snapshot) => {
				if (subscriptionVersion !== workspaceSubscriptionVersion) return;
				applyWorkspaceGroupSettings(snapshot.exists() ? snapshot.data() : {});
				setSaveState("Sincronizado");
			},
			(error) => {
				if (subscriptionVersion !== workspaceSubscriptionVersion) return;
				console.error("Falha ao carregar configurações da equipe.", error);
				setSaveState("Erro de conexão");
				showToast("Não foi possível carregar os grupos da equipe.");
			},
		);
	} else {
		applyWorkspaceGroupSettings(personalSettingsData);
	}
	let legacyFallback = [];
	try {
		if (canEditActiveWorkspace()) {
			await migrateLegacyCounters(
				activeLegacyCountersReference(),
				activeCountersCollectionReference(),
			);
		} else {
			const legacySnapshot = await getDoc(activeLegacyCountersReference());
			legacyFallback = normalizeCounters(
				legacySnapshot.exists() ? legacySnapshot.data().items : [],
			);
		}
	} catch (error) {
		if (subscriptionVersion !== workspaceSubscriptionVersion) return;
		console.error("Falha ao migrar contadores do espaço.", error);
		setCounterState("Erro de conexão", "error");
		showToast("Não foi possível migrar os contadores deste espaço.");
		return;
	}
	if (subscriptionVersion !== workspaceSubscriptionVersion) return;

	const targetRef = query(activeCountersCollectionReference(), orderBy("order"));
	unsubscribeCounters = onSnapshot(
		targetRef,
		(snapshot) => {
			if (subscriptionVersion !== workspaceSubscriptionVersion) return;
			countersReady = true;
			applyCounterCollectionSnapshot(snapshot, legacyFallback);
			if (!snapshot.empty) legacyFallback = [];
			setCounterState("Ao vivo", "live");
			updateActiveWorkspaceUi();
		},
		(error) => {
			if (subscriptionVersion !== workspaceSubscriptionVersion) return;
			console.error("Falha ao carregar contadores do espaço.", error);
			setCounterState("Erro de conexão", "error");
			showToast("Não foi possível carregar os contadores.");
		},
	);
}

async function createTeam(name) {
	if (!currentUser) return;
	const ownedTeamsCount = userTeams.filter(
		(team) => team.ownerUid === currentUser.uid,
	).length;
	const maxTeams = getMaxCreatedTeams();
	if (ownedTeamsCount >= maxTeams) {
		showToast(
			userTier === "premium"
				? "Você atingiu o limite de 3 equipes."
				: "Usuários Free podem criar 1 equipe. Assine o Premium para criar mais!",
		);
		return;
	}

	const teamId = `team_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
	const newTeam = {
		id: teamId,
		name: name.slice(0, 50),
		ownerUid: currentUser.uid,
		ownerTier: userTier,
		members: {
			[currentUser.uid]: {
				role: "admin",
				joinedAt: new Date().toISOString(),
			},
		},
		createdAt: new Date().toISOString(),
		updatedAt: serverTimestamp(),
	};
	try {
		await setDoc(doc(db, "teams", teamId), newTeam);
		await setDoc(teamSettingsReference(teamId), {
			counterGroups: [],
			hiddenCounterGroups: [],
			updatedAt: serverTimestamp(),
		});
		if (!userTeams.some((team) => team.id === teamId)) {
			userTeams = [...userTeams, newTeam];
		}
		showToast(`Equipe "${name}" criada com sucesso!`);
		await switchWorkspace(`team:${teamId}`);
		if (elements.teamManageDialog) elements.teamManageDialog.close();
	} catch (error) {
		console.error("Falha ao criar equipe.", error);
		showToast("Não foi possível criar a equipe.");
	}
}

let currentlyManagingTeamId = null;
let currentTeamMemberProfiles = new Map();

function memberPhotoUrl(value) {
	return typeof value === "string" && /^https?:\/\//i.test(value)
		? value.slice(0, 1000)
		: "";
}

function memberInitials(name, uid) {
	const initials = String(name || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("");
	return (initials || String(uid || "??").slice(0, 2)).toUpperCase();
}

function renderTeamMembersList() {
	if (!currentUser || !elements.teamMembersList || !currentlyManagingTeamId) return;
	const team = userTeams.find((item) => item.id === currentlyManagingTeamId);
	if (!team) return;

	const isOwner = team.ownerUid === currentUser.uid;
	const myRole = team.members?.[currentUser.uid]?.role || "viewer";
	const isAdmin = isOwner || myRole === "admin";
	const members = team.members || {};
	const roleLabels = { admin: "ADMIN", editor: "EDITOR", viewer: "LEITOR" };

	if (elements.teamMemberCount) {
		elements.teamMemberCount.textContent = Object.keys(members).length;
	}

	elements.teamMembersList.innerHTML = Object.entries(members)
		.map(([uid, memberData = {}]) => {
			const profile = currentTeamMemberProfiles.get(uid) || {};
			const isMe = uid === currentUser.uid;
			const isMemberOwner = uid === team.ownerUid;
			const role = memberData.role || "viewer";
			const memberName =
				profile.displayName ||
				memberData.displayName ||
				(isMe ? currentUser.displayName : "") ||
				(isMe ? "Você" : "Membro da equipe");
			const memberEmail =
				profile.email || memberData.email || (isMe ? currentUser.email : "");
			const photoURL = memberPhotoUrl(
				profile.photoURL || memberData.photoURL || (isMe ? currentUser.photoURL : ""),
			);
			const memberIdentifier =
				memberEmail || (isMe ? "Sua conta" : `ID ${uid.slice(0, 8)}…`);
			const avatar = photoURL
				? `<img src="${escapeHtml(photoURL)}" alt="" />`
				: escapeHtml(memberInitials(memberName, uid));
			return `
				<div class="team-member-item">
					<div class="team-member-info">
						<span class="team-member-avatar" aria-hidden="true">${avatar}</span>
						<span class="team-member-copy">
							<strong class="team-member-name">${escapeHtml(memberName)}</strong>
							<span class="team-member-id">${escapeHtml(memberIdentifier)}</span>
						</span>
					</div>
					<div class="team-member-controls">
						${
							isAdmin && !isMemberOwner && !isMe
								? `
			<select class="team-member-role-select" aria-label="Papel de ${escapeHtml(memberName)}" data-action="change-role" data-uid="${uid}">
								<option value="admin" ${role === "admin" ? "selected" : ""}>Admin</option>
								<option value="editor" ${role === "editor" ? "selected" : ""}>Editor</option>
								<option value="viewer" ${role === "viewer" ? "selected" : ""}>Leitor</option>
							</select>
							<button class="icon-button danger-icon" data-action="remove-member" data-uid="${uid}" title="Remover ${escapeHtml(memberName)}"><i class="material-icons">person_remove</i></button>
						`
								: `<span class="team-role-label">${isMemberOwner ? "DONO" : roleLabels[role] || "LEITOR"}</span>`
						}
					</div>
				</div>
			`;
		})
		.join("");
}

async function loadTeamMemberProfiles(teamId) {
	try {
		const getProfiles = httpsCallable(
			ensureFunctionsBackend(),
			"getTeamMemberProfiles",
		);
		const response = await getProfiles({ teamId });
		if (currentlyManagingTeamId !== teamId) return;
		currentTeamMemberProfiles = new Map(
			(response.data?.members || [])
				.filter((profile) => profile?.uid)
				.map((profile) => [profile.uid, profile]),
		);
		renderTeamMembersList();
	} catch (error) {
		console.warn("Não foi possível carregar os perfis da equipe.", error);
	}
}

function openTeamManageModal() {
	if (!currentUser || !elements.teamManageDialog) return;
	renderTeamsModalContent();
	elements.teamManageDialog.showModal();
}

function openTeamDetailsModal(teamId) {
	if (!currentUser || !elements.teamDetailsDialog) return;
	currentlyManagingTeamId = teamId;
	const team = userTeams.find((t) => t.id === teamId);
	if (!team) return;

	if (elements.teamDetailsTitle) {
		elements.teamDetailsTitle.textContent = `Gerenciar ${team.name}`;
	}
	if (elements.teamDetailsName) {
		elements.teamDetailsName.textContent = team.name;
	}
	if (elements.teamNameInput) {
		elements.teamNameInput.value = team.name;
	}
	if (elements.teamInviteLinkBox) {
		elements.teamInviteLinkBox.hidden = true;
	}

	const isOwner = team.ownerUid === currentUser.uid;
	const myRole = team.members?.[currentUser.uid]?.role || "viewer";
	const isAdmin = isOwner || myRole === "admin";
	const members = team.members || {};
	const memberCount = Object.keys(members).length;
	const maxMembers = getMaxTeamMembers(team.ownerTier || "free");
	const roleLabels = { admin: "ADMIN", editor: "EDITOR", viewer: "LEITOR" };

	if (elements.saveTeamNameButton) elements.saveTeamNameButton.hidden = !isAdmin;
	if (elements.teamNameInput) elements.teamNameInput.disabled = !isAdmin;
	if (elements.generateTeamInviteButton) elements.generateTeamInviteButton.hidden = !isAdmin;
	if (elements.teamDetailsRole) {
		elements.teamDetailsRole.textContent = isOwner ? "DONO" : roleLabels[myRole] || "LEITOR";
	}
	if (elements.teamDetailsSubtitle) {
		elements.teamDetailsSubtitle.textContent = `${memberCount} ${memberCount === 1 ? "membro" : "membros"} · ${team.ownerTier === "premium" ? "Plano Premium" : "Plano Free"}`;
	}
	if (elements.teamMemberCapacity) {
		elements.teamMemberCapacity.textContent = `${memberCount} / ${maxMembers}`;
	}

	currentTeamMemberProfiles = new Map();
	renderTeamMembersList();

	if (elements.leaveTeamButton) elements.leaveTeamButton.hidden = isOwner;
	if (elements.deleteTeamButton) elements.deleteTeamButton.hidden = !isAdmin;

	elements.teamDetailsDialog.showModal();
	void loadTeamMemberProfiles(teamId);
}

function renderTeamsModalContent() {
	if (!currentUser) return;

	// Render Quota Info & Creation Panel Visibility
	const ownedCount = userTeams.filter((t) => t.ownerUid === currentUser.uid).length;
	const maxTeams = getMaxCreatedTeams();
	const canCreate = ownedCount < maxTeams;

	if (elements.teamCreatePanel) {
		elements.teamCreatePanel.hidden = !canCreate;
	}

	if (elements.teamQuotaInfo) {
		elements.teamQuotaInfo.textContent =
			userTier === "premium"
				? `Você possui ${ownedCount} de ${maxTeams} equipes criadas (Plano Premium)`
				: `Você possui ${ownedCount} de ${maxTeams} equipe criada (Plano Free)`;
	}

	// Render User Teams Grid
	if (elements.userTeamsGrid) {
		const personalActive = activeWorkspace.type === "personal";
		const personalCardHTML = `
			<div class="team-card-item ${personalActive ? "is-active" : ""}">
				<div class="team-card-identity">
					<span class="team-section-icon" aria-hidden="true"><i class="material-icons">person</i></span>
					<div>
						<strong>Meu Espaço Pessoal</strong>
					<div class="team-card-meta">Seus contadores individuais e privados</div>
					</div>
				</div>
				<div class="team-card-actions">
					${
						personalActive
							? '<span class="team-role-label">ATIVO</span>'
							: '<button class="secondary-button compact-button" data-action="switch-workspace" data-workspace="personal">Alternar</button>'
					}
				</div>
			</div>
		`;

		const teamsCardsHTML = userTeams
			.map((team) => {
				const isActive = activeWorkspace.type === "team" && activeWorkspace.id === team.id;
				const isOwner = team.ownerUid === currentUser.uid;
				const memberRole = team.members[currentUser.uid]?.role || "viewer";
				const memberCount = Object.keys(team.members || {}).length;
				const maxMembers = getMaxTeamMembers(team.ownerTier || "free");
				return `
				<div class="team-card-item ${isActive ? "is-active" : ""}">
					<div class="team-card-identity">
						<span class="team-section-icon" aria-hidden="true"><i class="material-icons">group</i></span>
						<div>
						<strong>${escapeHtml(team.name)}</strong>
						<div class="team-card-meta">
							<span>${isOwner ? "Proprietário" : memberRole.toUpperCase()}</span> •
							<span>${memberCount}/${maxMembers} membros</span>
						</div>
						</div>
					</div>
					<div class="team-card-actions">
						${
							isActive
								? '<span class="team-role-label">ATIVO</span>'
								: `<button class="secondary-button compact-button" data-action="switch-workspace" data-workspace="team:${team.id}">Alternar</button>`
						}
						<button class="secondary-button compact-button" data-action="manage-team" data-team-id="${team.id}">Gerenciar</button>
					</div>
				</div>
			`;
			})
			.join("");

		elements.userTeamsGrid.innerHTML = personalCardHTML + teamsCardsHTML;
	}
}

async function generateTeamInviteLink(teamId) {
	const team = userTeams.find((item) => item.id === teamId);
	if (!team || !currentUser) throw new Error("Equipe indisponível para convite.");
	const inviteId = crypto.randomUUID();
	await setDoc(doc(db, "teams", teamId, "invites", inviteId), {
		teamId,
		teamName: team.name,
		role: "editor",
		createdBy: currentUser.uid,
		createdAt: serverTimestamp(),
		expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000),
	});
	const inviteToken = btoa(JSON.stringify({ teamId, inviteId }));
	const url = new URL(window.location.href);
	url.searchParams.set("invite", inviteToken);
	return url.toString();
}

function checkInviteUrlParams() {
	const params = new URLSearchParams(window.location.search);
	const inviteToken = params.get("invite");
	if (!inviteToken) return;

	try {
		const data = JSON.parse(atob(inviteToken));
		if (data.teamId && data.inviteId) {
			showPendingInviteModal(data.teamId, data.inviteId);
		} else {
			showToast("Este link de convite é antigo. Peça um novo link ao administrador.");
		}
	} catch (e) {
		console.error("Link de convite inválido.", e);
	}
}

async function showPendingInviteModal(teamId, inviteId) {
	if (!currentUser) {
		showToast("Faça login com sua conta Google para aceitar o convite!");
		return;
	}
	try {
		const inviteDoc = await getDoc(doc(db, "teams", teamId, "invites", inviteId));
		if (!inviteDoc.exists()) {
			showToast("Equipe não encontrada ou convite expirado.");
			return;
		}
		const invite = inviteDoc.data();
		const expiresAtMs = invite.expiresAt?.toMillis?.();
		if (invite.teamId !== teamId || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
			showToast("Este convite expirou. Peça um novo link ao administrador.");
			return;
		}
		const existingTeam = userTeams.find((team) => team.id === teamId);
		if (existingTeam) {
			showToast(`Você já é membro da equipe "${existingTeam.name}"!`);
			await switchWorkspace(`team:${teamId}`);
			return;
		}
		pendingInvites = [{ teamId, inviteId, teamName: invite.teamName }];
		renderPendingInvites();
		if (elements.pendingInvitesDialog) {
			elements.pendingInvitesDialog.showModal();
		}
	} catch (error) {
		console.error("Erro ao verificar convite.", error);
	}
}

function renderPendingInvites() {
	if (!elements.pendingInvitesButton) return;
	if (pendingInvites.length === 0) {
		elements.pendingInvitesButton.hidden = true;
		return;
	}
	elements.pendingInvitesButton.hidden = false;
	elements.pendingInvitesCount.textContent = pendingInvites.length;
	if (elements.pendingInvitesList) {
		elements.pendingInvitesList.innerHTML = pendingInvites
			.map(
				(invite) => `
			<div class="pending-invite-card">
				<div>
					<strong>${escapeHtml(invite.teamName)}</strong>
					<p class="muted">Você foi convidado para esta equipe.</p>
				</div>
				<div class="pending-invite-actions">
					<button class="primary-button compact-button" data-action="accept-invite" data-team-id="${invite.teamId}" data-invite-id="${invite.inviteId}">Aceitar</button>
					<button class="secondary-button compact-button" data-action="decline-invite" data-team-id="${invite.teamId}" data-invite-id="${invite.inviteId}">Recusar</button>
				</div>
			</div>
		`,
			)
			.join("");
	}
}

async function acceptTeamInvite(teamId, inviteId) {
	if (!currentUser) return;
	try {
		const acceptInvite = httpsCallable(ensureFunctionsBackend(), "acceptTeamInvite");
		const response = await acceptInvite({ teamId, inviteId });
		const team = response.data?.team;
		if (!team) throw new Error("Resposta inválida ao aceitar convite.");
		const joinedTeam = {
			...team,
			members: { [currentUser.uid]: { role: team.role || "editor" } },
		};
		userTeams = [
			...userTeams.filter((item) => item.id !== teamId),
			joinedTeam,
		];
		pendingInvites = pendingInvites.filter((i) => i.teamId !== teamId);
		renderPendingInvites();
		if (elements.pendingInvitesDialog) elements.pendingInvitesDialog.close();
		showToast(`Você entrou na equipe "${team.name}"!`);
		await switchWorkspace(`team:${teamId}`);
	} catch (error) {
		console.error("Falha ao aceitar convite.", error);
		showToast(error?.message || "Não foi possível aceitar o convite.");
	}
}

function declineTeamInvite(teamId) {
	pendingInvites = pendingInvites.filter((i) => i.teamId !== teamId);
	renderPendingInvites();
	if (elements.pendingInvitesDialog) elements.pendingInvitesDialog.close();
}

// Event Listeners for Teams Modal & Buttons
if (elements.workspaceSwitcher) {
	elements.workspaceSwitcher.addEventListener("change", () => {
		switchWorkspace(elements.workspaceSwitcher.value);
	});
}
if (elements.teamsManageButton) {
	elements.teamsManageButton.addEventListener("click", () => {
		openTeamManageModal();
	});
}
if (elements.teamManageClose) {
	elements.teamManageClose.addEventListener("click", () => {
		if (elements.teamManageDialog) elements.teamManageDialog.close();
	});
}
if (elements.teamDetailsClose) {
	elements.teamDetailsClose.addEventListener("click", () => {
		if (elements.teamDetailsDialog) elements.teamDetailsDialog.close();
	});
}

if (elements.createTeamSubmitButton) {
	elements.createTeamSubmitButton.addEventListener("click", async () => {
		const name = elements.createTeamNameInput?.value?.trim();
		if (name) {
			await createTeam(name);
			if (elements.createTeamNameInput) elements.createTeamNameInput.value = "";
		}
	});
}

if (elements.userTeamsGrid) {
	elements.userTeamsGrid.addEventListener("click", (e) => {
		const target = e.target.closest("button");
		if (!target) return;
		const action = target.dataset.action;
		if (action === "switch-workspace") {
			const ws = target.dataset.workspace;
			if (ws) switchWorkspace(ws);
			if (elements.teamManageDialog) elements.teamManageDialog.close();
		}
		if (action === "manage-team") {
			const teamId = target.dataset.teamId;
			if (teamId) {
				openTeamDetailsModal(teamId);
			}
		}
	});
}

if (elements.generateTeamInviteButton) {
	elements.generateTeamInviteButton.addEventListener("click", async () => {
		if (!currentlyManagingTeamId) return;
		elements.generateTeamInviteButton.disabled = true;
		try {
			const inviteUrl = await generateTeamInviteLink(currentlyManagingTeamId);
			if (elements.teamInviteLinkInput) elements.teamInviteLinkInput.value = inviteUrl;
			if (elements.teamInviteLinkBox) elements.teamInviteLinkBox.hidden = false;
		} catch (error) {
			console.error("Falha ao gerar convite.", error);
			showToast("Não foi possível gerar o link de convite.");
		} finally {
			elements.generateTeamInviteButton.disabled = false;
		}
	});
}

if (elements.pendingInvitesList) {
	elements.pendingInvitesList.addEventListener("click", async (event) => {
		const target = event.target.closest("button[data-action]");
		if (!target) return;
		const { action, teamId, inviteId } = target.dataset;
		if (!teamId || !inviteId) return;
		if (action === "accept-invite") {
			target.disabled = true;
			await acceptTeamInvite(teamId, inviteId);
			target.disabled = false;
		}
		if (action === "decline-invite") declineTeamInvite(teamId);
	});
}

if (elements.copyTeamInviteButton) {
	elements.copyTeamInviteButton.addEventListener("click", async () => {
		const link = elements.teamInviteLinkInput?.value;
		if (link) {
			await navigator.clipboard.writeText(link);
			showToast("Link de convite copiado!");
		}
	});
}

if (elements.saveTeamNameButton) {
	elements.saveTeamNameButton.addEventListener("click", async () => {
		if (!currentlyManagingTeamId) return;
		const newName = elements.teamNameInput?.value?.trim();
		if (!newName) return;
		try {
			await setDoc(
				doc(db, "teams", currentlyManagingTeamId),
				{ name: newName.slice(0, 50), updatedAt: serverTimestamp() },
				{ merge: true },
			);
			showToast("Nome da equipe atualizado!");
			if (elements.teamDetailsTitle) elements.teamDetailsTitle.textContent = `Gerenciar ${newName}`;
			if (elements.teamDetailsName) elements.teamDetailsName.textContent = newName;
			renderTeamsModalContent();
		} catch (e) {
			console.error("Falha ao salvar nome da equipe.", e);
			showToast("Não foi possível atualizar o nome da equipe.");
		}
	});
}

if (elements.leaveTeamButton) {
	elements.leaveTeamButton.addEventListener("click", async () => {
		if (!currentlyManagingTeamId || !currentUser) return;
		const team = userTeams.find((t) => t.id === currentlyManagingTeamId);
		if (!team) return;
		if (
			!(await confirmAction({
				title: "Sair da equipe?",
				message: `Você perderá o acesso aos contadores da equipe “${team.name}”.`,
				confirmLabel: "Sair da equipe",
			}))
		)
			return;

		try {
			const updatedMembers = { ...team.members };
			delete updatedMembers[currentUser.uid];
			await setDoc(doc(db, "teams", currentlyManagingTeamId), { members: updatedMembers, updatedAt: serverTimestamp() }, { merge: true });
			showToast(`Você saiu da equipe "${team.name}".`);
			if (elements.teamDetailsDialog) elements.teamDetailsDialog.close();
			if (activeWorkspace.type === "team" && activeWorkspace.id === currentlyManagingTeamId) {
				switchWorkspace("personal");
			}
			renderTeamsModalContent();
		} catch (e) {
			console.error("Falha ao sair da equipe.", e);
			showToast("Não foi possível sair da equipe.");
		}
	});
}

if (elements.deleteTeamButton) {
	elements.deleteTeamButton.addEventListener("click", async () => {
		if (!currentlyManagingTeamId || !currentUser) return;
		const team = userTeams.find((t) => t.id === currentlyManagingTeamId);
		if (!team) return;
		if (
			!(await confirmAction({
				title: "Excluir equipe permanentemente?",
				message: `Esta ação é permanente e não pode ser desfeita. A equipe “${team.name}” e todos os seus contadores serão excluídos definitivamente.`,
				confirmLabel: "Excluir equipe",
				danger: true,
			}))
		)
			return;

		try {
			const teamId = currentlyManagingTeamId;
			const deleteTeamCall = httpsCallable(
				ensureFunctionsBackend(),
				"deleteTeam",
			);
			await deleteTeamCall({ teamId });
			const wasActive = activeWorkspace.type === "team" && activeWorkspace.id === teamId;
			userTeams = userTeams.filter((item) => item.id !== teamId);
			currentlyManagingTeamId = null;
			showToast(`Equipe "${team.name}" excluída.`);
			if (elements.teamDetailsDialog) elements.teamDetailsDialog.close();
			if (wasActive) await switchWorkspace("personal");
			renderTeamsModalContent();
		} catch (e) {
			console.error("Falha ao excluir equipe.", e);
			showToast("Não foi possível excluir a equipe.");
		}
	});
}

if (elements.teamMembersList) {
	elements.teamMembersList.addEventListener("change", async (e) => {
		const target = e.target;
		if (target.dataset.action === "change-role" && currentlyManagingTeamId) {
			const uid = target.dataset.uid;
			const newRole = target.value;
			const team = userTeams.find((t) => t.id === currentlyManagingTeamId);
			if (!team || !uid) return;
			try {
				const updatedMembers = {
					...team.members,
					[uid]: { ...team.members[uid], role: newRole },
				};
				await setDoc(doc(db, "teams", currentlyManagingTeamId), { members: updatedMembers, updatedAt: serverTimestamp() }, { merge: true });
				showToast("Papel do membro atualizado!");
			} catch (err) {
				console.error("Falha ao atualizar papel.", err);
				showToast("Não foi possível atualizar o papel do membro.");
			}
		}
	});

	elements.teamMembersList.addEventListener("click", async (e) => {
		const target = e.target.closest("button");
		if (target && target.dataset.action === "remove-member" && currentlyManagingTeamId) {
			const uid = target.dataset.uid;
			const team = userTeams.find((t) => t.id === currentlyManagingTeamId);
			if (!team || !uid) return;
			if (
				!(await confirmAction({
					title: "Remover membro?",
					message: "Este usuário perderá o acesso à equipe.",
					confirmLabel: "Remover membro",
				}))
			)
				return;

			try {
				const updatedMembers = { ...team.members };
				delete updatedMembers[uid];
				await setDoc(doc(db, "teams", currentlyManagingTeamId), { members: updatedMembers, updatedAt: serverTimestamp() }, { merge: true });
				showToast("Membro removido da equipe.");
				renderTeamsModalContent();
			} catch (err) {
				console.error("Falha ao remover membro.", err);
				showToast("Não foi possível remover o membro.");
			}
		}
	});
}

// NLP Prompt integration
async function handleNlpPrompt() {
	if (!elements.nlpPromptInput || !elements.nlpParseButton) return;

	const promptText = elements.nlpPromptInput.value.trim();
	if (!promptText) return;

	// Parse locally for date/title
	if (window.NlpParser) {
		const parsed = window.NlpParser.parseNaturalLanguagePrompt(promptText);
		if (parsed) {
			elements.counterForm.elements.name.value = parsed.title;
			setCounterType(parsed.type);
			if (parsed.type === "recurring") {
				elements.counterForm.elements.startTime.value = parsed.startTime;
				elements.counterForm.elements.endTime.value = parsed.endTime;
				const days = new Set(parsed.daysOfWeek);
				elements.counterForm
					.querySelectorAll('input[name="daysOfWeek"]')
					.forEach((input) => (input.checked = days.has(Number(input.value))));
			} else {
				const start = new Date(parsed.startAtMs);
				const end = new Date(parsed.endAtMs);
				elements.counterForm.elements.startAt.value = toLocalInputValue(start);
				elements.counterForm.elements.endAt.value = toLocalInputValue(end);
			}
			updateCounterPreview();
		}
	}

	// Request AI checklist
	if (currentUser) {
		elements.nlpParseButton.disabled = true;
		elements.nlpParseButton.innerHTML = `<i class="material-icons">hourglass_empty</i>`;

		try {
			const generateAiChecklist = httpsCallable(ensureFunctionsBackend(), "generateAiChecklist");
			const { data } = await generateAiChecklist({ prompt: promptText });

			if (data) {
				if (data.counterParams && data.counterParams.type) {
					const cp = data.counterParams;
					setCounterType(cp.type);
					if (cp.type === "recurring") {
						if (cp.startTime) elements.counterForm.elements.startTime.value = cp.startTime;
						if (cp.endTime) elements.counterForm.elements.endTime.value = cp.endTime;
						if (cp.daysOfWeek) {
							const days = new Set(cp.daysOfWeek);
							elements.counterForm
								.querySelectorAll('input[name="daysOfWeek"]')
								.forEach((input) => (input.checked = days.has(Number(input.value))));
						}
					} else {
						if (cp.startAtMs) elements.counterForm.elements.startAt.value = toLocalInputValue(new Date(cp.startAtMs));
						if (cp.endAtMs) elements.counterForm.elements.endAt.value = toLocalInputValue(new Date(cp.endAtMs));
					}
					updateCounterPreview();
				}

				if (data.checklist && data.checklist.length > 0) {
					if (!elements.counterForm.elements.name.value || elements.counterForm.elements.name.value === "Contador Recorrente" || elements.counterForm.elements.name.value === "Novo Contador") {
						elements.counterForm.elements.name.value = data.title || promptText;
						updateCounterPreview();
					}

					data.checklist.forEach(itemText => {
						if (currentChecklist.length < 3) {
							currentChecklist.push({ id: createCounterId(), text: itemText, done: false });
						}
					});
					if (typeof renderChecklistInputs === "function") {
						renderChecklistInputs();
					}

					showToast("Checklist IA gerada com sucesso!");
				}
			}
		} catch (error) {
			console.error("Erro ao gerar checklist via IA:", error);
			if (error.code === "functions/resource-exhausted") {
				showToast("Cota de uso da IA esgotada.", true);
			} else {
				showToast("Falha ao gerar checklist. Tente novamente mais tarde.");
			}
		} finally {
			elements.nlpParseButton.disabled = false;
			elements.nlpParseButton.innerHTML = `<i class="material-icons">send</i>`;
		}
	} else if (!currentUser) {
		showToast("Faça login para utilizar a geração de checklists com IA.");
	}
}

if (elements.nlpParseButton) {
	elements.nlpParseButton.addEventListener("click", handleNlpPrompt);
}
if (elements.nlpPromptInput) {
	elements.nlpPromptInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleNlpPrompt();
		}
	});
}

// Handler for the inline checklist AI button
async function generateChecklistFromForm() {
	if (!elements.generateAiChecklistButton) return;

	const title = elements.counterForm.elements.name.value.trim();
	const promptText = title ? `Crie 3 subtarefas focadas e objetivas para: ${title}` : "Crie 3 subtarefas genéricas";

	if (currentUser) {
		elements.generateAiChecklistButton.disabled = true;
		const originalHtml = elements.generateAiChecklistButton.innerHTML;
		elements.generateAiChecklistButton.innerHTML = `<i class="material-icons">hourglass_empty</i> Gerando...`;

		try {
			const generateAiChecklist = httpsCallable(ensureFunctionsBackend(), "generateAiChecklist");
			const { data } = await generateAiChecklist({ prompt: promptText });

			if (data && data.checklist && data.checklist.length > 0) {
				data.checklist.forEach(itemText => {
					if (currentChecklist.length < 3) {
						currentChecklist.push({ id: createCounterId(), text: itemText, done: false });
					}
				});
				if (typeof renderChecklistInputs === "function") {
					renderChecklistInputs();
				}
				updateCounterPreview();
				showToast("Checklist gerada com sucesso!");
			} else {
				showToast("Não foi possível gerar a checklist.");
			}
		} catch (error) {
			console.error("Erro ao gerar checklist via IA:", error);
			if (error.code === "functions/resource-exhausted") {
				showToast("Cota de uso da IA esgotada.", true);
			} else {
				showToast("Falha ao gerar checklist. Tente novamente mais tarde.");
			}
		} finally {
			elements.generateAiChecklistButton.disabled = false;
			elements.generateAiChecklistButton.innerHTML = originalHtml;
		}
	} else if (!currentUser) {
		showToast("Faça login para utilizar a geração de checklists com IA.");
	}
}

if (elements.generateAiChecklistButton) {
	elements.generateAiChecklistButton.addEventListener("click", generateChecklistFromForm);
}
