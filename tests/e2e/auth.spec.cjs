const { test, expect } = require("@playwright/test");

async function confirmPendingAction(page) {
	const dialog = page.locator("#confirmation-dialog");
	await expect(dialog).toBeVisible();
	await dialog.locator("#confirmation-dialog-confirm").click();
	await expect(dialog).toBeHidden();
}

async function loginWithGoogleEmulator(page, projectName) {
	await page.goto("/?emulators=1");
	await page.locator("#privacy-decline").click();

	const popupPromise = page.waitForEvent("popup");
	await page.locator("#auth-button").click();
	const popup = await popupPromise;
	await popup.waitForLoadState("domcontentloaded");
	await popup.getByText("Add new account", { exact: true }).click();

	const suffix = `${projectName}-${Date.now()}-${Math.random().toString(36).slice(2)}`
		.replace(/[^a-z0-9-]/gi, "-");
	const email = `${suffix}@example.com`;
	await popup.locator("#email-input").fill(email);
	await popup.locator("#display-name-input").fill("Pessoa E2E");
	const closePromise = popup.waitForEvent("close");
	await popup.locator("#sign-in").click();
	await closePromise;

	await expect(page.locator("#account-label")).toHaveText("Pessoa");
	await expect(page.locator("#settings-state")).toHaveText("Sincronizado", {
		timeout: 15000,
	});
	await expect(page.locator("#counter-sidebar-state")).toHaveText("Ao vivo", {
		timeout: 15000,
	});
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

async function mockNotificationPermission(page, result) {
	await page.addInitScript((permissionResult) => {
		let permission = localStorage.getItem("e2e:notification-permission") ||
			(permissionResult === "unsupported" ? "default" : "default");
		if (permissionResult === "unsupported") {
			Object.defineProperty(window, "Notification", {
				configurable: true,
				value: undefined,
			});
			return;
		}
		class MockNotification {}
		Object.defineProperty(MockNotification, "permission", {
			get: () => permission,
		});
		MockNotification.requestPermission = async () => {
			const requests = Number(
				localStorage.getItem("e2e:notification-requests") || 0,
			);
			localStorage.setItem("e2e:notification-requests", String(requests + 1));
			permission = permissionResult;
			localStorage.setItem("e2e:notification-permission", permission);
			return permission;
		};
		Object.defineProperty(window, "Notification", {
			configurable: true,
			value: MockNotification,
		});
	}, result);
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

	await page
		.locator("#counter-list")
		.getByRole("button", { name: "Editar Entrega E2E" })
		.click();
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
	await page.locator("#timeline-source-filter").selectOption("counters");
	const timelineCounter = page
		.locator(
			testInfo.project.name === "mobile-chromium"
				? "#timeline-legend"
				: "#timeline-list",
		)
		.getByRole("button", { name: "Editar Segundo E2E" });
	await expect(timelineCounter).toBeVisible();
	await timelineCounter.click();
	await expect(page.locator("#counter-dialog")).toBeVisible();
	await expect(page.locator('#counter-form [name="name"]')).toHaveValue(
		"Segundo E2E",
	);
});

test("usuário arquiva manualmente apenas contador fixo e exclui a conquista", async (
	{ page },
	testInfo,
) => {
	await loginWithGoogleEmulator(page, testInfo.project.name);
	await page.locator("#auth-button").click();
	await expect(page.locator("#archive-state")).toHaveText("Ao vivo");

	await page.locator("#open-counter-modal").click();
	await page.locator('[name="name"]').fill("Rotina recorrente");
	await page.locator("#counter-type").selectOption("recurring");
	await page.locator("#counter-submit").click();

	await page.locator("#open-counter-modal").click();
	await page.locator('[name="name"]').fill("Meta concluída");
	const completedRange = await page.evaluate(() => {
		const localInput = (date) => {
			const offset = date.getTimezoneOffset() * 60_000;
			return new Date(date.getTime() - offset).toISOString().slice(0, 16);
		};
		return {
			start: localInput(new Date(Date.now() - 120_000)),
			end: localInput(new Date(Date.now() - 60_000)),
		};
	});
	await page.locator('[name="startAt"]').fill(completedRange.start);
	await page.locator('[name="endAt"]').fill(completedRange.end);
	await page.locator("#counter-submit").click();
	await expect(
		page.getByRole("button", {
			name: "Arquivar contador Rotina recorrente",
		}),
	).toHaveCount(0);
	await page.locator("#sidebar-close").click();
	await expect(page.locator("#account-sidebar")).toHaveAttribute(
		"aria-hidden",
		"true",
	);

	const completedCard = page
		.locator("#custom-panels .user-panel")
		.filter({ hasText: "Meta concluída" });
	const cardArchiveButton = completedCard.getByRole("button", {
		name: "Arquivar contador Meta concluída",
	});
	if (testInfo.project.name === "chromium") {
		await expect(cardArchiveButton).toHaveCSS("opacity", "0");
		await completedCard.hover();
	}
	await expect(cardArchiveButton).toHaveCSS("opacity", "1");
	await cardArchiveButton.click();
	await confirmPendingAction(page);
	await expect(page.locator("#counter-count")).toHaveText("1 / 5");
	await expect(page.locator("#archive-count")).toHaveText("1 / 100");
	await expect(page.locator("#archive-list")).toContainText("Meta concluída");
	await expect(page.locator("#archive-list")).toContainText("Arquivado em");
	await page.locator("#open-archive-dialog").click();
	await expect(page.locator("#archive-dialog")).toBeVisible();

	await page
		.getByRole("button", { name: "Excluir Meta concluída permanentemente" })
		.click();
	await confirmPendingAction(page);
	await expect(page.locator("#archive-count")).toHaveText("0 / 100");
	await expect(page.locator("#archive-empty")).toBeVisible();
});

test("usuário personaliza o layout e sincroniza entre abas", async (
	{ page, context },
	testInfo,
) => {
	await loginWithGoogleEmulator(page, testInfo.project.name);
	await page.locator("#auth-button").click();
	await page.locator("#dashboard-layout").selectOption("compact");
	await expect(page.locator("body")).toHaveAttribute(
		"data-dashboard-layout",
		"compact",
	);

	const weatherControl = page.locator(
		'[data-dashboard-section-control="weather"]',
	);
	await weatherControl.getByRole("checkbox").uncheck();
	await expect(page.locator("#dashboard-weather-section")).toHaveClass(
		/is-dashboard-hidden/,
	);
	await weatherControl
		.getByRole("button", { name: "Mover seção para cima" })
		.click();

	const secondPage = await context.newPage();
	await secondPage.goto("/?emulators=1");
	await expect(secondPage.locator("#account-label")).toHaveText("Pessoa");
	await expect(secondPage.locator("body")).toHaveAttribute(
		"data-dashboard-layout",
		"compact",
	);
	await expect(secondPage.locator("#dashboard-weather-section")).toHaveClass(
		/is-dashboard-hidden/,
	);
	const orders = await secondPage.evaluate(() => ({
		timeline: Number(
			getComputedStyle(document.querySelector("#dashboard-timeline-section")).order,
		),
		weather: Number(
			getComputedStyle(document.querySelector("#dashboard-weather-section")).order,
		),
	}));
	expect(orders.weather).toBeLessThan(orders.timeline);

	await page.reload();
	await expect(page.locator("body")).toHaveAttribute(
		"data-dashboard-layout",
		"compact",
	);
	await expect(page.locator("#dashboard-weather-section")).toHaveClass(
		/is-dashboard-hidden/,
	);
	await secondPage.close();
});

test("contador pessoal abre e restaura o modo de foco", async ({ page }, testInfo) => {
	await loginWithGoogleEmulator(page, testInfo.project.name);
	await page.locator("#auth-button").click();
	await page.locator("#open-counter-modal").click();
	await page.locator('[name="name"]').fill("Foco E2E");
	await page.locator("#counter-submit").click();
	await page.locator("#sidebar-close").click();

	const focusTrigger = page.getByRole("button", { name: "Focar contador Foco E2E" });
	if (testInfo.project.name === "chromium") {
		await page.locator("#custom-panels .user-panel").hover();
	}
	await focusTrigger.click();
	await expect(page.locator("#focus-mode-title")).toHaveText("Foco E2E");
	await expect(page.locator("#focus-mode-main")).not.toHaveText("carregando...");
	await page.reload();
	await expect(page.locator("body")).toHaveClass(/focus-mode-active/);
	await expect(page.locator("#focus-mode-title")).toHaveText("Foco E2E");
	await page.getByRole("button", { name: "Sair do modo de foco" }).click();
	await expect(page.locator("body")).not.toHaveClass(/focus-mode-active/);
});

test("notificações só pedem permissão após ativação explícita", async (
	{ page },
	testInfo,
) => {
	await mockNotificationPermission(page, "granted");
	await loginWithGoogleEmulator(page, testInfo.project.name);
	await page.locator("#auth-button").click();
	await expect(page.locator("#notification-state")).toHaveText("Não autorizado");
	await expect
		.poll(() =>
			page.evaluate(() =>
				Number(localStorage.getItem("e2e:notification-requests") || 0),
			),
		)
		.toBe(0);
	await expect(page.locator("#notifications-enabled")).toBeEnabled();
	await page.locator("#notifications-enabled").check();
	await expect(page.locator("#notification-state")).toHaveText("Ativo");
	await expect(page.locator("#notification-delivery-state")).toContainText(
		"Entrega limitada",
	);
	await expect
		.poll(() =>
			page.evaluate(() =>
				Number(localStorage.getItem("e2e:notification-requests") || 0),
			),
		)
		.toBe(1);
	await page.getByText("5 min", { exact: true }).click();
	await expect(page.locator('#notification-controls [value="5"]')).toBeChecked();
	await page.locator("#notification-quiet-enabled").check();
	await page.locator("#notification-quiet-start").fill("21:30");
	await page.locator("#notification-quiet-start").blur();
	await page.reload();
	await expect(page.locator("#notification-state")).toHaveText("Ativo");
	await expect(page.locator('#notification-controls [value="5"]')).toBeChecked();
	await expect(page.locator("#notification-quiet-enabled")).toBeChecked();
	await expect(page.locator("#notification-quiet-start")).toHaveValue("21:30");
});

test("permissão negada não cria novos prompts automáticos", async (
	{ page },
	testInfo,
) => {
	await mockNotificationPermission(page, "denied");
	await loginWithGoogleEmulator(page, testInfo.project.name);
	await page.locator("#auth-button").click();
	await expect(page.locator("#notifications-enabled")).toBeEnabled();
	await page.locator('label[for="notifications-enabled"]').click();
	await expect(page.locator("#notification-state")).toHaveText("Bloqueado");
	await expect(page.locator("#notification-message")).toContainText(
		"não solicitará novamente",
	);
	await page.reload();
	await expect(page.locator("#notification-state")).toHaveText("Bloqueado");
	await expect
		.poll(() =>
			page.evaluate(() =>
				Number(localStorage.getItem("e2e:notification-requests") || 0),
			),
		)
		.toBe(1);
});

test("UI informa quando notificações não são suportadas", async (
	{ page },
	testInfo,
) => {
	await mockNotificationPermission(page, "unsupported");
	await loginWithGoogleEmulator(page, testInfo.project.name);
	await page.locator("#auth-button").click();
	await expect(page.locator("#notification-state")).toHaveText("Não suportado");
	await expect(page.locator("#notifications-enabled")).toBeDisabled();
});

test("usuário gerencia cidades e sincroniza os widgets", async (
	{ page, context },
	testInfo,
) => {
	await loginWithGoogleEmulator(page, testInfo.project.name);
	await page.locator("#auth-button").click();
	await expect(page.locator("#weather-widget-count")).toHaveText("3 / 5");
	await page.locator("#add-weather-widget").click();
	await page.locator('#weather-widget-form [name="label1"]').fill("CURITIBA");
	await page.locator('#weather-widget-form [name="label2"]').fill("PARANÁ");
	await page
		.locator('#weather-widget-form [name="forecastUrl"]')
		.fill("https://example.com/weather/");
	await page.locator('#weather-widget-form [type="submit"]').click();
	await expect(page.locator("#weather-widget-message")).toContainText(
		"Forecast7",
	);

	await page
		.locator('#weather-widget-form [name="forecastUrl"]')
		.fill("https://forecast7.com/pt/n25d43n49d27/curitiba/");
	await page.locator('#weather-widget-form [type="submit"]').click();
	await expect(page.locator("#weather-widget-count")).toHaveText("4 / 5");
	await expect(page.locator('[data-weather-setting-id]')).toHaveCount(4);

	await page.getByRole("button", { name: "Ocultar CURITIBA" }).click();
	await expect(
		page.locator('[data-weather-setting-id]').filter({ hasText: "CURITIBA" }),
	).toContainText("Oculto");
	await page.getByRole("button", { name: "Editar CURITIBA" }).click();
	await page
		.locator('#weather-widget-form [name="label1"]')
		.fill("CURITIBA CENTRO");
	await page.locator('#weather-widget-form [type="submit"]').click();
	await expect(page.locator("#weather-widget-list")).toContainText(
		"CURITIBA CENTRO",
	);

	const secondPage = await context.newPage();
	await secondPage.goto("/?emulators=1");
	await expect(secondPage.locator("#account-label")).toHaveText("Pessoa");
	await secondPage.locator("#auth-button").click();
	await expect(secondPage.locator("#weather-widget-list")).toContainText(
		"CURITIBA CENTRO",
	);
	await expect(secondPage.locator("#weather-widget-count")).toHaveText("4 / 5");
	await secondPage.close();

	await page.getByRole("button", { name: "Remover CURITIBA CENTRO" }).click();
	await confirmPendingAction(page);
	await expect(page.locator("#weather-widget-count")).toHaveText("3 / 5");
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
	await page.getByRole("button", { name: `Remover ${editedLabel}` }).click();
	await confirmPendingAction(page);
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

	const popupPromise = page.waitForEvent("popup");
	await page.locator("#delete-account-button").click();
	await confirmPendingAction(page);
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
