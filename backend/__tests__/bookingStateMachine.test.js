const { canTransition, assertTransition, BOOKING_STATUSES } = require("../services/booking/bookingStateMachine");
const AppError = require("../utils/AppError");

describe("Booking State Machine", () => {
  const { ASSIGNED, CONFIRMED, COMPLETED, CANCELLED } = BOOKING_STATUSES;

  describe("canTransition", () => {
    test("Assigned → Confirmed is valid", () => expect(canTransition(ASSIGNED, CONFIRMED)).toBe(true));
    test("Assigned → Cancelled is valid", () => expect(canTransition(ASSIGNED, CANCELLED)).toBe(true));
    test("Confirmed → Completed is valid", () => expect(canTransition(CONFIRMED, COMPLETED)).toBe(true));
    test("Confirmed → Cancelled is valid", () => expect(canTransition(CONFIRMED, CANCELLED)).toBe(true));
    test("Completed → Cancelled is INVALID", () => expect(canTransition(COMPLETED, CANCELLED)).toBe(false));
    test("Cancelled → Confirmed is INVALID", () => expect(canTransition(CANCELLED, CONFIRMED)).toBe(false));
    test("Completed → any is INVALID", () => expect(canTransition(COMPLETED, ASSIGNED)).toBe(false));
    test("same status self-transition returns true", () => expect(canTransition(CONFIRMED, CONFIRMED)).toBe(true));
    test("null inputs return false", () => expect(canTransition(null, CONFIRMED)).toBe(false));
  });

  describe("assertTransition", () => {
    test("throws AppError on invalid transition", () => {
      expect(() => assertTransition(COMPLETED, CANCELLED)).toThrow(AppError);
    });
    test("throws with correct message", () => {
      expect(() => assertTransition(COMPLETED, CANCELLED)).toThrow("Illegal booking status transition");
    });
    test("does not throw on valid transition", () => {
      expect(() => assertTransition(ASSIGNED, CONFIRMED)).not.toThrow();
    });
  });
});
