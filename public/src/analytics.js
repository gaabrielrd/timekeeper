(function configureAnalyticsConsent() {
	const analyticsId = "G-77L2BHYR8X";
	const consentKey = "timekeeper:analytics-consent";
	let analyticsLoaded = false;

	function readConsent() {
		try {
			const value = window.localStorage.getItem(consentKey);
			return value === "granted" || value === "denied" ? value : null;
		} catch {
			return null;
		}
	}

	function saveConsent(value) {
		try {
			window.localStorage.setItem(consentKey, value);
		} catch {
			// A escolha ainda vale para a sessão mesmo quando storage está bloqueado.
		}
	}

	function loadAnalytics() {
		if (analyticsLoaded || document.querySelector("#google-analytics-script")) return;
		analyticsLoaded = true;
		window.dataLayer = window.dataLayer || [];
		window.gtag = function gtag() {
			window.dataLayer.push(arguments);
		};
		window.gtag("consent", "default", { analytics_storage: "granted" });
		window.gtag("js", new Date());
		window.gtag("config", analyticsId, { anonymize_ip: true });
		const script = document.createElement("script");
		script.id = "google-analytics-script";
		script.async = true;
		script.src = `https://www.googletagmanager.com/gtag/js?id=${analyticsId}`;
		document.head.append(script);
	}

	function hideBanner(banner) {
		banner.classList.remove("is-visible");
		window.setTimeout(() => {
			banner.hidden = true;
		}, 260);
	}

	function initializeConsentUi() {
		const banner = document.querySelector("#privacy-banner");
		const accept = document.querySelector("#privacy-accept");
		const decline = document.querySelector("#privacy-decline");
		if (!banner || !accept || !decline) return;

		const consent = readConsent();
		if (consent === "granted") {
			loadAnalytics();
			return;
		}
		if (consent === "denied") return;

		banner.hidden = false;
		window.requestAnimationFrame(() => banner.classList.add("is-visible"));
		accept.addEventListener("click", () => {
			saveConsent("granted");
			loadAnalytics();
			hideBanner(banner);
		});
		decline.addEventListener("click", () => {
			saveConsent("denied");
			hideBanner(banner);
		});
	}

	window.TimekeeperPrivacy = {
		consentKey,
		readConsent,
		resetConsent() {
			try {
				window.localStorage.removeItem(consentKey);
			} catch {
				// Storage pode estar indisponível em modos privados restritivos.
			}
		},
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initializeConsentUi, {
			once: true,
		});
	} else {
		initializeConsentUi();
	}
})();

