CREATE TABLE IF NOT EXISTS "board_discord_webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "board_id" uuid NOT NULL REFERENCES "boards"("id") ON DELETE cascade,
  "webhook_url" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "discord_deadline_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE cascade,
  "due_at" timestamp NOT NULL,
  "notification_type" varchar(40) NOT NULL,
  "sent_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "board_discord_webhooks_board_id_unique" ON "board_discord_webhooks" ("board_id");
CREATE UNIQUE INDEX IF NOT EXISTS "discord_deadline_notifications_card_due_type_unique" ON "discord_deadline_notifications" ("card_id", "due_at", "notification_type");
