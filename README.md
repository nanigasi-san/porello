# Porello

Porello is an original kanban board MVP built for Vercel. It provides private boards, lists, cards, drag-and-drop ordering, and Google OAuth sign-in.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Auth.js with Google Provider
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

Google callback URLs:

- Local: `http://localhost:3100/api/auth/callback/google`
- Production: `https://<vercel-domain>/api/auth/callback/google`

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
