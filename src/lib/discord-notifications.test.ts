import { describe, expect, it } from "vitest";
import { notificationListStatus, validateDiscordWebhookUrl } from "./discord-notifications";

describe("discord notification helpers", () => {
  it("matches only doing and done list names case-insensitively", () => {
    expect(notificationListStatus("doing")).toBe("doing");
    expect(notificationListStatus("Doing")).toBe("doing");
    expect(notificationListStatus(" DONE ")).toBe("done");
    expect(notificationListStatus("Doing 1")).toBeNull();
    expect(notificationListStatus("Done済み")).toBeNull();
    expect(notificationListStatus("todo")).toBeNull();
  });

  it("validates Discord webhook URLs", () => {
    expect(validateDiscordWebhookUrl("https://discord.com/api/webhooks/123456/token-value")).toBe(
      "https://discord.com/api/webhooks/123456/token-value",
    );
    expect(validateDiscordWebhookUrl(" https://discordapp.com/api/webhooks/123456/token_value ")).toBe(
      "https://discordapp.com/api/webhooks/123456/token_value",
    );
    expect(() => validateDiscordWebhookUrl("https://example.com/webhooks/123/token")).toThrow("Invalid Discord webhook URL.");
  });
});
