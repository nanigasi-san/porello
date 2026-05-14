import { expect, test, type Locator, type Page } from "./fixtures";

function column(page: Page, name: string): Locator {
  return page.getByTestId(`demo-list-${name.toLowerCase()}`);
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

test.describe("demo mode", () => {
  test("opens from the landing page and exposes the demo board", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Porello" })).toBeVisible();
    await page.getByRole("link", { name: "ログインせずに試す" }).click();

    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByText("保存されないデモボード")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Launch plan" })).toBeVisible();
    await expect(column(page, "Backlog")).toContainText("Google OAuthの環境変数を設定");
    await expect(column(page, "Doing")).toContainText("カード詳細を書く");
    await expect(column(page, "Done")).toContainText("ボードの構成を決める");
  });

  test("filters cards, clears the filter, and shows an empty state", async ({ page }) => {
    await page.goto("/demo");

    await page.getByPlaceholder("カード検索").fill("OAuth");
    await expect(page.getByText("Google OAuthの環境変数を設定")).toBeVisible();
    await expect(page.getByText("カード詳細を書く")).not.toBeVisible();
    await expect(page.getByText("一致するカードはありません")).toHaveCount(2);

    await page.getByRole("button", { name: "検索をクリア" }).click();
    await expect(page.getByText("カード詳細を書く")).toBeVisible();
  });

  test("opens and closes card details", async ({ page }) => {
    await page.goto("/demo");

    await page.getByRole("button", { name: /Google OAuthの環境変数を設定/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("本番URLのcallbackをGoogle Cloud Consoleに追加します。");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("adds a list and a card in demo mode", async ({ page }) => {
    await page.goto("/demo");

    await page.getByPlaceholder("リストを追加").fill("Review");
    await page.getByRole("button", { name: "リストを追加" }).click();
    await expect(page.getByTestId("demo-list-review")).toContainText("Review");
    await expect(page.getByTestId("demo-list-review")).toContainText("一致するカードはありません");

    await page.getByTestId("demo-list-review").getByPlaceholder("カードを追加").fill("追加カードを確認");
    await page.getByRole("button", { name: "Reviewにカードを追加" }).click();
    await expect(page.getByTestId("demo-list-review")).toContainText("追加カードを確認");
    await expect(page.getByText("追加カードを確認")).toHaveCount(1);
  });

  test("moves a card between lists without duplicating it", async ({ page }) => {
    await page.goto("/demo");

    const source = page.getByRole("button", { name: /優先度を見直す/ });
    const targetColumn = column(page, "Doing");

    await dragToLocator(page, source, targetColumn);

    await expect(targetColumn).toContainText("優先度を見直す");
    await expect(page.getByText("優先度を見直す")).toHaveCount(1);
  });

  test("reorders cards within a list", async ({ page }) => {
    await page.goto("/demo");

    const first = page.getByRole("button", { name: /Google OAuthの環境変数を設定/ });
    const third = page.getByRole("button", { name: /優先度を見直す/ });
    await dragToLocator(page, first, third);

    const backlogText = await column(page, "Backlog").innerText();
    expect(backlogText.indexOf("最初のボードを作る")).toBeLessThan(backlogText.indexOf("Google OAuthの環境変数を設定"));
  });

  test("top and login navigation remain available from demo", async ({ page }) => {
    await page.goto("/demo");

    await expect(page.getByRole("link", { name: "トップ" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "ログイン" })).toHaveAttribute("href", "/signin");
  });
});
