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
