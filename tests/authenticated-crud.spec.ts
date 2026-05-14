import { expect, test, type Locator, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/signin");
  await page.getByRole("button", { name: "テストログイン" }).click({ noWaitAfter: true });
  await expect(page).toHaveURL(/\/boards$/);
  await expect(page.getByRole("heading", { name: "ボード", exact: true })).toBeVisible();
}

async function createBoard(page: Page, name: string) {
  await page.getByPlaceholder("新しいボード名").fill(name);
  await page.getByRole("button", { name: "作成" }).click({ noWaitAfter: true });
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function openBoardMenu(page: Page) {
  await page.getByTestId("board-menu-button").click();
  await expect(page.getByTestId("delete-board-button")).toBeVisible({ timeout: 1_000 }).catch(async () => {
    await page.getByTestId("board-menu-button").click();
    await expect(page.getByTestId("delete-board-button")).toBeVisible();
  });
}

async function openListMenu(page: Page, listName: string) {
  const list = page.getByRole("region", { name: `リスト ${listName}` });
  await list.getByRole("button", { name: "リストメニュー" }).click();
}

function listRegion(page: Page, listName: string) {
  return page.getByRole("region", { name: `リスト ${listName}` });
}

async function dragToLocator(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error("Missing drag target bounds.");
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 18,
  });
  await page.mouse.up();
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
    await page.getByTestId("delete-board-button").click();

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
    await page.getByTestId("delete-board-button").click();
    await expect(page).toHaveURL(/\/boards$/);
  });

  test("renames and reorders lists", async ({ page }) => {
    const suffix = Date.now();
    const boardName = `E2E list controls board ${suffix}`;
    const firstListName = `Alpha ${suffix}`;
    const secondListName = `Beta ${suffix}`;
    const renamedListName = `Renamed ${suffix}`;

    await login(page);
    await createBoard(page, boardName);

    for (const listName of [firstListName, secondListName]) {
      await page.getByPlaceholder("新しいリスト").fill(listName);
      await page.getByRole("button", { name: "リストを追加" }).click();
      await expect(listRegion(page, listName)).toBeVisible();
    }

    await listRegion(page, firstListName).getByLabel("リスト名").fill(renamedListName);
    await listRegion(page, firstListName).getByLabel("リスト名").press("Enter");
    await expect(listRegion(page, renamedListName)).toBeVisible();

    await dragToLocator(
      page,
      listRegion(page, renamedListName).getByRole("button", { name: "リストを移動" }),
      listRegion(page, secondListName),
    );

    await expect(async () => {
      const renamedBox = await listRegion(page, renamedListName).boundingBox();
      const secondBox = await listRegion(page, secondListName).boundingBox();

      if (!renamedBox || !secondBox) {
        throw new Error("Missing list bounds.");
      }

      expect(secondBox.x).toBeLessThan(renamedBox.x);
    }).toPass();

    await page.reload();
    await expect(listRegion(page, renamedListName)).toBeVisible();
    const renamedBoxAfterReload = await listRegion(page, renamedListName).boundingBox();
    const secondBoxAfterReload = await listRegion(page, secondListName).boundingBox();

    if (!renamedBoxAfterReload || !secondBoxAfterReload) {
      throw new Error("Missing list bounds after reload.");
    }

    expect(secondBoxAfterReload.x).toBeLessThan(renamedBoxAfterReload.x);

    await openBoardMenu(page);
    await page.getByTestId("delete-board-button").click();
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
    await page.getByTestId("delete-board-button").click();
    await expect(page).toHaveURL(/\/boards$/);
  });

  test("edits card details with metadata sections", async ({ page }) => {
    const suffix = Date.now();
    const boardName = `E2E details board ${suffix}`;
    const listName = `Details ${suffix}`;
    const cardName = `Detailed card ${suffix}`;
    const checklistItem = `Review spec ${suffix}`;

    await login(page);
    await createBoard(page, boardName);

    await page.getByPlaceholder("新しいリスト").fill(listName);
    await page.getByRole("button", { name: "リストを追加" }).click();
    const list = page.getByRole("region", { name: `リスト ${listName}` });
    await expect(list).toBeVisible();

    await list.getByPlaceholder("カードを追加").fill(cardName);
    await list.getByRole("button", { name: `${listName}にカードを追加` }).click();
    await page.getByRole("button", { name: new RegExp(cardName) }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("締め切り").fill("2026-05-20T10:30");
    await dialog.getByLabel("担当者").selectOption({ label: "Test User" });
    await dialog.getByLabel("説明").fill(`Spec: https://example.com/porello/${suffix}`);
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog.getByRole("link", { name: `https://example.com/porello/${suffix}` })).toBeVisible();

    await dialog.getByPlaceholder("ラベル名").fill("Urgent");
    await dialog.getByRole("button", { name: "追加", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Urgent" })).toBeVisible();

    await dialog.getByPlaceholder("チェック項目を追加").fill(checklistItem);
    await dialog.getByRole("button", { name: "チェック項目を追加" }).click();
    await dialog.getByLabel(`${checklistItem}を完了`).check();

    await dialog.getByPlaceholder("コメントを追加").fill("Looks good");
    await dialog.getByRole("button", { name: "コメント" }).click();
    await expect(dialog.getByText("Looks good")).toBeVisible();

    await dialog.getByRole("button", { name: "閉じる" }).click();
    await expect(page.getByRole("button", { name: new RegExp(cardName) })).toContainText("Urgent");
    await expect(page.getByRole("button", { name: new RegExp(cardName) })).toContainText("Test User");

    await page.getByPlaceholder("カード検索").fill("Urgent");
    await expect(page.getByText(cardName)).toBeVisible();
    await page.getByRole("button", { name: "検索をクリア" }).click();

    await page.getByRole("button", { name: new RegExp(cardName) }).click();
    await expect(dialog.getByRole("link", { name: `https://example.com/porello/${suffix}` })).toBeVisible();
    await expect(dialog.getByLabel(`${checklistItem}を完了`)).toBeChecked();
    await dialog.getByRole("button", { name: "コメントを削除" }).click();
    await expect(dialog.getByText("Looks good")).not.toBeVisible();

    await dialog.getByRole("button", { name: "閉じる" }).click();
    await openBoardMenu(page);
    await page.getByTestId("delete-board-button").click();
    await expect(page).toHaveURL(/\/boards$/);
  });
});
