-- CreateEnum
CREATE TYPE "AssistantClarificationStatus" AS ENUM ('PENDING', 'CONSUMED', 'CANCELLED', 'STALE');

-- CreateTable
CREATE TABLE "clarification_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "originating_turn_id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "status" "AssistantClarificationStatus" NOT NULL DEFAULT 'PENDING',
    "trusted_context" JSONB NOT NULL,
    "prompt" TEXT NOT NULL,
    "terminal_code" TEXT,
    "restart_required" BOOLEAN NOT NULL DEFAULT false,
    "consumed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clarification_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clarification_options" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "token_digest" TEXT NOT NULL,
    "display_label" TEXT NOT NULL,
    "discriminator" TEXT,
    "candidate_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clarification_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clarification_requests_execution_id_key" ON "clarification_requests"("execution_id");

-- CreateIndex
CREATE INDEX "clarification_requests_user_id_status_idx" ON "clarification_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "clarification_requests_conversation_id_created_at_idx" ON "clarification_requests"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "clarification_requests_parent_id_idx" ON "clarification_requests"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "clarification_options_request_id_token_digest_key" ON "clarification_options"("request_id", "token_digest");

-- CreateIndex
CREATE INDEX "clarification_options_request_id_idx" ON "clarification_options"("request_id");

-- AddForeignKey
ALTER TABLE "clarification_requests" ADD CONSTRAINT "clarification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_requests" ADD CONSTRAINT "clarification_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_requests" ADD CONSTRAINT "clarification_requests_originating_turn_id_fkey" FOREIGN KEY ("originating_turn_id") REFERENCES "assistant_turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_requests" ADD CONSTRAINT "clarification_requests_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "clarification_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification_options" ADD CONSTRAINT "clarification_options_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "clarification_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
