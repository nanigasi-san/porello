import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const hasDatabase = Boolean(process.env.DATABASE_URL);

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
    providers: [Discord],
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
