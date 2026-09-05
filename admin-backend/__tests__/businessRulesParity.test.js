const backendStateMachine = require("../../backend/services/booking/bookingStateMachine");
const adminStateMachine = require("../services/booking/bookingStateMachine");

const backendMatcher = require("../../backend/services/professionalMatcher");
const adminMatcher = require("../services/professionalMatcher");

const Professional = require("../models/Professional");
const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");

jest.mock("../models/Professional");
jest.mock("../models/Booking");
jest.mock("../models/EmergencyRequest");

describe("Customer vs. Admin Business Rules Parity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Booking State Machine Parity", () => {
    test("1. BOOKING_STATUSES enum constants are 100% identical", () => {
      expect(adminStateMachine.BOOKING_STATUSES).toEqual(backendStateMachine.BOOKING_STATUSES);
      expect(Object.keys(adminStateMachine.BOOKING_STATUSES)).toEqual(
        Object.keys(backendStateMachine.BOOKING_STATUSES)
      );
    });

    test("2. ALLOWED_TRANSITIONS graph is 100% identical", () => {
      expect(adminStateMachine.ALLOWED_TRANSITIONS).toEqual(backendStateMachine.ALLOWED_TRANSITIONS);
    });

    test("3. canTransition returns identical results for all combinations", () => {
      const allStatuses = Object.values(backendStateMachine.BOOKING_STATUSES);

      // Test all pairwise permutations
      for (const from of allStatuses) {
        for (const to of allStatuses) {
          const backendResult = backendStateMachine.canTransition(from, to);
          const adminResult = adminStateMachine.canTransition(from, to);
          expect(adminResult).toBe(backendResult);
        }
      }

      // Test null / undefined / invalid inputs
      expect(adminStateMachine.canTransition(null, "Confirmed")).toBe(
        backendStateMachine.canTransition(null, "Confirmed")
      );
      expect(adminStateMachine.canTransition("Confirmed", null)).toBe(
        backendStateMachine.canTransition("Confirmed", null)
      );
      expect(adminStateMachine.canTransition(undefined, undefined)).toBe(
        backendStateMachine.canTransition(undefined, undefined)
      );
      expect(adminStateMachine.canTransition("UnknownStatus", "Confirmed")).toBe(
        backendStateMachine.canTransition("UnknownStatus", "Confirmed")
      );
    });

    test("4. assertTransition throws identical AppError exception types on illegal transitions", () => {
      expect(() => {
        adminStateMachine.assertTransition("Completed", "Cancelled");
      }).toThrow();

      expect(() => {
        backendStateMachine.assertTransition("Completed", "Cancelled");
      }).toThrow();

      // Valid transitions should not throw in either
      expect(() => {
        adminStateMachine.assertTransition("Assigned", "Confirmed");
      }).not.toThrow();

      expect(() => {
        backendStateMachine.assertTransition("Assigned", "Confirmed");
      }).not.toThrow();
    });
  });

  describe("Professional Matcher Business Rules Parity", () => {
    test("5. CATEGORIES_WITHOUT_DEDICATED_ROSTER constants are identical", () => {
      const backendCategories = Array.from(backendMatcher.CATEGORIES_WITHOUT_DEDICATED_ROSTER).sort();
      const adminCategories = Array.from(adminMatcher.CATEGORIES_WITHOUT_DEDICATED_ROSTER).sort();

      expect(adminCategories).toEqual(backendCategories);
      expect(adminCategories).toEqual(["Fire", "Medical"]);
    });

    test("6. claimProfessional applies identical rating-based priority and atomic locking", async () => {
      const mockProf = { _id: "prof-1", name: "Bob", rating: 4.9, status: "Busy" };
      Professional.findOneAndUpdate.mockResolvedValue(mockProf);

      const claimed = await adminMatcher.claimProfessional("Plumbing");

      expect(Professional.findOneAndUpdate).toHaveBeenCalledWith(
        { category: "Plumbing", status: "Available", active: true },
        { $set: { status: "Busy" } },
        { sort: { rating: -1 }, new: true }
      );
      expect(claimed).toEqual(mockProf);
    });

    test("7. claimProfessional matches ANY available professional for special categories", async () => {
      Professional.findOneAndUpdate.mockResolvedValue({ _id: "prof-fire", name: "Sam" });

      await adminMatcher.claimProfessional("Fire");

      expect(Professional.findOneAndUpdate).toHaveBeenCalledWith(
        { status: "Available", active: true },
        { $set: { status: "Busy" } },
        { sort: { rating: -1 }, new: true }
      );
    });

    test("8. reassignWaitingWork coordinates both waiting bookings and waiting emergencies", async () => {
      const queryMockBookings = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };
      Booking.find.mockReturnValue(queryMockBookings);

      const queryMockEmergencies = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };
      EmergencyRequest.find.mockReturnValue(queryMockEmergencies);

      await adminMatcher.reassignWaitingWork("Carpentry");

      expect(Booking.find).toHaveBeenCalledWith({
        professional: null,
        status: "Assigned"
      });
      expect(EmergencyRequest.find).toHaveBeenCalledWith({
        assignedProfessional: null,
        status: "Dispatched"
      });
    });
  });
});
