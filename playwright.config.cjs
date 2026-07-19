const { defineConfig, devices } = require("@playwright/test");
const hostingPort = Number(process.env.PORT || 4174);
const hostingUrl = `http://127.0.0.1:${hostingPort}`;

module.exports = defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? "github" : "list",
	timeout: 30000,
	use: {
		baseURL: hostingUrl,
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "mobile-chromium",
			use: { ...devices["iPhone 13"], browserName: "chromium" },
		},
	],
	webServer: {
		command: "node scripts/serve-public.cjs",
		env: { ...process.env, PORT: String(hostingPort) },
		url: hostingUrl,
		reuseExistingServer: false,
		timeout: 30000,
	},
});
