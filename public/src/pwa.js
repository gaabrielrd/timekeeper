(function setupPwa(root) {
	if (!root?.document || !root.navigator) return;
	const { document, navigator } = root;
	const installButton = document.querySelector("#install-app-button");
	const updateBanner = document.querySelector("#pwa-update-banner");
	const updateButton = document.querySelector("#pwa-update-button");
	const weatherOffline = document.querySelector("#weather-offline-message");
	let installPrompt = null;
	let waitingWorker = null;
	let refreshing = false;
	let updateRequested = false;

	function supportedOrigin() {
		return (
			root.isSecureContext ||
			["localhost", "127.0.0.1"].includes(root.location.hostname)
		);
	}

	function syncNetworkState() {
		const online = navigator.onLine;
		document.body.dataset.network = online ? "online" : "offline";
		if (weatherOffline) weatherOffline.hidden = online;
	}

	function showUpdate(worker) {
		waitingWorker = worker;
		if (updateBanner) updateBanner.hidden = false;
	}

	async function registerServiceWorker() {
		if (!("serviceWorker" in navigator) || !supportedOrigin()) return null;
		try {
			const registration = await navigator.serviceWorker.register("/sw.js", {
				scope: "/",
			});
			if (registration.waiting && navigator.serviceWorker.controller) {
				showUpdate(registration.waiting);
			}
			registration.addEventListener("updatefound", () => {
				const worker = registration.installing;
				worker?.addEventListener("statechange", () => {
					if (
						worker.state === "installed" &&
						navigator.serviceWorker.controller
					) {
						showUpdate(worker);
					}
				});
			});
			return registration;
		} catch (error) {
			console.error("Falha ao registrar o modo offline.", error);
			return null;
		}
	}

	root.addEventListener("beforeinstallprompt", (event) => {
		event.preventDefault();
		installPrompt = event;
		if (installButton) installButton.hidden = false;
	});

	root.addEventListener("appinstalled", () => {
		installPrompt = null;
		if (installButton) installButton.hidden = true;
	});

	installButton?.addEventListener("click", async () => {
		if (!installPrompt) return;
		installPrompt.prompt();
		await installPrompt.userChoice;
		installPrompt = null;
		installButton.hidden = true;
	});

	updateButton?.addEventListener("click", () => {
		updateRequested = true;
		waitingWorker?.postMessage({ type: "SKIP_WAITING" });
	});

	navigator.serviceWorker?.addEventListener("controllerchange", () => {
		if (!updateRequested) return;
		if (refreshing) return;
		refreshing = true;
		root.location.reload();
	});

	root.addEventListener("online", syncNetworkState);
	root.addEventListener("offline", syncNetworkState);
	document.addEventListener("DOMContentLoaded", syncNetworkState, { once: true });
	registerServiceWorker();
})(typeof globalThis !== "undefined" ? globalThis : this);
