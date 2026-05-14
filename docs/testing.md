# Porello Test Documentation

このドキュメントは、Porello のテスト構成、各テストの責務、追加・更新時の判断基準をまとめる。
テストを追加または変更した場合は、このファイルも同じ差分で更新する。

## Test Layers

Porello のテストは次の3層で管理する。

1. Unit tests
2. Integration tests
3. E2E tests

Unit tests は純粋ロジックを短時間で検証する。Integration tests は SQLite 保存層や通知サービスなど、複数モジュールをまたぐ業務ロジックを検証する。E2E tests はユーザーがブラウザで触る主要シナリオを検証する。

## Commands

```bash
npm run typecheck
npm run test
npm run test:e2e
npm run test:e2e:crud
```

日常的な変更では `npm run typecheck` と `npm run test` を必須にする。UI 操作、認証、ドラッグ操作、モーダル、URL 遷移を変更した場合は、影響する Playwright spec も実行する。

Playwright が dev server を起動する場合は、E2E 専用 SQLite DB として `.porello-data/porello-e2e.sqlite` を使う。各 E2E test の開始前に `POST /api/test-reset` を呼び、E2E 専用DBが設定されている場合だけ DB ファイルを削除して初期化する。既存の通常 dev server に対して実行され、E2E 専用DB設定がない場合は no-op にする。

## Unit Tests

Unit tests は `src/lib/**/*.test.ts` を中心に置く。DB、外部 API、ブラウザを使わず、入力と出力が明確なロジックを対象にする。

### `src/lib/reorder.test.ts`

対象:

- `toPosition`
- `hasSameMembers`
- `moveArrayItem`
- `normalizeTitle`

検証内容:

- position は `1000` 刻みで安定して生成される。
- member 比較は順序違いを許容し、欠落、余分、重複を検出する。
- 配列移動は先頭、末尾、同一 index、範囲外を扱う。
- タイトル正規化は空白の圧縮、空文字 fallback、長文切り詰めを扱う。

更新基準:

- リスト/カードの並び替え仕様を変える場合は、このテストを先に更新する。
- UI のドラッグ挙動を変える場合でも、純粋な順序計算が変わるならここを更新する。

### `src/lib/board-defaults.test.ts`

対象:

- `DEFAULT_LIST_TITLES`

検証内容:

- 新規ボードの初期リストは `backlog`, `todo`, `doing`, `in review`, `done` の順序で固定する。
- 初期リスト数は5件に固定する。

更新基準:

- 新規ボード作成時のデフォルトリストを変える場合は、このテストと本ドキュメントを更新する。

### `src/lib/discord-notifications.test.ts`

対象:

- Discord Webhook URL validation
- `notificationListStatus`
- 通知タイトル生成
- カード URL 生成

検証内容:

- `discord.com`, `ptb.discord.com`, `canary.discord.com` の Webhook URL を許可する。
- 非 Discord URL、空文字、余分な path を拒否する。
- `doing` と `done` は大文字小文字と前後空白を吸収して判定する。
- `Doing 1`, `Done済み`, `todo` は通知対象外にする。
- アサイン通知タイトルは `[task] に [user] がアサインされました` にする。
- 移動通知タイトルは `[task] が [list] に移動されました` にする。
- 期限通知タイトルは `[task] の締め切りが近づいています` にする。
- `AUTH_URL` の末尾 slash 有無に関係なく `/boards/{boardId}?card={cardId}` を生成する。

更新基準:

- Discord payload、通知対象リスト、カード URL、Webhook URL の許可条件を変える場合は、このテストを更新する。

## Integration Tests

Integration tests は SQLite 保存層と業務ロジックの接続を検証する。Postgres 本体は対象外とし、SQLite の一時DBをテストごとに分離して使う。

### SQLite Test Harness

対象ファイル:

- `src/lib/sqlite-store.ts`
- `src/lib/sqlite-store.integration.test.ts`
- `src/lib/discord-notifications.integration.test.ts`

仕組み:

- `process.env.PORELLO_SQLITE_PATH` に一時 SQLite ファイルを指定する。
- 各テストの `beforeEach` で一時ディレクトリを作成する。
- `resetSqliteForTests()` で SQLite 接続を閉じて初期化する。
- `afterEach` で環境変数と一時ディレクトリを破棄する。
- `resetSqliteForTests()` は `NODE_ENV === "test"` のときだけ使える。

更新基準:

- SQLite 接続管理、schema 初期化、保存先切り替えを変える場合は、このハーネスの説明を更新する。
- Integration tests で共有 fixture を増やした場合は、この章に目的を書く。

### `src/lib/sqlite-store.integration.test.ts`

対象:

- ボード作成
- リスト作成、改名、削除
- カード作成、更新、削除
- ローカル user 表示名の更新
- Discord webhook 設定
- 期限通知ログ

検証内容:

- ボード作成時、初期5リストが順序と position 付きで作られる。
- リスト操作は対象ボード配下に限定される。
- カード操作は対象リスト配下に限定される。
- 担当者更新時に SQLite `users` の表示名が更新され、カード上の担当者名が ID 表示に落ちない。
- Discord webhook URL はボード単位で保存、更新、削除、取得できる。
- 期限通知ログは同じ `cardId + dueAt + notificationType` の重複通知を防ぐ。

更新基準:

- 保存層の業務ルール、所有者判定、ローカルユーザー同期、Webhook 永続化、期限通知ログを変える場合は、このテストを更新する。

### `src/lib/discord-notifications.integration.test.ts`

対象:

- `prepareCardMoveNotifications`
- `sendCardMoveNotifications`
- `notifyCardAssigned`
- `sendDueSoonDiscordNotifications`

検証内容:

- カードが `doing` または `done` リストへ移動したときだけ通知候補を返す。
- 同一リスト内の並び替えでは通知候補を返さない。
- Webhook 未設定ボードでは通知候補を返さない。
- アサイン通知と移動通知の embed は bracketed variable title を使い、description を入れない。
- embed にはカード詳細へ開ける URL を入れる。
- 期限通知は24時間以内、Done以外、未通知のカードだけを送信対象にする。
- Discord 送信失敗時は例外を投げず、成功時だけ期限通知ログを記録する。

更新基準:

- Discord 通知イベント、対象カード抽出、fetch payload、送信失敗時の扱いを変える場合は、このテストを更新する。

### `src/app/api/cron/discord-deadlines/route.test.ts`

対象:

- `GET /api/cron/discord-deadlines`

検証内容:

- `Authorization: Bearer ${CRON_SECRET}` がない場合は `401` を返す。
- 正しい secret の場合は期限通知処理を実行し、`{ ok: true, checked, sent }` を返す。

更新基準:

- Cron API の認証、レスポンス形式、呼び出す通知処理を変える場合は、このテストを更新する。

## E2E Tests

E2E tests は `tests/**/*.spec.ts` に置く。Playwright で実際のブラウザ操作を行い、ユーザーが触る主要導線を検証する。

### `tests/authenticated-crud.spec.ts`

対象:

- 開発用テストログイン
- ボード作成、ボード詳細メニューからの削除、ボード一覧からの削除
- 初期5リスト表示
- リスト追加、改名、並び替え、削除、reload 後の保持
- Discord webhook URL の保存、設定済み表示、削除、秘匿
- リストヘッダーのプラスボタンからカードを追加し、作成直後に詳細画面が開くこと
- カード追加直後にタイトル入力へフォーカスし、既定タイトルが全選択されること
- カード詳細表示、保存で閉じる、Esc で閉じる、削除
- カード詳細を閉じたら URL の `card` query が残らないこと
- カード検索中に表示件数が見え、Esc またはクリアボタンで解除できること
- `/boards/{boardId}?card={cardId}` からのカード詳細直接表示
- カード詳細のタイトル、説明URLリンク、期限、担当者、ラベル、チェックリスト、コメント
- 検索と検索クリア

更新基準:

- 認証後の主要画面、ボードメニュー、リスト操作、カード詳細、検索、Discord設定 UI を変える場合は、この spec を更新する。
- カード詳細の URL クエリ仕様を変える場合は、直接表示シナリオも更新する。
- E2E のDB初期化方法を変える場合は、`tests/fixtures.ts` と `POST /api/test-reset` の説明も更新する。

### `tests/demo.spec.ts`

対象:

- トップからデモ画面への遷移
- デモボードの初期表示
- カード検索と空状態
- カード詳細表示と Esc で閉じる操作
- デモリスト/カード追加
- カードのリスト間移動時に重複しないこと
- 同一リスト内のカード並び替え
- トップ/ログインリンク

更新基準:

- デモボードの初期データ、検索、ドラッグ、カード詳細、ナビゲーションを変える場合は、この spec を更新する。

## Maintenance Rules

- テストを追加、削除、更新した場合は、このドキュメントも同じ変更で更新する。
- E2E は `tests/fixtures.ts` から `test` を import し、各テスト前の E2E 専用DBリセットを通す。
- 仕様変更でテスト期待値を変える場合は、期待値だけでなく「なぜその層で検証するのか」も見直す。
- Unit で足りるものを E2E に寄せない。E2E はユーザー導線の保証に限定する。
- 外部 Discord には送信しない。通知 payload は `global.fetch` の stub で検証する。
- E2E は外部サービスの到達確認ではなく、Porello 側の UI と API 契約を検証する。
