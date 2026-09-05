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

function canTransition(fromStatus, toStatus) {
  if (!fromStatus || !toStatus) return false;
  if (fromStatus === toStatus) return true; // idempotent self-transition
  const validNext = ALLOWED_TRANSITIONS[fromStatus] || [];
  return validNext.includes(toStatus);
}

function assertTransition(fromStatus, toStatus) {
  if (!canTransition(fromStatus, toStatus)) {
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
