import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

export function hasDiscordOAuthConfig() {
  const clientId = process.env.AUTH_DISCORD_ID;
  const clientSecret = process.env.AUTH_DISCORD_SECRET;

  return Boolean(
    clientId &&
      clientSecret &&
      !clientId.includes("replace-with") &&
      !clientSecret.includes("replace-with"),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const hasDatabase = Boolean(process.env.DATABASE_URL);
  const providers = [
    Discord,
    ...(process.env.NODE_ENV === "production"
      ? []
      : [
          Credentials({
            id: "test-login",
            name: "Test Login",
            credentials: {},
            authorize() {
              return {
                id: "local-test-user",
                name: "Test User",
                email: "test@example.local",
                image: null,
              };
            },
          }),
        ]),
  ];

  return {
    secret:
      process.env.AUTH_SECRET ??
      (process.env.NODE_ENV === "production" ? undefined : "porello-development-secret"),
    adapter: hasDatabase
      ? DrizzleAdapter(getDb(), {
          usersTable: users,
          accountsTable: accounts,
          sessionsTable: sessions,
          verificationTokensTable: verificationTokens,
        })
      : undefined,
    session: {
      strategy: hasDatabase ? "database" : "jwt",
    },
    providers,
    pages: {
      signIn: "/signin",
    },
    callbacks: {
      session({ session, token, user }) {
        if (session.user) {
          session.user.id = user?.id ?? token?.sub ?? "";
        }

        return session;
      },
    },
  };
});
