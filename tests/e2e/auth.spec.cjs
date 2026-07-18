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

async function grantAdminByEmail(email) {
	const authResponse = await fetch(
		"http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-timekeeper/accounts:batchGet?maxResults=1000&key=AIzaSyBOLyOQ6-g3VqotQf7pCej4CAhVXvC0oYY",
		{ headers: { Authorization: "Bearer owner" } },
	);
	const authData = await authResponse.json();
	const account = authData.users?.find((user) => user.email === email);
	if (!account) throw new Error(`Conta ${email} não encontrada no Auth Emulator.`);
	const profileUrl =
		`http://127.0.0.1:8080/v1/projects/demo-timekeeper/databases/(default)/documents/users/${account.localId}` +
		"?updateMask.fieldPaths=isAdmin";
	const profileResponse = await fetch(profileUrl, {
		method: "PATCH",
		headers: {
			Authorization: "Bearer owner",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ fields: { isAdmin: { booleanValue: true } } }),
	});
	if (!profileResponse.ok) {
		throw new Error(`Falha ao conceder admin no emulador: ${profileResponse.status}`);
	}
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
	await page.locator('#counter-form [name="startTime"]').fill("09:00");
	await page.locator('#counter-form [name="endTime"]').fill("18:00");
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

test("administrador gerencia a configuração geral", async ({ page }, testInfo) => {
	const email = await loginWithGoogleEmulator(page, testInfo.project.name);
	await expect(page.locator("#settings-state")).toHaveText("Sincronizado");
	await grantAdminByEmail(email);
	await page.locator("#auth-button").click();
	await expect(page.locator("#open-admin-modal")).toBeVisible();
	await page.locator("#open-admin-modal").click();
	await expect(page.locator("#admin-dialog")).toBeVisible();
	await expect(page.locator('[role="tab"]')).toHaveCount(3);

	await page.getByRole("tab", { name: "Pagamentos" }).click();
	await expect(page.locator("#admin-payment-list .admin-date-row")).not.toHaveCount(0);
	const date = testInfo.project.name === "chromium" ? "2027-01-05" : "2027-01-06";
	const editedDate =
		testInfo.project.name === "chromium" ? "2027-01-07" : "2027-01-08";
	await page.locator('#admin-payment-form [name="date"]').fill(date);
	await page
		.locator('#admin-payment-form button[type="submit"]')
		.click();
	const createdLabel = new Intl.DateTimeFormat("pt-BR", {
		weekday: "short",
		day: "2-digit",
		month: "long",
		year: "numeric",
	}).format(new Date(`${date}T12:00:00`));
	await page.getByRole("button", { name: `Editar ${createdLabel}` }).click();
	await expect(
		page.locator("#admin-payment-form .admin-date-cancel"),
	).toBeVisible();
	const formLayout = await page.locator("#admin-payment-form").evaluate((form) => {
		const input = form.querySelector('input[name="date"]').getBoundingClientRect();
		const save = form
			.querySelector('button[type="submit"]')
			.getBoundingClientRect();
		const cancel = form
			.querySelector(".admin-date-cancel")
			.getBoundingClientRect();
		const card = form.getBoundingClientRect();
		return {
			bottoms: [input.bottom, save.bottom, cancel.bottom],
			cardRight: card.right,
			cancelRight: cancel.right,
			inputPaddingTop: Number.parseFloat(getComputedStyle(form.querySelector('input[name="date"]')).paddingTop),
		};
	});
	expect(Math.max(...formLayout.bottoms) - Math.min(...formLayout.bottoms)).toBeLessThan(2);
	expect(formLayout.cancelRight).toBeLessThanOrEqual(formLayout.cardRight);
	expect(formLayout.inputPaddingTop).toBeGreaterThanOrEqual(12);
	await page.locator('#admin-payment-form [name="date"]').fill(editedDate);
	await page
		.locator('#admin-payment-form button[type="submit"]')
		.click();
	const editedLabel = new Intl.DateTimeFormat("pt-BR", {
		weekday: "short",
		day: "2-digit",
		month: "long",
		year: "numeric",
	}).format(new Date(`${editedDate}T12:00:00`));
	page.once("dialog", (dialog) => dialog.accept());
	await page.getByRole("button", { name: `Remover ${editedLabel}` }).click();
	await expect(
		page.getByRole("button", { name: `Remover ${editedLabel}` }),
	).toHaveCount(0);

	await page.getByRole("tab", { name: "Feriados" }).click();
	await expect(page.locator("#admin-holiday-list .admin-date-row")).not.toHaveCount(0);
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
