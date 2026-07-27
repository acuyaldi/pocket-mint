-- CreateEnum
CREATE TYPE "ChannelJobKind" AS ENUM ('MESSAGE', 'CALLBACK');

-- CreateEnum
CREATE TYPE "ChannelDeliveryKind" AS ENUM ('SEND_MESSAGE', 'EDIT_REPLY_MARKUP');

-- CreateEnum
CREATE TYPE "ChannelOperationKind" AS ENUM ('ASSISTANT_TURN', 'CALLBACK_INTERACTION');

-- CreateEnum
CREATE TYPE "ChannelCallbackInteractionType" AS ENUM ('CLARIFICATION_SELECT', 'CLARIFICATION_CANCEL', 'DRAFT_CONFIRM', 'DRAFT_CANCEL');

-- CreateEnum
CREATE TYPE "ChannelCallbackTokenStatus" AS ENUM ('PENDING', 'CONSUMED', 'EXPIRED', 'CANCELLED', 'STALE');

-- AlterTable: distinguish a text message job from an inline-keyboard callback
-- job. Existing rows are all MESSAGE (the only kind that existed before).
ALTER TABLE "channel_inbound_jobs"
  ADD COLUMN "kind" "ChannelJobKind" NOT NULL DEFAULT 'MESSAGE',
  ADD COLUMN "callback_query_id" TEXT,
  ADD COLUMN "callback_message_id" TEXT;

-- AlterTable: a job may now produce more than one delivery (a result-text
-- send plus a keyboard-cleanup edit), so the previous 1:1
-- (inbound_job_id) uniqueness is replaced by (inbound_job_id, kind) —
-- still at most one delivery per job per action kind, preserving the
-- existing "create once, P2002 on reclaim" idempotency.
ALTER TABLE "channel_outbound_deliveries"
  ADD COLUMN "kind" "ChannelDeliveryKind" NOT NULL DEFAULT 'SEND_MESSAGE',
  ADD COLUMN "reply_markup" JSONB,
  ADD COLUMN "target_message_id" TEXT;

DROP INDEX "channel_outbound_deliveries_inbound_job_id_key";

CREATE UNIQUE INDEX "channel_outbound_deliveries_inbound_job_id_kind_key" ON "channel_outbound_deliveries"("inbound_job_id", "kind");

-- AlterTable: which kind of durable operation this row represents, and (for
-- CALLBACK_INTERACTION) which callback token it resolved and the terminal
-- domain status reached. Existing rows are all ASSISTANT_TURN.
ALTER TABLE "channel_assistant_operations"
  ADD COLUMN "kind" "ChannelOperationKind" NOT NULL DEFAULT 'ASSISTANT_TURN',
  ADD COLUMN "callback_token_id" TEXT,
  ADD COLUMN "terminal_status" TEXT;

-- CreateTable: opaque inline-keyboard button handles. Digest-only —
-- action_secret is server-side-only material (e.g. the wrapped raw
-- ClarificationOption token for CLARIFICATION_SELECT), never returned to
-- Telegram and cleared on consumption.
CREATE TABLE "channel_callback_tokens" (
    "id" TEXT NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "token_digest" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "interaction_type" "ChannelCallbackInteractionType" NOT NULL,
    "clarification_request_id" TEXT,
    "clarification_option_id" TEXT,
    "financial_draft_id" TEXT,
    "action_secret" TEXT,
    "status" "ChannelCallbackTokenStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_callback_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_callback_tokens_provider_token_digest_key" ON "channel_callback_tokens"("provider", "token_digest");

-- CreateIndex
CREATE INDEX "channel_callback_tokens_connection_id_status_idx" ON "channel_callback_tokens"("connection_id", "status");

-- CreateIndex
CREATE INDEX "channel_callback_tokens_status_expires_at_idx" ON "channel_callback_tokens"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "channel_callback_tokens" ADD CONSTRAINT "channel_callback_tokens_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "channel_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_assistant_operations" ADD CONSTRAINT "channel_assistant_operations_callback_token_id_fkey" FOREIGN KEY ("callback_token_id") REFERENCES "channel_callback_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
