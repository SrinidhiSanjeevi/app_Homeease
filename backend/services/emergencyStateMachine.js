/**
 * Emergency Request State Machine
 *
 * Sole authority for legal EmergencyRequest.status transitions — mirrors
 * services/booking/bookingStateMachine.js's role for bookings. Moved here
 * (from admin-backend/controllers/adminController.js's EMERGENCY_TRANSITIONS
 * map) so booking-service is the only place this is defined.
 */

const EMERGENCY_TRANSITIONS = Object.freeze({
  Dispatched: ["OnTheWay", "Arrived", "Resolved", "Cancelled"],
  OnTheWay: ["Arrived", "Resolved", "Cancelled"],
  Arrived: ["Resolved", "Cancelled"],
  Resolved: [],
  Cancelled: []
});

function canTransitionEmergency(fromStatus, toStatus) {
  return (EMERGENCY_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

module.exports = {
  EMERGENCY_TRANSITIONS,
  canTransitionEmergency
};
