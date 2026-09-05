/**
 * Customer Core Modular Domain Boundary
 *
 * Encapsulates the tightly-coupled customer core domains:
 * - Auth & Users
 * - Services & Professionals
 * - Bookings & State Transition Rules
 * - Emergencies & Dispatching
 * - Professional Matching & Auto-Reassignment
 *
 * This represents the single authoritative customer core boundary within the modular monolith.
 */

const bookingStateMachine = require("../booking/bookingStateMachine");
const professionalMatcher = require("../professionalMatcher");
const emergencyConfig = require("./emergencyConfig");

module.exports = {
  ...bookingStateMachine,
  ...professionalMatcher,
  ...emergencyConfig,
  bookingStateMachine,
  professionalMatcher,
  emergencyConfig
};
