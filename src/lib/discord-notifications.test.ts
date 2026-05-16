import { describe, expect, it } from "vitest";
import {
  assignedNotificationTitle,
  buildDiscordAssigneeMentionOptions,
  buildDiscordCardUrl,
  buildAssignedDiscordWebhookOptions,
  dueSoonNotificationTitle,
  movedNotificationTitle,
  notificationListStatus,
  validateDiscordWebhookUrl,
} from "./discord-notifications";

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

  it("builds card-specific board URLs", () => {
    expect(buildDiscordCardUrl("https://porello.example", "board-1", "card-1")).toBe(
      "https://porello.example/boards/board-1?card=card-1",
    );
    expect(buildDiscordCardUrl("https://porello.example/", "board-1", "card-1")).toBe(
      "https://porello.example/boards/board-1?card=card-1",
    );
  });

  it("formats concise Discord notification titles", () => {
    expect(assignedNotificationTitle("New card", "山田海音")).toBe("[New card] に [山田海音] がアサインされました");
    expect(movedNotificationTitle("task2", "doing")).toBe("[task2] が [doing] に移動されました");
    expect(dueSoonNotificationTitle("Due task")).toBe("[Due task] の締め切りが近づいています");
  });

  it("builds assignment mention options only when a Discord user id is available", () => {
    expect(buildAssignedDiscordWebhookOptions("New card", "山田海音", "1234567890")).toEqual({
      content: "<@1234567890> [New card] に [山田海音] がアサインされました",
      allowedMentions: { users: ["1234567890"] },
    });
    expect(buildAssignedDiscordWebhookOptions("New card", "山田海音", null)).toEqual({});
  });

  it("builds assignee mention options for any card notification title", () => {
    expect(buildDiscordAssigneeMentionOptions("[task2] が [doing] に移動されました", "1234567890")).toEqual({
      content: "<@1234567890> [task2] が [doing] に移動されました",
      allowedMentions: { users: ["1234567890"] },
    });
    expect(buildDiscordAssigneeMentionOptions("[Due task] の締め切りが近づいています", null)).toEqual({});
  });
});
