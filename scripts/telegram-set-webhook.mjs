#!/usr/bin/env node
// Deliberate, operator-driven Telegram webhook registration. Never run
// automatically at application boot. Usage:
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
//     node scripts/telegram-set-webhook.mjs https://<railway-domain>/api/v1/telegram/webhook
//
// Pass --delete to remove the webhook instead (e.g. when disabling the
// channel or rotating to a new secret).

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const [, , arg1, arg2] = process.argv;
const remove = arg1 === '--delete' || arg2 === '--delete';
const url = remove ? undefined : arg1;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is required.');
  process.exit(1);
}
if (!remove && !url) {
  console.error('Usage: node scripts/telegram-set-webhook.mjs <https-webhook-url>');
  console.error('   or: node scripts/telegram-set-webhook.mjs --delete');
  process.exit(1);
}
if (!remove && !secret) {
  console.error('TELEGRAM_WEBHOOK_SECRET is required when setting the webhook.');
  process.exit(1);
}

const base = `https://api.telegram.org/bot${token}`;

async function main() {
  const endpoint = remove ? 'deleteWebhook' : 'setWebhook';
  const body = remove ? {} : { url, secret_token: secret, allowed_updates: ['message'] };
  const response = await fetch(`${base}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  // Never print the token/secret — only Telegram's own response payload.
  console.log(JSON.stringify(payload, null, 2));
  if (!payload.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
