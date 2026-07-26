import { Prisma, type PrismaClient } from '../../generated/prisma/client';

export interface ClaimedInboundJob {
  readonly id: string;
  readonly provider: string;
  readonly externalUpdateId: string;
  readonly channelConnectionId: string | null;
  readonly externalSenderId: string;
  readonly externalChatId: string;
  readonly text: string;
  readonly attempt: number;
  readonly assistantTurnId: string | null;
}

export interface ClaimedDelivery {
  readonly id: string;
  readonly inboundJobId: string;
  readonly destinationChatId: string;
  readonly renderedText: string;
  readonly attempt: number;
}

export interface ClaimOptions {
  readonly batchSize: number;
  readonly leaseMs: number;
  readonly owner: string;
}

/**
 * Claims a bounded batch of eligible jobs atomically via `FOR UPDATE SKIP
 * LOCKED` so concurrent worker instances never claim the same row — this
 * transaction commits immediately (no network/Assistant call happens inside
 * it). `attempt > 1` on the returned row signals a reclaimed (previously
 * leased) job rather than a first attempt.
 */
export async function claimInboundJobs(db: PrismaClient, opts: ClaimOptions): Promise<ClaimedInboundJob[]> {
  return db.$queryRaw<ClaimedInboundJob[]>(Prisma.sql`
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
      j.attempt,
      j.assistant_turn_id AS "assistantTurnId"
  `);
}

export async function claimOutboundDeliveries(db: PrismaClient, opts: ClaimOptions): Promise<ClaimedDelivery[]> {
  return db.$queryRaw<ClaimedDelivery[]>(Prisma.sql`
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
      d.destination_chat_id AS "destinationChatId",
      d.rendered_text AS "renderedText",
      d.attempt
  `);
}
