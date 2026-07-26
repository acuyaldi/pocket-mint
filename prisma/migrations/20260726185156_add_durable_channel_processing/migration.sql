-- CreateEnum
CREATE TYPE "ChannelJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL');

-- CreateEnum
CREATE TYPE "ChannelDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED_RETRYABLE', 'FAILED_TERMINAL');

-- RenameTable: ChannelUpdateDedup (Phase 25) evolves in place into ChannelInboundJob
-- (Phase 26B / PD-015) instead of a parallel table, so existing dedup history
-- (provider, external_update_id, created_at) is preserved rather than dropped.
ALTER TABLE "channel_update_dedups" RENAME TO "channel_inbound_jobs";
ALTER TABLE "channel_inbound_jobs" RENAME CONSTRAINT "channel_update_dedups_pkey" TO "channel_inbound_jobs_pkey";
ALTER INDEX "channel_update_dedups_provider_external_update_id_key" RENAME TO "channel_inbound_jobs_provider_external_update_id_key";
DROP INDEX "channel_update_dedups_created_at_idx";

-- AlterTable: add job-lifecycle columns. NOT NULL text/identity columns backfill
-- existing rows to '' (legacy dedup markers never had job content) and the
-- status backfills to SUCCEEDED (a legacy dedup row represents an update that
-- was already fully processed under the old synchronous path) — new rows get
-- the model defaults set below, applied only to future inserts.
ALTER TABLE "channel_inbound_jobs"
  ADD COLUMN "channel_connection_id" TEXT,
  ADD COLUMN "external_sender_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "external_chat_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "text" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "status" "ChannelJobStatus" NOT NULL DEFAULT 'SUCCEEDED',
  ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lease_owner" TEXT,
  ADD COLUMN "lease_expires_at" TIMESTAMP(3),
  ADD COLUMN "processing_started_at" TIMESTAMP(3),
  ADD COLUMN "completed_at" TIMESTAMP(3),
  ADD COLUMN "assistant_turn_id" TEXT,
  ADD COLUMN "error_category" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "channel_inbound_jobs" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "channel_inbound_jobs" ALTER COLUMN "external_sender_id" DROP DEFAULT;
ALTER TABLE "channel_inbound_jobs" ALTER COLUMN "external_chat_id" DROP DEFAULT;
ALTER TABLE "channel_inbound_jobs" ALTER COLUMN "text" DROP DEFAULT;
ALTER TABLE "channel_inbound_jobs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "channel_outbound_deliveries" (
    "id" TEXT NOT NULL,
    "inbound_job_id" TEXT NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "destination_chat_id" TEXT NOT NULL,
    "rendered_text" TEXT NOT NULL,
    "status" "ChannelDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_owner" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "error_category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_outbound_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_assistant_operations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "turn_id" TEXT,
    "rendered_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_assistant_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_inbound_jobs_assistant_turn_id_key" ON "channel_inbound_jobs"("assistant_turn_id");

-- CreateIndex
CREATE INDEX "channel_inbound_jobs_status_available_at_idx" ON "channel_inbound_jobs"("status", "available_at");

-- CreateIndex
CREATE INDEX "channel_inbound_jobs_status_lease_expires_at_idx" ON "channel_inbound_jobs"("status", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "channel_outbound_deliveries_inbound_job_id_key" ON "channel_outbound_deliveries"("inbound_job_id");

-- CreateIndex
CREATE INDEX "channel_outbound_deliveries_status_available_at_idx" ON "channel_outbound_deliveries"("status", "available_at");

-- CreateIndex
CREATE INDEX "channel_outbound_deliveries_status_lease_expires_at_idx" ON "channel_outbound_deliveries"("status", "lease_expires_at");

-- AddForeignKey
ALTER TABLE "channel_inbound_jobs" ADD CONSTRAINT "channel_inbound_jobs_channel_connection_id_fkey" FOREIGN KEY ("channel_connection_id") REFERENCES "channel_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_outbound_deliveries" ADD CONSTRAINT "channel_outbound_deliveries_inbound_job_id_fkey" FOREIGN KEY ("inbound_job_id") REFERENCES "channel_inbound_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
