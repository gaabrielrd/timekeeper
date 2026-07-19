const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
	await page.goto("/?emulators=1");
	await expect(page).toHaveTitle("Timekeeper");
});

test("visitante acompanha contadores e persiste o expediente", async ({ page }) => {
	await expect(page.locator("#top-panels .a-panel")).toHaveCount(3);
	await expect(page.locator("#top-panels .panel-main").first()).not.toHaveText(
		"carregando...",
	);
	await expect(page.locator("#guest-time-config")).toBeVisible();
	await expect(page.locator("#custom-counters-section")).toHaveAttribute(
		"aria-hidden",
		"true",
	);

	await page.locator("#guest-config-hora").selectOption("19");
	await page.locator("#guest-config-minutos").selectOption("25");
	await expect(page.locator("#config-hora")).toHaveValue("19");
	await expect(page.locator("#config-minutos")).toHaveValue("25");

	await page.reload();
	await expect(page.locator("#guest-config-hora")).toHaveValue("19");
	await expect(page.locator("#guest-config-minutos")).toHaveValue("25");
});

test("modo de foco restaura o contador e fecha por Escape sem overflow", async (
	{ page },
	testInfo,
) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.evaluate(() => {
		document.body.dataset.backgroundEnabled = "true";
	});
	const focusTrigger = page.getByRole("button", {
		name: "Focar contador Expediente",
	});
	if (testInfo.project.name === "chromium") {
		await expect(focusTrigger).toBeHidden();
		await page.locator('[data-focus-id="standard:workday"]').hover();
	}
	await expect(focusTrigger).toBeVisible();
	await focusTrigger.click();
	await expect(page.locator("body")).toHaveClass(/focus-mode-active/);
	await expect(page.locator("#focus-mode")).toHaveAttribute("aria-hidden", "false");
	await expect(page.locator("#focus-mode-title")).toHaveText("Expediente");
	await expect(page.locator("#focus-mode-main")).not.toHaveText("carregando...");
	const ambientOpacity = await page
		.locator("#ambient-background")
		.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity));
	expect(ambientOpacity).toBeGreaterThan(0);
	await expect
		.poll(() =>
			page.evaluate(() => sessionStorage.getItem("timekeeper:focus-counter")),
		)
		.toBe("standard:workday");
	const reducedTransition = await page
		.locator("#focus-mode")
		.evaluate((element) => getComputedStyle(element).transitionDuration);
	expect(Number.parseFloat(reducedTransition)).toBeLessThanOrEqual(0.001);

	await page.reload();
	await expect(page.locator("body")).toHaveClass(/focus-mode-active/);
	await expect(page.locator("#focus-mode-title")).toHaveText("Expediente");
	const dimensions = await page.evaluate(() => ({
		clientWidth: document.documentElement.clientWidth,
		scrollWidth: document.documentElement.scrollWidth,
	}));
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

	await page.keyboard.press("Escape");
	await expect(page.locator("body")).not.toHaveClass(/focus-mode-active/);
	await expect(page.locator("#focus-mode")).toHaveAttribute("aria-hidden", "true");
	await expect
		.poll(() =>
			page.evaluate(() => sessionStorage.getItem("timekeeper:focus-counter")),
		)
		.toBeNull();
});

test("layout não cria overflow horizontal", async ({ page }, testInfo) => {
	const dimensions = await page.evaluate(() => ({
		clientWidth: document.documentElement.clientWidth,
		scrollWidth: document.documentElement.scrollWidth,
	}));
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
	if (testInfo.project.name === "mobile-chromium") {
		await expect(page.locator("#toggle-config")).toBeHidden();
	} else {
		await expect(page.locator("#toggle-config")).toBeVisible();
	}
	await expect(page.locator("#auth-button")).toBeVisible();
});

test("viewports de 320 e 768 px permanecem sem overflow", async ({ page }) => {
	for (const width of [320, 768]) {
		await page.setViewportSize({ width, height: 900 });
		await expect
			.poll(() =>
				page.evaluate(() => ({
					clientWidth: document.documentElement.clientWidth,
					scrollWidth: document.documentElement.scrollWidth,
				})),
			)
			.toMatchObject({ clientWidth: width, scrollWidth: width });
		await expect(page.locator("#dashboard-timeline-section")).toBeVisible();
	}
});

test("timeline SVG adapta orientação, recorrências e próximos marcos", async ({ page }) => {
	await expect(page.locator("#dashboard-timeline-section")).toBeVisible();
	const timeline = page.locator("#timeline-svg");
	await expect(timeline).toBeVisible();
	const viewport = page.viewportSize();
	await expect(timeline).toHaveAttribute(
		"data-orientation",
		viewport.width <= 700 ? "vertical" : "horizontal",
	);
	await expect(page.locator("#timeline-range")).toContainText("escala automática");
	await page.locator("#timeline-source-filter").selectOption("workday");
	await expect
		.poll(() => page.locator("#timeline-svg .timeline-svg-segment").count())
		.toBeGreaterThan(1);
	await page.locator("#timeline-source-filter").selectOption("calendar");
	await expect(page.locator("#timeline-list")).toContainText(/Pagamento|Feriado/);
	await expect(page.locator('#timeline-svg [data-source-type="payment"]')).toHaveCount(1);
	await expect(page.locator('#timeline-svg [data-source-type="holiday"]')).toHaveCount(1);
});

test("calendário destaca hoje, abre o dia e reduz para semana no celular", async ({
	page,
}) => {
	await page.locator("#privacy-decline").click();
	await page.getByRole("button", { name: "Calendário mensal" }).click();
	await expect(
		page.getByRole("button", { name: "Calendário mensal" }),
	).toHaveAttribute("aria-pressed", "true");
	const calendar = page.locator(".timeline-calendar");
	await expect(calendar).toBeVisible();
	const mobile = page.viewportSize().width <= 700;
	await expect(calendar).toHaveAttribute(
		"data-calendar-mode",
		mobile ? "week" : "month",
	);
	await expect(page.locator("#timeline-range")).toContainText("fuso local");
	await expect(page.locator('.timeline-calendar-day[aria-current="date"]')).toHaveCount(1);
	await expect(page.locator(".timeline-calendar-day")).toHaveCount(
		mobile ? 7 : 35,
	);
	const eventDay = page.locator(".timeline-calendar-day.has-events").first();
	await expect(eventDay).toBeVisible();
	await eventDay.click();
	await expect(eventDay).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator("#timeline-calendar-details")).toBeVisible();
	await expect(page.locator(".timeline-calendar-detail-item").first()).toBeVisible();
});

test("PWA registra o shell e reabre offline", async ({ page, context }) => {
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const registration = await navigator.serviceWorker.ready;
				return registration.active?.scriptURL || "";
			}),
		)
		.toContain("/sw.js");
	await expect
		.poll(() => page.evaluate(async () => (await caches.keys()).length))
		.toBeGreaterThan(0);

	await context.setOffline(true);
	await page.reload();
	await expect(page).toHaveTitle("Timekeeper");
	await expect(page.locator("#weather-offline-message")).toBeVisible();
	await context.setOffline(false);
});

test("Analytics não carrega antes da escolha e recusa persiste", async ({ page }) => {
	await expect(page.locator("#privacy-banner")).toBeVisible();
	await expect(page.locator("#google-analytics-script")).toHaveCount(0);
	await page.locator("#privacy-decline").click();
	await expect(page.locator("#privacy-banner")).toBeHidden();
	await expect
		.poll(() =>
			page.evaluate(() =>
				localStorage.getItem("timekeeper:analytics-consent"),
			),
		)
		.toBe("denied");
	await page.reload();
	await expect(page.locator("#privacy-banner")).toBeHidden();
	await expect(page.locator("#google-analytics-script")).toHaveCount(0);
});

test("aceite carrega Analytics somente após a decisão", async ({ page }) => {
	await page.route("https://www.googletagmanager.com/**", (route) =>
		route.fulfill({ status: 204, body: "" }),
	);
	await expect(page.locator("#google-analytics-script")).toHaveCount(0);
	await page.locator("#privacy-accept").click();
	await expect(page.locator("#google-analytics-script")).toHaveCount(1);
	await expect
		.poll(() =>
			page.evaluate(() =>
				localStorage.getItem("timekeeper:analytics-consent"),
			),
		)
		.toBe("granted");
	await expect(page.locator("#privacy-banner")).toBeHidden();
});
