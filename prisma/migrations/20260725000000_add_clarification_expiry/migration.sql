-- Additive: clarification lifecycle expiry.
-- Backfill existing rows from created_at (15 minute default TTL) before
-- enforcing NOT NULL, so this applies cleanly to a table that already has data.
ALTER TABLE "clarification_requests" ADD COLUMN "expires_at" TIMESTAMP(3);

UPDATE "clarification_requests"
SET "expires_at" = "created_at" + INTERVAL '15 minutes'
WHERE "expires_at" IS NULL;

ALTER TABLE "clarification_requests" ALTER COLUMN "expires_at" SET NOT NULL;
