-- CreateEnum
CREATE TYPE "ChannelProvider" AS ENUM ('TELEGRAM');

-- CreateEnum
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "channel_link_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "token_digest" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "external_chat_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "status" "ChannelConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_update_dedups" (
    "id" TEXT NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "external_update_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_update_dedups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "channel_link_tokens_user_id_provider_idx" ON "channel_link_tokens"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "channel_link_tokens_provider_token_digest_key" ON "channel_link_tokens"("provider", "token_digest");

-- CreateIndex
CREATE UNIQUE INDEX "channel_connections_provider_external_user_id_key" ON "channel_connections"("provider", "external_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_connections_user_id_provider_key" ON "channel_connections"("user_id", "provider");

-- CreateIndex
CREATE INDEX "channel_update_dedups_created_at_idx" ON "channel_update_dedups"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "channel_update_dedups_provider_external_update_id_key" ON "channel_update_dedups"("provider", "external_update_id");

-- AddForeignKey
ALTER TABLE "channel_link_tokens" ADD CONSTRAINT "channel_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
