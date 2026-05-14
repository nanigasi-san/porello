import { NextResponse } from "next/server";
import { sendDueSoonDiscordNotifications } from "@/lib/discord-notifications";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const result = await sendDueSoonDiscordNotifications();
  return NextResponse.json({ ok: true, ...result });
}
