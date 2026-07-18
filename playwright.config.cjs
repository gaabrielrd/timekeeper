const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? "github" : "list",
	timeout: 30000,
	use: {
		baseURL: "http://127.0.0.1:4173",
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
	webServer: [
		{
			command: "node scripts/serve-public.cjs",
			url: "http://127.0.0.1:4173",
			reuseExistingServer: !process.env.CI,
			timeout: 30000,
		},
		{
			command:
				"firebase emulators:start --project demo-timekeeper --only auth,firestore",
			url: "http://127.0.0.1:4000",
			reuseExistingServer: !process.env.CI,
			timeout: 60000,
		},
	],
});
