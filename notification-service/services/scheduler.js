/**
 * Outbox retry sweep, run periodically by each notification-service replica.
 * Picks up any `Pending` notification whose first synchronous dispatch
 * attempt failed (or was never retried), without requiring the original
 * caller to re-invoke /dispatch. Uses the same conditional/atomic claim
 * (`Notification.findOneAndUpdate`) processNotification already relies on,
 * so replicas running this at the same time can't double-send anything.
 *
 * Same `SCHEDULER_ENABLED=false` escape hatch and "don't start in test"
 * guard as backend/services/scheduler.js.
 */

const mongoose = require("mongoose");
const { processPendingOutbox } = require("./notificationService");
const logger = require("../utils/logger");

const INTERVAL_MS = 30 * 1000;
const OUTBOX_SWEEP_LIMIT = 20;

async function runOnce() {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const processed = await processPendingOutbox({ limit: OUTBOX_SWEEP_LIMIT });
    if (processed.length > 0) {
      logger.info({ count: processed.length }, "[scheduler] Outbox sweep processed due notifications");
    }
  } catch (error) {
    logger.error({ err: error.message }, "[scheduler] Outbox sweep failed");
  }
}

let timer = null;
let running = false;

function start() {
  if (timer || process.env.SCHEDULER_ENABLED === "false" || process.env.NODE_ENV === "test") return;
  timer = setInterval(async () => {
    if (running) return; // previous run still going
    running = true;
    try {
      await runOnce();
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  timer.unref();
  logger.info({ intervalSeconds: INTERVAL_MS / 1000 }, "[scheduler] Notification outbox scheduler started");
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, runOnce };
