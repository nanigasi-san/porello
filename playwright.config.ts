import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2eSqlitePath = path.join(process.cwd(), ".porello-data", "porello-e2e.sqlite");

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://localhost:3100",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      PORELLO_E2E_TEST_DB: "1",
      PORELLO_SQLITE_PATH: e2eSqlitePath,
    },
  },
});
