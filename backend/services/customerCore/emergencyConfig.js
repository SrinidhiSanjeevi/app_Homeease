/**
 * Customer Core - Emergency Service Configuration & Severity Rules
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
    emergencyServiceNumber: "1800-SERV-HELP",
    estimatedArrivalMinutes: 20,
    label: "Priority Response"
  },
  High: {
    fireEngineDispatched: true,
    fireEngineNumber: "FE-2024",
    emergencyServiceNumber: "101",
    estimatedArrivalMinutes: 10,
    label: "High Priority — Fire/Emergency Services Alerted"
  },
  Critical: {
    fireEngineDispatched: true,
    fireEngineNumber: "FE-ALPHA-01",
    emergencyServiceNumber: "101",
    estimatedArrivalMinutes: 5,
    label: "CRITICAL — All Emergency Units Dispatched"
  }
});

const CATEGORY_DEFAULT_SEVERITY = Object.freeze({
  Electrical: "High",
  Fire: "Critical",
  Medical: "Critical",
  Plumbing: "Medium",
  Security: "High"
});

const VALID_EMERGENCY_CATEGORIES = Object.freeze([
  "Electrical",
  "Plumbing",
  "Security",
  "Fire",
  "Medical"
]);

module.exports = {
  SEVERITY_CONFIG,
  CATEGORY_DEFAULT_SEVERITY,
  VALID_EMERGENCY_CATEGORIES
};
