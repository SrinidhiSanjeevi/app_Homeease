/**
 * Customer Core - Emergency Service Configuration & Severity Rules
 *
 * HomeEase dispatches home-service specialists (electricians, plumbers,
 * locksmiths). It is NOT a fire brigade or ambulance: fire and medical
 * emergencies are never "dispatched" here — the customer is sent straight
 * to the public emergency numbers instead, and no fake unit IDs are shown.
 */

const SEVERITY_CONFIG = Object.freeze({
  Low: {
    fireEngineDispatched: false,
    fireEngineNumber: null,
    emergencyServiceNumber: null,
    estimatedArrivalMinutes: 30,
    label: "Standard Response"
  },
  Medium: {
    fireEngineDispatched: false,
    fireEngineNumber: null,
    emergencyServiceNumber: null,
    estimatedArrivalMinutes: 20,
    label: "Priority Response"
  },
  High: {
    fireEngineDispatched: false,
    fireEngineNumber: null,
    emergencyServiceNumber: null,
    estimatedArrivalMinutes: 10,
    label: "High Priority Response"
  },
  Critical: {
    fireEngineDispatched: false,
    fireEngineNumber: null,
    emergencyServiceNumber: null,
    estimatedArrivalMinutes: 10,
    label: "Critical — nearest specialist dispatched first"
  }
});

// Specialist emergencies HomeEase can actually respond to.
const DISPATCHABLE_CATEGORIES = Object.freeze(["Electrical", "Plumbing", "Security"]);

// Life-safety emergencies: always redirected to public services.
const PUBLIC_EMERGENCY_NUMBERS = Object.freeze({
  Fire: { number: "101", service: "Fire brigade" },
  Medical: { number: "108", service: "Ambulance" }
});

// Shown to the customer alongside a dispatch when life may be at risk.
const SAFETY_HINTS = Object.freeze({
  Electrical: "If there is smoke or fire, leave the building and call 101.",
  Plumbing: "If water is near sockets or wiring, switch off the main power first.",
  Security: "If an intruder may still be inside, leave and call 100."
});

const CATEGORY_DEFAULT_SEVERITY = Object.freeze({
  Electrical: "High",
  Plumbing: "Medium",
  Security: "High"
});

const VALID_EMERGENCY_CATEGORIES = Object.freeze([...DISPATCHABLE_CATEGORIES, ...Object.keys(PUBLIC_EMERGENCY_NUMBERS)]);

// Allowed emergency status moves (no going back from Resolved/Cancelled).
const EMERGENCY_TRANSITIONS = Object.freeze({
  Dispatched: ["OnTheWay", "Arrived", "Resolved", "Cancelled"],
  OnTheWay: ["Arrived", "Resolved", "Cancelled"],
  Arrived: ["Resolved", "Cancelled"],
  Resolved: [],
  Cancelled: []
});

function canTransitionEmergency(from, to) {
  return (EMERGENCY_TRANSITIONS[from] || []).includes(to);
}

module.exports = {
  SEVERITY_CONFIG,
  DISPATCHABLE_CATEGORIES,
  PUBLIC_EMERGENCY_NUMBERS,
  SAFETY_HINTS,
  CATEGORY_DEFAULT_SEVERITY,
  VALID_EMERGENCY_CATEGORIES,
  EMERGENCY_TRANSITIONS,
  canTransitionEmergency
};
