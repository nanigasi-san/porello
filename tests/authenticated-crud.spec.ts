import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/signin");
  await page.getByRole("button", { name: "テストログイン" }).click();
  await expect(page).toHaveURL(/\/boards$/);
  await expect(page.getByRole("heading", { name: "ボード" })).toBeVisible();
}

async function createBoard(page: Page, name: string) {
  await page.getByPlaceholder("新しいボード名").fill(name);
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function openBoardMenu(page: Page) {
  await page.getByRole("button", { name: "ボードメニュー" }).click();
}

async function openListMenu(page: Page, listName: string) {
  const list = page.getByRole("region", { name: `リスト ${listName}` });
  await list.getByRole("button", { name: "リストメニュー" }).click();
}

test.describe("authenticated CRUD", () => {
  test("logs in with the development test account", async ({ page }) => {
    await login(page);

    await expect(page.getByText("Test User")).toBeVisible();
    await expect(page.getByPlaceholder("新しいボード名")).toBeVisible();
  });

  test("creates and deletes a board", async ({ page }) => {
    const boardName = `E2E board ${Date.now()}`;

    await login(page);
    await createBoard(page, boardName);

    await openBoardMenu(page);
    await page.getByRole("button", { name: "ボードを削除" }).click();

    await expect(page).toHaveURL(/\/boards$/);
    await expect(page.getByText(boardName)).not.toBeVisible();
  });

  test("creates and deletes a list", async ({ page }) => {
    const suffix = Date.now();
    const boardName = `E2E list board ${suffix}`;
    const listName = `Todo ${suffix}`;

    await login(page);
    await createBoard(page, boardName);

    await page.getByPlaceholder("新しいリスト").fill(listName);
    await page.getByRole("button", { name: "リストを追加" }).click();
    await expect(page.getByRole("region", { name: `リスト ${listName}` })).toBeVisible();

    await openListMenu(page, listName);
    await page.getByRole("button", { name: "削除" }).click();
    await expect(page.getByRole("region", { name: `リスト ${listName}` })).not.toBeVisible();

    await openBoardMenu(page);
    await page.getByRole("button", { name: "ボードを削除" }).click();
    await expect(page).toHaveURL(/\/boards$/);
  });

  test("creates and deletes a card", async ({ page }) => {
    const suffix = Date.now();
    const boardName = `E2E card board ${suffix}`;
    const listName = `Doing ${suffix}`;
    const cardName = `Card ${suffix}`;

    await login(page);
    await createBoard(page, boardName);

    await page.getByPlaceholder("新しいリスト").fill(listName);
    await page.getByRole("button", { name: "リストを追加" }).click();
    await expect(page.getByRole("region", { name: `リスト ${listName}` })).toBeVisible();

    const list = page.getByRole("region", { name: `リスト ${listName}` });
    await list.getByPlaceholder("カードを追加").fill(cardName);
    await list.getByRole("button", { name: `${listName}にカードを追加` }).click();
    await expect(page.getByText(cardName)).toBeVisible();

    await page.getByRole("button", { name: new RegExp(cardName) }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "削除" }).click();
    await expect(page.getByText(cardName)).not.toBeVisible();

    await openBoardMenu(page);
    await page.getByRole("button", { name: "ボードを削除" }).click();
    await expect(page).toHaveURL(/\/boards$/);
  });
});
