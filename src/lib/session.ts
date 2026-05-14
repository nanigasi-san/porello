import { cookies } from "next/headers";
import type { Session } from "next-auth";
import { auth } from "@/auth";

const TEST_LOGIN_COOKIE = "porello_test_user";

export async function getCurrentSession(): Promise<Session | null> {
  const session = await auth();

  if (session?.user?.id) {
    return session;
  }

  if (process.env.NODE_ENV === "production") {
    return session;
  }

  const cookieStore = await cookies();
  const hasTestLogin = cookieStore.get(TEST_LOGIN_COOKIE)?.value === "1";

  if (!hasTestLogin) {
    return session;
  }

  return {
    user: {
      id: "local-test-user",
      name: "Test User",
      email: "test@example.local",
      image: null,
    },
    expires: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  };
}

export async function setTestLoginCookie() {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(TEST_LOGIN_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });

  return true;
}

export async function clearTestLoginCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(TEST_LOGIN_COOKIE);
}
