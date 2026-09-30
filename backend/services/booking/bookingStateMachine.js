const AppError = require("../../utils/AppError");

const BOOKING_STATUSES = Object.freeze({
  CREATED: "Created",
  ASSIGNED: "Assigned",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled"
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [BOOKING_STATUSES.CREATED]: [
    BOOKING_STATUSES.ASSIGNED,
    BOOKING_STATUSES.CONFIRMED,
    BOOKING_STATUSES.CANCELLED
  ],
  [BOOKING_STATUSES.ASSIGNED]: [
    BOOKING_STATUSES.CONFIRMED,
    BOOKING_STATUSES.CANCELLED
  ],
  [BOOKING_STATUSES.CONFIRMED]: [
    BOOKING_STATUSES.COMPLETED,
    BOOKING_STATUSES.CANCELLED
  ],
  [BOOKING_STATUSES.COMPLETED]: [],
  [BOOKING_STATUSES.CANCELLED]: []
});

const REQUIRES_PROFESSIONAL = new Set([
  BOOKING_STATUSES.CONFIRMED,
  BOOKING_STATUSES.COMPLETED
]);

function canTransition(fromStatus, toStatus, hasProfessional) {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return true; // idempotent self-transition
  const validNext = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!validNext.includes(toStatus)) return false;
  if (REQUIRES_PROFESSIONAL.has(toStatus) && !hasProfessional) return false;
  return true;
}

function assertTransition(fromStatus, toStatus, hasProfessional) {
  if (!canTransition(fromStatus, toStatus, hasProfessional)) {
    if (REQUIRES_PROFESSIONAL.has(toStatus) && !hasProfessional) {
      throw new AppError(
        `Cannot mark this booking '${toStatus}' — no professional is assigned to it yet`,
        400
      );
    }
    throw new AppError(
      `Illegal booking status transition from '${fromStatus}' to '${toStatus}'`,
      400
    );
  }
}

module.exports = {
  BOOKING_STATUSES,
  ALLOWED_TRANSITIONS,
  canTransition,
  assertTransition
};
