describe("bookingStateMachine", () => {
  let bookingStateMachine;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Fallback mode (without authoritative implementation)", () => {
    beforeAll(() => {
      jest.isolateModules(() => {
        jest.doMock("../../backend/services/booking/bookingStateMachine", () => {
          throw new Error("Cannot find module");
        });
        bookingStateMachine = require("../services/booking/bookingStateMachine");
      });
    });

    describe("canTransition", () => {
      it("returns false for null/undefined inputs", () => {
        expect(bookingStateMachine.canTransition(null, "Assigned")).toBe(false);
        expect(bookingStateMachine.canTransition("Created", undefined)).toBe(false);
      });

      it("returns true for idempotent self-transition", () => {
        expect(bookingStateMachine.canTransition("Created", "Created")).toBe(true);
        expect(bookingStateMachine.canTransition("Assigned", "Assigned")).toBe(true);
      });

      it("returns true for allowed transitions", () => {
        expect(bookingStateMachine.canTransition("Created", "Assigned")).toBe(true);
        expect(bookingStateMachine.canTransition("Assigned", "Confirmed")).toBe(true);
        expect(bookingStateMachine.canTransition("Confirmed", "Completed")).toBe(true);
      });

      it("returns false for disallowed transitions", () => {
        expect(bookingStateMachine.canTransition("Created", "Completed")).toBe(false);
        expect(bookingStateMachine.canTransition("Completed", "Assigned")).toBe(false);
        expect(bookingStateMachine.canTransition("Cancelled", "Created")).toBe(false);
      });
    });

    describe("assertTransition", () => {
      it("does not throw for allowed transitions", () => {
        expect(() => {
          bookingStateMachine.assertTransition("Created", "Assigned");
        }).not.toThrow();
      });

      it("throws AppError 400 for disallowed transitions", () => {
        let error;
        try {
          bookingStateMachine.assertTransition("Created", "Completed");
        } catch (e) {
          error = e;
        }
        expect(error).toBeDefined();
        expect(error.statusCode).toBe(400);
        expect(error.message).toMatch(/Illegal booking status transition/);
      });
    });
  });

  describe("Authoritative mode", () => {
    let mockAuthoritative;

    beforeAll(() => {
      mockAuthoritative = {
        canTransition: jest.fn().mockReturnValue("delegated-can"),
        assertTransition: jest.fn().mockReturnValue("delegated-assert"),
        BOOKING_STATUSES: { TEST: "Test" },
        ALLOWED_TRANSITIONS: {}
      };
      jest.isolateModules(() => {
        jest.doMock("../../backend/services/booking/bookingStateMachine", () => mockAuthoritative);
        bookingStateMachine = require("../services/booking/bookingStateMachine");
      });
    });

    it("delegates canTransition", () => {
      const result = bookingStateMachine.canTransition("A", "B");
      expect(mockAuthoritative.canTransition).toHaveBeenCalledWith("A", "B");
      expect(result).toBe("delegated-can");
    });

    it("delegates assertTransition", () => {
      const result = bookingStateMachine.assertTransition("A", "B");
      expect(mockAuthoritative.assertTransition).toHaveBeenCalledWith("A", "B");
      expect(result).toBe("delegated-assert");
    });
  });
});
