import { notFound, redirect } from "next/navigation";
import { setTestLoginCookie } from "@/lib/session";

export async function POST() {
  const enabled = await setTestLoginCookie();

  if (!enabled) {
    notFound();
  }

  redirect("/boards");
}
