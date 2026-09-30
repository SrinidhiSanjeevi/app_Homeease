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
