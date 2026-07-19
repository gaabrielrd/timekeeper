const CACHE_PREFIX = "timekeeper-shell";
const CACHE_VERSION = "v3";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const APP_SHELL = [
	"/",
	"/index.html",
	"/offline.html",
	"/privacy.html",
	"/manifest.webmanifest",
	"/src/normalize.css",
	"/src/style.css",
	"/src/material.woff",
	"/src/favicon.png",
	"/src/assets/icon-192.png",
	"/src/assets/icon-512.png",
	"/src/assets/icon-maskable-512.png",
	"/src/data.js",
	"/src/runtime-config.js",
	"/src/time.js",
	"/src/occurrences.js",
	"/src/weather.js",
	"/src/notifications.js",
	"/src/progressbar.min.js",
	"/src/anime.min.js",
	"/src/analytics.js",
	"/src/firebase.js",
	"/src/pwa.js",
];

let firebaseMessaging = null;
try {
	importScripts(
		"https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js",
		"https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js",
	);
	firebase.initializeApp({
		apiKey: "AIzaSyBOLyOQ6-g3VqotQf7pCej4CAhVXvC0oYY",
		authDomain: "timekeeper-d9a0a.firebaseapp.com",
		projectId: "timekeeper-d9a0a",
		messagingSenderId: "190447151292",
		appId: "1:190447151292:web:ccee2963c0e8eeb9f688b9",
	});
	firebaseMessaging = firebase.messaging();
} catch (error) {
	console.error("FCM indisponível no service worker.", error);
}

function pushNotificationOptions(data = {}) {
	return {
		body: data.body || "Um evento da sua Timeline está próximo.",
		icon: "/src/assets/icon-192.png",
		badge: "/src/assets/icon-192.png",
		tag: data.tag || "timekeeper-push",
		renotify: false,
		data: {
			url: data.url || "/#dashboard-timeline-section",
			sourceId: data.sourceId || "",
		},
	};
}

firebaseMessaging?.onBackgroundMessage((payload) => {
	const data = payload?.data || {};
	return self.registration.showNotification(
		data.title || "Timekeeper",
		pushNotificationOptions(data),
	);
});

if (!firebaseMessaging) {
	self.addEventListener("push", (event) => {
		let payload = {};
		try {
			payload = event.data?.json?.() || {};
		} catch {
			payload = {};
		}
		const data = payload.data || payload.notification?.data || {};
		event.waitUntil(
			self.registration.showNotification(
				data.title || payload.notification?.title || "Timekeeper",
				pushNotificationOptions(data),
			),
		);
	});
}

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter(
							(key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
						)
						.map((key) => caches.delete(key)),
				),
		)
		.then(() => self.clients.claim()),
	);
});

self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function networkFirst(request) {
	try {
		const response = await fetch(request);
		if (response?.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		return (
			(await caches.match(request)) ||
			(await caches.match("/index.html")) ||
			(await caches.match("/offline.html"))
		);
	}
}

async function staleWhileRevalidate(request) {
	const cached = await caches.match(request);
	const refresh = fetch(request)
		.then(async (response) => {
			if (response?.ok) {
				const cache = await caches.open(CACHE_NAME);
				await cache.put(request, response.clone());
			}
			return response;
		})
		.catch(() => null);
	return cached || refresh;
}

self.addEventListener("fetch", (event) => {
	const { request } = event;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (request.mode === "navigate") {
		event.respondWith(networkFirst(request));
		return;
	}
	event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const targetUrl = new URL(
		event.notification.data?.url || "/#dashboard-timeline-section",
		self.location.origin,
	).href;
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
			(clients) => {
				const existing = clients.find(
					(client) => new URL(client.url).origin === self.location.origin,
				);
				if (existing) {
					existing.navigate(targetUrl);
					return existing.focus();
				}
				return self.clients.openWindow(targetUrl);
			},
		),
	);
});
