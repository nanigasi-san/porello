# Vercel Deployment Checklist

Porello を Vercel に本番デプロイするための準備と確認項目をまとめる。

## Required Services

- Vercel project
- Neon Postgres
- Vercel Blob
- Discord Developer Portal OAuth application
- Discord channel webhook for each board that should send notifications

ローカル開発では SQLite fallback を使えるが、本番では `DATABASE_URL` を必ず設定し、Postgres を使う。

## Environment Variables

Vercel の Production / Preview 環境に次を設定する。

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="..."
AUTH_URL="https://<production-domain>"
AUTH_DISCORD_ID="..."
AUTH_DISCORD_SECRET="..."
CRON_SECRET="..."
BLOB_READ_WRITE_TOKEN="..."
```

### Notes

- `AUTH_SECRET` は `npx auth secret` などで生成した十分に長いランダム値を使う。
- `AUTH_URL` は本番URLに合わせる。例: `https://porello.example.com`
- `BLOB_READ_WRITE_TOKEN` は Vercel Blob integration を追加すると注入される。
- `CRON_SECRET` は `/api/cron/discord-deadlines` の Bearer 認証に使う。
- `.env.local` のローカル値、Discord client secret、Webhook URL はコミットしない。

## Discord OAuth Setup

Discord Developer Portal の対象 application で OAuth2 redirect URL を登録する。

```text
https://<production-domain>/api/auth/callback/discord
```

Preview deployment でDiscordログインを確認したい場合は、Preview URL も redirect URL に追加する。

```text
https://<preview-domain>/api/auth/callback/discord
```

本番でアサイン通知のメンションを動かすには、各ユーザーがDiscordログインしている必要がある。通知先チャンネルには、ボード設定からDiscord Webhook URLを保存する。

Webhook通知は、カード担当者のDiscord IDが保存されている場合に `content` と `allowed_mentions.users` を使ってメンションする。Botをサーバーへ追加する必要はないが、メンション対象ユーザーが通知先チャンネルを閲覧できる権限は必要。

## Database Setup

1. Vercel Marketplace か Neon 側でPostgres databaseを作成する。
2. Vercel project に `DATABASE_URL` を設定する。
3. 本番DBへDrizzle schemaを反映する。

```bash
npm run db:push
```

運用上は、Production DBに対して実行する前にPreview環境で確認する。既存 migration は `drizzle/` にあり、Auth.js tables、boards、lists、cards、comments、attachments、Discord webhook、deadline notification log を含む。

## Vercel Project Settings

- Framework Preset: Next.js
- Build Command: `npm run build`
- Install Command: `npm install`
- Output Directory: Next.js default
- Root Directory: repository root

`vercel.json` には締め切り通知Cronが定義されている。

```json
{
  "path": "/api/cron/discord-deadlines",
  "schedule": "0 0 * * *"
}
```

このCronはUTC基準で実行される。通知処理自体は「現在から24時間以内」の未通知カードを対象にする。

## Pre-Deploy Verification

デプロイ前に最低限これを実行する。

```bash
npm run typecheck
npm run test
npm run build
```

UI変更や認証導線を触った場合は、該当するPlaywright specも実行する。

```bash
npm run test:e2e -- tests/demo.spec.ts
npm run test:e2e:crud
```

現在の注意点:

- `npm run lint` は既存の `react-hooks` ルール違反で失敗する。Vercel側でlintを必須にする前に解消する。
- Windows + OneDrive 上では `test:e2e:crud` のSQLite resetが `EPERM` で失敗することがある。CIやVercel環境では別途確認する。

## Deploy Flow

Git連携を使う場合:

1. GitHub repository を Vercel project に接続する。
2. Environment Variables と integrations を設定する。
3. Preview deployment を作成する。
4. Preview URLをDiscord OAuth redirect URLに追加する。
5. Previewでログイン、ボード作成、Webhook保存、アサイン通知、添付ファイルを確認する。
6. Productionへpromoteまたはmain branchへmergeする。
7. Production URLをDiscord OAuth redirect URLに追加し、`AUTH_URL` をProduction URLに設定する。

CLIで直接確認する場合:

```bash
vercel
vercel --prod
```

CIでprebuilt deployを使う場合:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

## Post-Deploy Smoke Test

本番反映後、次を確認する。

- `/` が表示される。
- Discordログインできる。
- `/boards` でボード一覧が表示される。
- ボード作成、リスト作成、カード作成ができる。
- `/settings` で表示名を変更できる。
- ボードメニューからDiscord Webhook URLを保存できる。
- カードに担当者を設定すると、Webhook通知で担当者がメンションされる。
- Doing/Done へのカード移動で、担当者がメンションされる。
- 期限通知Cronが `CRON_SECRET` 付きで成功する。
- 添付ファイルをアップロード、ダウンロード、削除できる。

Cron endpointを手動確認する場合:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<production-domain>/api/cron/discord-deadlines
```

成功時は `{ "ok": true, "checked": number, "sent": number }` を返す。

## Production Safety Notes

- `/settings` のDBリセットボタンは、Productionまたは `DATABASE_URL` 設定時には表示されない。
- Discord Webhook URL と Discord OAuth secret は漏洩したら再発行する。
- Vercel Blob token と Neon connection string はVercel環境変数だけに置く。
- Preview環境で本番Discordチャンネルへ通知したくない場合は、Preview用のWebhook URLを別チャンネルにする。
