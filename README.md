# Porello

Porello is an original kanban board MVP built for Vercel. It provides private boards, lists, cards, drag-and-drop ordering, and Discord OAuth sign-in.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Auth.js with Discord Provider
- Neon Postgres and Drizzle ORM
- `@dnd-kit` for drag-and-drop board interactions

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values.

3. Push the schema to Neon:

   ```bash
   npm run db:push
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

Discord callback URLs:

- Local: `http://localhost:3100/api/auth/callback/discord`
- Production: `https://<vercel-domain>/api/auth/callback/discord`

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Test design and maintenance details are documented in [docs/testing.md](docs/testing.md).
Vercel deployment preparation is documented in [docs/deployment.md](docs/deployment.md).
