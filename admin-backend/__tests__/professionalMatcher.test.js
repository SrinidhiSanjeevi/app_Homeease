const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const Professional = require("../models/Professional");

jest.mock("../models/Booking");
jest.mock("../models/EmergencyRequest");
jest.mock("../models/Professional");
jest.mock("../utils/logger", () => ({ info: jest.fn(), error: jest.fn() }));

describe("professionalMatcher", () => {
  let professionalMatcher;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Fallback mode (without authoritativeMatcher)", () => {
    beforeAll(() => {
      jest.isolateModules(() => {
        jest.doMock("../../backend/services/professionalMatcher", () => {
          throw new Error("Cannot find module");
        });
        professionalMatcher = require("../services/professionalMatcher");
      });
    });

    describe("claimProfessional", () => {
      it("claims specific category professional", async () => {
        Professional.findOneAndUpdate.mockResolvedValue({ _id: "p1", name: "P1" });
        const result = await professionalMatcher.claimProfessional("Cleaning");
        expect(Professional.findOneAndUpdate).toHaveBeenCalledWith(
          { category: "Cleaning", status: "Available", active: true },
          { $set: { status: "Busy" } },
          expect.any(Object)
        );
        expect(result._id).toBe("p1");
      });

      it("claims any professional for categories without dedicated roster", async () => {
        Professional.findOneAndUpdate.mockResolvedValue({ _id: "p2", name: "P2" });
        await professionalMatcher.claimProfessional("Medical");
        expect(Professional.findOneAndUpdate).toHaveBeenCalledWith(
          { status: "Available", active: true },
          { $set: { status: "Busy" } },
          expect.any(Object)
        );
      });
    });

    describe("reassignWaitingBookings", () => {
      it("returns if category is missing", async () => {
        await professionalMatcher.reassignWaitingBookings();
        expect(Booking.find).not.toHaveBeenCalled();
      });

      it("reassigns matching pending bookings", async () => {
        const mockBooking = { isCustom: false, service: { category: "Cleaning" }, save: jest.fn() };
        Booking.find.mockReturnValue({
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([mockBooking])
        });
        Professional.findOneAndUpdate.mockResolvedValue({ _id: "p1", name: "P1" });

        await professionalMatcher.reassignWaitingBookings("Cleaning");
        expect(mockBooking.professional).toBe("p1");
        expect(mockBooking.status).toBe("Confirmed");
        expect(mockBooking.save).toHaveBeenCalled();
      });

      it("skips if category does not match", async () => {
        const mockBooking = { isCustom: false, service: { category: "Other" }, save: jest.fn() };
        Booking.find.mockReturnValue({
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([mockBooking])
        });

        await professionalMatcher.reassignWaitingBookings("Cleaning");
        expect(mockBooking.save).not.toHaveBeenCalled();
      });

      it("stops if no professional can be claimed", async () => {
        const mockBooking = { isCustom: false, service: { category: "Cleaning" }, save: jest.fn() };
        Booking.find.mockReturnValue({
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([mockBooking])
        });
        Professional.findOneAndUpdate.mockResolvedValue(null);

        await professionalMatcher.reassignWaitingBookings("Cleaning");
        expect(mockBooking.save).not.toHaveBeenCalled();
      });
    });

    describe("reassignWaitingEmergencies", () => {
      it("returns if category is missing", async () => {
        await professionalMatcher.reassignWaitingEmergencies();
        expect(EmergencyRequest.find).not.toHaveBeenCalled();
      });

      it("reassigns matching pending emergencies", async () => {
        const mockEmergency = { category: "Medical", save: jest.fn() };
        EmergencyRequest.find.mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([mockEmergency])
        });
        Professional.findOneAndUpdate.mockResolvedValue({ _id: "p1", name: "P1" });

        await professionalMatcher.reassignWaitingEmergencies("Medical");
        expect(mockEmergency.assignedProfessional).toBe("p1");
        expect(mockEmergency.save).toHaveBeenCalled();
      });

      it("skips non-matching emergencies", async () => {
        const mockEmergency = { category: "Other", save: jest.fn() };
        EmergencyRequest.find.mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([mockEmergency])
        });

        await professionalMatcher.reassignWaitingEmergencies("Cleaning");
        expect(mockEmergency.save).not.toHaveBeenCalled();
      });
    });

    describe("reassignWaitingWork", () => {
      it("delegates to bookings and emergencies", async () => {
        Booking.find.mockReturnValue({
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([])
        });
        EmergencyRequest.find.mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue([])
        });

        await professionalMatcher.reassignWaitingWork("Cleaning");
        expect(Booking.find).toHaveBeenCalled();
        expect(EmergencyRequest.find).toHaveBeenCalled();
      });
    });
  });

  describe("Authoritative mode (with authoritativeMatcher)", () => {
    let mockAuthoritative;

    beforeAll(() => {
      mockAuthoritative = {
        CATEGORIES_WITHOUT_DEDICATED_ROSTER: new Set(["AuthCat"]),
        claimProfessional: jest.fn(),
        reassignWaitingBookings: jest.fn(),
        reassignWaitingEmergencies: jest.fn(),
        reassignWaitingWork: jest.fn()
      };
      
      jest.isolateModules(() => {
        jest.doMock("../../backend/services/professionalMatcher", () => mockAuthoritative);
        professionalMatcher = require("../services/professionalMatcher");
      });
    });

    it("delegates claimProfessional", async () => {
      await professionalMatcher.claimProfessional("AuthCat");
      expect(mockAuthoritative.claimProfessional).toHaveBeenCalled();
    });

    it("delegates reassignWaitingBookings", async () => {
      await professionalMatcher.reassignWaitingBookings("AuthCat");
      expect(mockAuthoritative.reassignWaitingBookings).toHaveBeenCalled();
    });

    it("delegates reassignWaitingEmergencies", async () => {
      await professionalMatcher.reassignWaitingEmergencies("AuthCat");
      expect(mockAuthoritative.reassignWaitingEmergencies).toHaveBeenCalled();
    });

    it("delegates reassignWaitingWork", async () => {
      await professionalMatcher.reassignWaitingWork("AuthCat");
      expect(mockAuthoritative.reassignWaitingWork).toHaveBeenCalled();
    });
  });
});
