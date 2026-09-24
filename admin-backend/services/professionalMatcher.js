/**
 * Professional matching lives in the customer backend
 * (backend/services/professionalMatcher.js + services/scheduler.js).
 *
 * Its scheduler sweeps waiting bookings and emergencies every minute, so
 * when an admin frees up a professional (cancel / complete / resolve /
 * mark Available) the next sweep assigns them — admin-backend no longer
 * duplicates the slot-reservation and nearest-match logic.
 */

async function reassignWaitingWork() {
  // Intentionally a no-op: picked up by the backend scheduler within ~60s.
}

module.exports = { reassignWaitingWork };
