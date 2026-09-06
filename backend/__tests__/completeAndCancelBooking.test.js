/**
 * Regression tests for completeBooking and cancelBooking.
 *
 * Primary assertion: both handlers return HTTP 200 (not 500) when called
 * on a booking that has an assigned professional.
 *
 * Secondary assertions:
 *  - reassignWaitingWork is called fire-and-forget after the professional
 *    is freed (both complete and cancel paths).
 *  - Neither handler ever calls the non-existent `reassignWaitingBookings`
 *    (which would cause a ReferenceError and produce a 500 response).
 */

process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_mock";
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "mock_secret";

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock("../models/Booking");
jest.mock("../models/Professional");
jest.mock("../models/Payment");
jest.mock("../models/Notification");

// Mock the entire customerCore boundary so we can spy on reassignWaitingWork.
// canTransition must still return a real value so the state-machine checks work.
jest.mock("../services/customerCore", () => {
  const actual = jest.requireActual("../services/customerCore");
  return {
    ...actual,
    reassignWaitingWork: jest.fn().mockResolvedValue(undefined),
    claimProfessional: jest.fn()
  };
});

jest.mock("../services/payment/paymentService", () => ({
  refundPayment: jest.fn().mockResolvedValue(null)
}));

jest.mock("../services/simulationService", () => ({
  processNotificationSimulation: jest.fn().mockResolvedValue([]),
  processCompletionEmailNotification: jest.fn().mockResolvedValue({})
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────
const Booking = require("../models/Booking");
const Professional = require("../models/Professional");
const Payment = require("../models/Payment");
const { reassignWaitingWork } = require("../services/customerCore");
const { completeBooking, cancelBooking } = require("../controllers/bookingController");

// ── Shared helpers ───────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
  return res;
}

/**
 * Builds a mock Booking document for a Confirmed booking with an assigned
 * professional.  save() is mocked so Mongoose validation is skipped.
 */
function makeMockBooking(overrides = {}) {
  return {
    _id: "booking-100",
    user: "user-42",
    professional: "pro-7",
    status: "Confirmed",
    paymentMethod: "Razorpay",
    paymentStatus: "Paid",
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

function makeMockProfessional() {
  return {
    _id: "pro-7",
    name: "Alice",
    category: "Plumbing",
    status: "Available"
  };
}

// ── completeBooking ──────────────────────────────────────────────────────────

describe("completeBooking", () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    // User is the booking owner → isOwner = true
    req = {
      user: { _id: "user-42" },
      params: { id: "booking-100" }
    };
    res = makeRes();
  });

  test("1. returns 200 when completing a Confirmed booking with an assigned professional", async () => {
    const mockBooking = makeMockBooking();
    Booking.findById.mockResolvedValue(mockBooking);

    // The isAssignedProfessional check: Professional.findOne returns null
    // because the request is coming from the user (not the professional).
    // isOwner is true, so this is fine.
    Professional.findOne.mockResolvedValue(null);

    // Professional freed after completion
    const freedProfessional = makeMockProfessional();
    Professional.findByIdAndUpdate.mockResolvedValue(freedProfessional);

    await completeBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  test("2. frees the professional and calls reassignWaitingWork after completion", async () => {
    const mockBooking = makeMockBooking();
    Booking.findById.mockResolvedValue(mockBooking);
    Professional.findOne.mockResolvedValue(null);
    const freedProfessional = makeMockProfessional();
    Professional.findByIdAndUpdate.mockResolvedValue(freedProfessional);

    await completeBooking(req, res);

    // Professional must be freed
    expect(Professional.findByIdAndUpdate).toHaveBeenCalledWith(
      "pro-7",
      { status: "Available" },
      { new: true }
    );

    // reassignWaitingWork (not reassignWaitingBookings!) must be called
    expect(reassignWaitingWork).toHaveBeenCalledWith("Plumbing");
  });

  test("3. returns 200 when completing a COD booking (marks payment Paid)", async () => {
    const mockBooking = makeMockBooking({
      paymentMethod: "Cash on Delivery",
      paymentStatus: "Pending (Cash on Delivery)"
    });
    Booking.findById.mockResolvedValue(mockBooking);
    Professional.findOne.mockResolvedValue(null);
    Professional.findByIdAndUpdate.mockResolvedValue(makeMockProfessional());
    Payment.findOneAndUpdate.mockResolvedValue({});

    await completeBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethod: "Cash on Delivery" }),
      { status: "Success" }
    );
  });

  test("4. returns 404 when booking is not found (never 500)", async () => {
    Booking.findById.mockResolvedValue(null);

    await completeBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test("5. returns 400 when transition is illegal (Cancelled → Completed)", async () => {
    // A Cancelled booking cannot be moved to Completed — it is a terminal state.
    // canTransition('Cancelled', 'Completed') === false because ALLOWED_TRANSITIONS['Cancelled'] = []
    const mockBooking = makeMockBooking({ status: "Cancelled" });
    Booking.findById.mockResolvedValue(mockBooking);
    Professional.findOne.mockResolvedValue(null);

    await completeBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test("6. returns 403 when caller is neither the owner nor the assigned professional", async () => {
    const mockBooking = makeMockBooking({ user: "some-other-user" });
    Booking.findById.mockResolvedValue(mockBooking);
    // The lookup for the assigned professional also returns null
    Professional.findOne.mockResolvedValue(null);

    await completeBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});

// ── cancelBooking ────────────────────────────────────────────────────────────

describe("cancelBooking", () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: { _id: "user-42" },
      params: { id: "booking-100" }
    };
    res = makeRes();
  });

  test("7. returns 200 when cancelling a Confirmed booking with an assigned professional", async () => {
    const mockBooking = makeMockBooking();
    // cancelBooking uses findOne({ _id, user }) not findById
    Booking.findOne.mockResolvedValue(mockBooking);
    Professional.findByIdAndUpdate.mockResolvedValue(makeMockProfessional());

    await cancelBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: "Booking cancelled successfully" })
    );
  });

  test("8. frees the professional and calls reassignWaitingWork after cancellation", async () => {
    const mockBooking = makeMockBooking();
    Booking.findOne.mockResolvedValue(mockBooking);
    const freedProfessional = makeMockProfessional();
    Professional.findByIdAndUpdate.mockResolvedValue(freedProfessional);

    await cancelBooking(req, res);

    expect(Professional.findByIdAndUpdate).toHaveBeenCalledWith(
      "pro-7",
      { status: "Available" },
      { new: true }
    );
    expect(reassignWaitingWork).toHaveBeenCalledWith("Plumbing");
  });

  test("9. returns 200 when cancelling a booking whose payment is Paid (triggers refund path)", async () => {
    const mockBooking = makeMockBooking({ paymentStatus: "Paid" });
    Booking.findOne.mockResolvedValue(mockBooking);
    Professional.findByIdAndUpdate.mockResolvedValue(makeMockProfessional());

    const { refundPayment } = require("../services/payment/paymentService");
    refundPayment.mockResolvedValue({ id: "rfnd_abc" });

    await cancelBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(refundPayment).toHaveBeenCalledWith("booking-100");
  });

  test("10. returns 404 when booking is not found (never 500)", async () => {
    Booking.findOne.mockResolvedValue(null);

    await cancelBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test("11. returns 400 when transition is illegal (Completed → Cancelled)", async () => {
    // A Completed booking cannot be cancelled — it is a terminal state.
    // canTransition('Completed', 'Cancelled') === false because ALLOWED_TRANSITIONS['Completed'] = []
    const mockBooking = makeMockBooking({ status: "Completed" });
    Booking.findOne.mockResolvedValue(mockBooking);

    await cancelBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });

  test("12. returns 400 when transition is illegal (Completed → Cancelled)", async () => {
    const mockBooking = makeMockBooking({ status: "Completed" });
    Booking.findOne.mockResolvedValue(mockBooking);

    await cancelBooking(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});
