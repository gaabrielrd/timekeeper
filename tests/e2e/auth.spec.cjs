const { test, expect } = require("@playwright/test");

async function loginWithGoogleEmulator(page, projectName) {
	await page.goto("/?emulators=1");
	await page.locator("#privacy-decline").click();

	const popupPromise = page.waitForEvent("popup");
	await page.locator("#auth-button").click();
	const popup = await popupPromise;
	await popup.waitForLoadState("domcontentloaded");
	await popup.getByText("Add new account", { exact: true }).click();

	const suffix = `${projectName}-${Date.now()}`.replace(/[^a-z0-9-]/gi, "-");
	const email = `${suffix}@example.com`;
	await popup.locator("#email-input").fill(email);
	await popup.locator("#display-name-input").fill("Pessoa E2E");
	const closePromise = popup.waitForEvent("close");
	await popup.locator("#sign-in").click();
	await closePromise;

	await expect(page.locator("#account-label")).toHaveText("Pessoa");
	return email;
}

test("usuário cria, edita, reordena e oculta contadores", async (
	{ page },
	testInfo,
) => {
	await loginWithGoogleEmulator(page, testInfo.project.name);
	await page.locator("#auth-button").click();
	await expect(page.locator("#account-sidebar")).toHaveAttribute(
		"aria-hidden",
		"false",
	);

	await page.locator("#open-counter-modal").click();
	await expect(page.locator("#counter-dialog")).toBeVisible();
	const defaultStart = await page
		.locator('[name="startAt"]')
		.inputValue();
	expect(Math.abs(new Date(defaultStart).getTime() - Date.now())).toBeLessThan(
		2 * 60 * 1000,
	);
	await page.locator('[name="name"]').fill("Entrega E2E");
	await page.locator("#counter-color-enabled").check();
	await page.locator("#counter-color").fill("#22c55e");
	await page.locator("#counter-submit").click();

	await expect(page.locator("#counter-dialog")).toBeHidden();
	await expect(page.locator("#counter-count")).toHaveText("1 / 5");
	await expect(page.locator("#custom-panels .panel-title")).toHaveText(
		"Entrega E2E",
	);
	await expect(page.locator("#custom-visibility-button")).toBeVisible();

	await page.getByRole("button", { name: "Editar Entrega E2E" }).click();
	await page.locator('[name="name"]').fill("Rotina E2E");
	await page.locator("#counter-type").selectOption("recurring");
	await page.locator('[name="startTime"]').fill("09:00");
	await page.locator('[name="endTime"]').fill("18:00");
	await page.locator("#counter-submit").click();
	await expect(page.locator("#counter-dialog")).toBeHidden();
	await expect(page.locator("#counter-list")).toContainText("Rotina E2E");
	await expect(page.locator("#counter-list")).toContainText(
		"Seg–Sex · 09:00–18:00",
	);

	await page.locator("#open-counter-modal").click();
	await page.locator('[name="name"]').fill("Segundo E2E");
	await page.locator("#counter-submit").click();
	await expect(page.locator("#counter-count")).toHaveText("2 / 5");
	await page
		.getByRole("button", { name: "Mover Segundo E2E para cima" })
		.click();
	await expect(page.locator("#counter-list strong").first()).toHaveText(
		"Segundo E2E",
	);

	await page.locator("#sidebar-close").click();
	await page.locator("#custom-visibility-button").click();
	await expect(page.locator("#custom-counters-section")).toHaveAttribute(
		"aria-hidden",
		"true",
	);
	await page.locator("#custom-visibility-button").click();
	await expect(page.locator("#custom-counters-section")).toHaveAttribute(
		"aria-hidden",
		"false",
	);

	await page.reload();
	await expect(page.locator("#account-label")).toHaveText("Pessoa");
	await expect(page.locator("#custom-panels .panel-title").first()).toHaveText(
		"Segundo E2E",
	);
});

test("usuário exclui a própria conta e os dados", async ({ page }, testInfo) => {
	const email = await loginWithGoogleEmulator(page, testInfo.project.name);
	await page.locator("#auth-button").click();
	await expect(page.locator("#delete-account-button")).toBeVisible();

	page.once("dialog", (dialog) => dialog.accept());
	const popupPromise = page.waitForEvent("popup");
	await page.locator("#delete-account-button").click();
	const popup = await popupPromise;
	await popup.waitForLoadState("domcontentloaded");
	const closePromise = popup.waitForEvent("close");
	await popup.getByText(email, { exact: true }).click();
	await closePromise;

	await expect(page.locator("#account-label")).toHaveText(
		"Entrar com Google",
	);
	await expect(page.locator("#app-toast")).toContainText(
		"Conta e dados excluídos permanentemente.",
	);
});

test("usuário envia, reutiliza e remove uma imagem dos contadores", async (
	{ page },
	testInfo,
) => {
	await loginWithGoogleEmulator(page, testInfo.project.name);
	await page.locator("#auth-button").click();
	await page.locator("#open-image-library").click();
	await expect(page.locator("#image-library-dialog")).toBeVisible();
	await page.locator("#image-upload-input").setInputFiles({
		name: "fundo-e2e.png",
		mimeType: "image/png",
		buffer: Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
			"base64",
		),
	});
	await expect(page.locator("#image-library-grid")).toContainText("fundo-e2e.png");
	await expect(page.locator("#image-library-usage")).not.toHaveText(
		"0 B de 50 MB usados",
	);
	await page.locator("#image-library-close").click();

	await page.locator("#auth-button").click();
	await page.locator("#open-counter-modal").click();
	await page.locator('[name="name"]').fill("Imagem E2E");
	await page.locator("#choose-counter-image").click();
	await page.getByRole("button", { name: "Usar fundo-e2e.png neste contador" }).click();
	await page.locator("#counter-image-opacity").fill("72");
	await page.locator("#counter-overlay-opacity").fill("44");
	await expect(page.locator("#counter-preview-title")).toHaveText("Imagem E2E");
	await expect(page.locator("#counter-preview-image")).toHaveCSS("opacity", "0.72");
	await expect(page.locator("#counter-preview-overlay")).toHaveCSS("opacity", "0.44");
	await page.locator("#counter-submit").click();
	const card = page.locator("#custom-panels .user-panel");
	await expect(card.locator(".counter-card-image")).toHaveCSS("opacity", "0.72");
	await expect(card.locator(".counter-card-overlay")).toHaveCSS("opacity", "0.44");
	await page.locator("#sidebar-close").click();
	await expect(page.locator("#account-sidebar")).toHaveAttribute(
		"aria-hidden",
		"true",
	);
	await expect(page.locator("#sidebar-backdrop")).toHaveCSS(
		"pointer-events",
		"none",
	);

	await card.getByRole("button", { name: "Remover imagem do contador Imagem E2E" }).click();
	await expect(card.locator(".counter-card-media")).toHaveCount(0);
	await expect(page.locator("#counter-count")).toHaveText("1 / 5");
});
