CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text,
  "email" text UNIQUE,
  "email_verified" timestamp,
  "image" text
);

CREATE TABLE IF NOT EXISTS "accounts" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" integer,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text,
  PRIMARY KEY ("provider", "provider_account_id")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "session_token" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "expires" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification_tokens" (
  "identifier" text NOT NULL,
  "token" text NOT NULL,
  "expires" timestamp NOT NULL,
  PRIMARY KEY ("identifier", "token")
);

CREATE TABLE IF NOT EXISTS "boards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" varchar(120) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "lists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "board_id" uuid NOT NULL REFERENCES "boards"("id") ON DELETE cascade,
  "title" varchar(120) NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "list_id" uuid NOT NULL REFERENCES "lists"("id") ON DELETE cascade,
  "title" varchar(180) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "due_at" timestamp,
  "assignee_id" text REFERENCES "users"("id") ON DELETE set null,
  "position" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "labels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "board_id" uuid NOT NULL REFERENCES "boards"("id") ON DELETE cascade,
  "name" varchar(40) NOT NULL,
  "color" varchar(24) DEFAULT '#0f766e' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "card_labels" (
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE cascade,
  "label_id" uuid NOT NULL REFERENCES "labels"("id") ON DELETE cascade,
  PRIMARY KEY ("card_id", "label_id")
);

CREATE TABLE IF NOT EXISTS "card_checklist_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE cascade,
  "title" varchar(200) NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "card_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE cascade,
  "author_id" text REFERENCES "users"("id") ON DELETE set null,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "card_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "card_id" uuid NOT NULL REFERENCES "cards"("id") ON DELETE cascade,
  "uploader_id" text REFERENCES "users"("id") ON DELETE set null,
  "filename" varchar(240) NOT NULL,
  "content_type" varchar(120) DEFAULT 'application/octet-stream' NOT NULL,
  "size" integer NOT NULL,
  "storage_provider" varchar(20) NOT NULL,
  "storage_key" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "boards_owner_id_idx" ON "boards" ("owner_id");
CREATE INDEX IF NOT EXISTS "lists_board_id_position_idx" ON "lists" ("board_id", "position");
CREATE INDEX IF NOT EXISTS "cards_list_id_position_idx" ON "cards" ("list_id", "position");
CREATE INDEX IF NOT EXISTS "labels_board_id_idx" ON "labels" ("board_id");
CREATE INDEX IF NOT EXISTS "card_checklist_items_card_id_position_idx" ON "card_checklist_items" ("card_id", "position");
CREATE INDEX IF NOT EXISTS "card_comments_card_id_created_at_idx" ON "card_comments" ("card_id", "created_at");
CREATE INDEX IF NOT EXISTS "card_attachments_card_id_created_at_idx" ON "card_attachments" ("card_id", "created_at");
