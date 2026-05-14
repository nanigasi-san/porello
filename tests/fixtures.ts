import { expect, test as base, type Locator, type Page } from "@playwright/test";

export const test = base.extend({
  page: async ({ page, request }, use) => {
    const response = await request.post("/api/test-reset");

    if (!response.ok()) {
      throw new Error(`Failed to reset E2E database: ${response.status()}`);
    }

    await use(page);
  },
});

export { expect, type Locator, type Page };
