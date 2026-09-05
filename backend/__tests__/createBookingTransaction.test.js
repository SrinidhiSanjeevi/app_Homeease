process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_mock";
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "mock_secret";

const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const Professional = require("../models/Professional");
const Payment = require("../models/Payment");

jest.mock("../services/payment/paymentService", () => ({
  refundPayment: jest.fn()
}));
jest.mock("../models/Booking");
jest.mock("../models/Service");
jest.mock("../models/Professional");
jest.mock("../models/Payment");
jest.mock("../services/simulationService", () => ({
  processNotificationSimulation: jest.fn().mockResolvedValue([]),
  processCompletionEmailNotification: jest.fn().mockResolvedValue({})
}));

const { createBooking } = require("../controllers/bookingController");

describe("createBooking Transaction Protection", () => {
  let mockSession;
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSession = {
      withTransaction: jest.fn(async (fn) => {
        return await fn();
      }),
      endSession: jest.fn().mockResolvedValue()
    };

    jest.spyOn(mongoose, "startSession").mockResolvedValue(mockSession);

    req = {
      user: { _id: "user-123" },
      body: {
        serviceId: "service-123",
        date: "2026-09-10",
        timeSlot: "10:00 AM - 12:00 PM",
        address: "123 Main St",
        contactNumber: "9876543210",
        totalPrice: 499
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    Service.findById.mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: "service-123",
        category: "Cleaning"
      })
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("1. successful booking (Razorpay) creates booking and passes session to all writes", async () => {
    const mockProfessional = {
      _id: "pro-1",
      name: "John Doe",
      category: "Cleaning",
      status: "Busy"
    };

    Professional.findOneAndUpdate.mockResolvedValue(mockProfessional);

    const mockBookingDoc = {
      _id: "booking-1",
      user: "user-123",
      professional: "pro-1",
      status: "Confirmed",
      paymentMethod: "Razorpay",
      paymentStatus: "Pending",
      populate: jest.fn().mockResolvedValue(this)
    };

    Booking.create.mockResolvedValue([mockBookingDoc]);

    await createBooking(req, res);

    expect(mongoose.startSession).toHaveBeenCalledTimes(1);
    expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);

    // Verify session passed to Professional.findOneAndUpdate
    expect(Professional.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ category: "Cleaning", status: "Available", active: true }),
      { $set: { status: "Busy" } },
      expect.objectContaining({ session: mockSession })
    );

    // Verify session passed to Booking.create
    expect(Booking.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          user: "user-123",
          professional: "pro-1",
          status: "Confirmed",
          paymentMethod: "Razorpay"
        })
      ]),
      { session: mockSession }
    );

    // COD payment should not be created
    expect(Payment.create).not.toHaveBeenCalled();

    // Session is closed
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        requiresPayment: true,
        booking: mockBookingDoc
      })
    );
  });

  test("2. successful booking (COD) creates booking and COD payment within the same session", async () => {
    req.body.paymentMethod = "Cash on Delivery";

    const mockProfessional = {
      _id: "pro-2",
      name: "Jane Smith",
      category: "Cleaning"
    };
    Professional.findOneAndUpdate.mockResolvedValue(mockProfessional);

    const mockBookingDoc = {
      _id: "booking-2",
      user: "user-123",
      professional: "pro-2",
      status: "Confirmed",
      paymentMethod: "Cash on Delivery",
      paymentStatus: "Pending (Cash on Delivery)",
      populate: jest.fn().mockResolvedValue(this)
    };
    Booking.create.mockResolvedValue([mockBookingDoc]);
    Payment.create.mockResolvedValue([{}]);

    await createBooking(req, res);

    expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);

    // Both booking and payment must receive the same session
    expect(Booking.create).toHaveBeenCalledWith(
      expect.any(Array),
      { session: mockSession }
    );
    expect(Payment.create).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          booking: "booking-2",
          user: "user-123",
          paymentMethod: "Cash on Delivery",
          transactionId: "COD-booking-2"
        })
      ]),
      { session: mockSession }
    );

    expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        requiresPayment: false
      })
    );
  });

  test("3. professional claim failure aborts transaction and closes session", async () => {
    Professional.findOneAndUpdate.mockRejectedValue(new Error("Mongo network error on claim"));

    await createBooking(req, res);

    expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
    expect(Booking.create).not.toHaveBeenCalled();
    expect(Payment.create).not.toHaveBeenCalled();
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Something went wrong, please try again"
    });
  });

  test("4. booking creation failure triggers transaction failure and ends session", async () => {
    const mockProfessional = {
      _id: "pro-4",
      status: "Busy"
    };
    Professional.findOneAndUpdate.mockResolvedValue(mockProfessional);

    Booking.create.mockRejectedValue(new Error("Duplicate key or validation error on booking"));

    await createBooking(req, res);

    expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    expect(Payment.create).not.toHaveBeenCalled();

    // Verify manual rollback findByIdAndUpdate is NOT called
    expect(Professional.findByIdAndUpdate).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Something went wrong, please try again"
    });
  });

  test("5. COD payment creation failure triggers transaction failure and ends session", async () => {
    req.body.paymentMethod = "Cash";

    Professional.findOneAndUpdate.mockResolvedValue({ _id: "pro-5" });
    Booking.create.mockResolvedValue([{ _id: "booking-5", populate: jest.fn() }]);
    Payment.create.mockRejectedValue(new Error("Database write error during COD payment insert"));

    await createBooking(req, res);

    expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);

    // Verify manual rollback findByIdAndUpdate is NOT called
    expect(Professional.findByIdAndUpdate).not.toHaveBeenCalled();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Something went wrong, please try again"
    });
  });

  test("6. transaction rollback releasing professional: simulates withTransaction aborting staged changes", async () => {
    let proStatus = "Available";

    // Simulate stateful transaction behavior:
    // If the transaction succeeds, proStatus stays "Busy".
    // If withTransaction aborts, proStatus rolls back to "Available".
    mockSession.withTransaction = jest.fn().mockImplementation(async (callback) => {
      proStatus = "Busy"; // staged change during transaction
      try {
        await callback();
      } catch (err) {
        proStatus = "Available"; // rolled back on transaction abort
        throw err;
      }
    });

    Professional.findOneAndUpdate.mockImplementation(async () => {
      return { _id: "pro-6", status: proStatus };
    });

    Booking.create.mockRejectedValue(new Error("Simulated transient write conflict on booking"));

    await createBooking(req, res);

    // The transaction abort restored proStatus to Available
    expect(proStatus).toBe("Available");

    // Proves manual compensation was replaced by native transaction rollback
    expect(Professional.findByIdAndUpdate).not.toHaveBeenCalled();

    // Session is properly closed
    expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
