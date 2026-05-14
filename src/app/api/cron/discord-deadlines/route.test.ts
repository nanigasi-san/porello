import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendDueSoonDiscordNotifications } from "@/lib/discord-notifications";
import { GET } from "./route";

vi.mock("@/lib/discord-notifications", () => ({
  sendDueSoonDiscordNotifications: vi.fn(),
}));

const sendDueSoonMock = vi.mocked(sendDueSoonDiscordNotifications);

describe("GET /api/cron/discord-deadlines", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    sendDueSoonMock.mockResolvedValue({ checked: 2, sent: 1 });
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.clearAllMocks();
  });

  it("returns 401 without the cron secret bearer token", async () => {
    const response = await GET(new Request("http://localhost/api/cron/discord-deadlines"));

    expect(response.status).toBe(401);
    expect(sendDueSoonMock).not.toHaveBeenCalled();
  });

  it("runs due soon notifications with the correct cron secret", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/discord-deadlines", {
        headers: { authorization: "Bearer test-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true, checked: 2, sent: 1 });
    expect(response.status).toBe(200);
    expect(sendDueSoonMock).toHaveBeenCalledTimes(1);
  });
});
