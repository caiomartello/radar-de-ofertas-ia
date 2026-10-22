import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
const baseURL = "http://localhost:3100";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: [["list"]],
  use: {
    baseURL,
    actionTimeout: 10000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATABASE_PATH: "./data/e2e.sqlite",
      APP_URL: baseURL,
      NEXT_TELEMETRY_DISABLED: "1",
      MELI_OAUTH_CALLBACK_ORIGIN:
        "https://radar-browser-fixture.trycloudflare.com",
      MELI_OAUTH_GATEWAY_KEY: "8".repeat(64),
    },
  },
  globalSetup: "./e2e/setup.ts",
});
