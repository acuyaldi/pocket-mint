"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.claimInboundJobs = claimInboundJobs;
exports.claimOutboundDeliveries = claimOutboundDeliveries;
const client_1 = require("../../generated/prisma/client");
/**
 * Claims a bounded batch of eligible jobs atomically via `FOR UPDATE SKIP
 * LOCKED` so concurrent worker instances never claim the same row — this
 * transaction commits immediately (no network/Assistant call happens inside
 * it). `attempt > 1` on the returned row signals a reclaimed (previously
 * leased) job rather than a first attempt.
 */
async function claimInboundJobs(db, opts) {
    return db.$queryRaw(client_1.Prisma.sql `
    WITH claimed AS (
      SELECT id FROM channel_inbound_jobs
      WHERE (status = 'PENDING' AND available_at <= (now() at time zone 'utc'))
         OR (status = 'PROCESSING' AND lease_expires_at < (now() at time zone 'utc'))
      ORDER BY created_at
      LIMIT ${opts.batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE channel_inbound_jobs j
    SET status = 'PROCESSING',
        lease_owner = ${opts.owner},
        lease_expires_at = (now() at time zone 'utc') + (${opts.leaseMs} * interval '1 millisecond'),
        attempt = attempt + 1,
        processing_started_at = (now() at time zone 'utc'),
        updated_at = (now() at time zone 'utc')
    FROM claimed
    WHERE j.id = claimed.id
    RETURNING
      j.id,
      j.provider,
      j.external_update_id AS "externalUpdateId",
      j.channel_connection_id AS "channelConnectionId",
      j.external_sender_id AS "externalSenderId",
      j.external_chat_id AS "externalChatId",
      j.text,
      j.kind,
      j.callback_query_id AS "callbackQueryId",
      j.callback_message_id AS "callbackMessageId",
      j.attempt,
      j.assistant_turn_id AS "assistantTurnId"
  `);
}
async function claimOutboundDeliveries(db, opts) {
    return db.$queryRaw(client_1.Prisma.sql `
    WITH claimed AS (
      SELECT id FROM channel_outbound_deliveries
      WHERE (status = 'PENDING' AND available_at <= (now() at time zone 'utc'))
         OR (status = 'SENDING' AND lease_expires_at < (now() at time zone 'utc'))
      ORDER BY created_at
      LIMIT ${opts.batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE channel_outbound_deliveries d
    SET status = 'SENDING',
        lease_owner = ${opts.owner},
        lease_expires_at = (now() at time zone 'utc') + (${opts.leaseMs} * interval '1 millisecond'),
        attempt = attempt + 1,
        updated_at = (now() at time zone 'utc')
    FROM claimed
    WHERE d.id = claimed.id
    RETURNING
      d.id,
      d.inbound_job_id AS "inboundJobId",
      d.kind,
      d.destination_chat_id AS "destinationChatId",
      d.rendered_text AS "renderedText",
      d.reply_markup AS "replyMarkup",
      d.target_message_id AS "targetMessageId",
      d.attempt
  `);
}
//# sourceMappingURL=claim.js.map