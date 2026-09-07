const crypto = require("crypto");
const razorpay = require("../config/razorpay");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const Professional = require("../models/Professional");
const AppError = require("../utils/AppError");

jest.mock("../models/Payment");
jest.mock("../models/Booking");
jest.mock("../models/Professional");

const {
  createOrder,
  verifyPayment,
  refundPayment,
  getPaymentStatus,
  processWebhook
} = require("../services/paymentService");

describe("Standalone Payment Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_KEY_ID = "rzp_test_mock";
    process.env.RAZORPAY_KEY_SECRET = "secret_mock_123";
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_mock_456";
  });

  describe("Order Creation", () => {
    test("creates payment order successfully for unpaid booking", async () => {
      const mockBooking = {
        _id: "book-1",
        user: "user-1",
        totalPrice: 1200,
        paymentStatus: "Pending",
        status: "Assigned"
      };

      Booking.findOne.mockResolvedValue(mockBooking);
      razorpay.orders.create = jest.fn().mockResolvedValue({
        id: "order_mock_123",
        amount: 120000,
        currency: "INR"
      });
      Payment.create.mockResolvedValue({});

      const result = await createOrder({ bookingId: "book-1", userId: "user-1" });

      expect(Booking.findOne).toHaveBeenCalledWith({ _id: "book-1", user: "user-1" });
      expect(razorpay.orders.create).toHaveBeenCalledWith({
        amount: 120000,
        currency: "INR",
        receipt: "booking_book-1",
        notes: {
          bookingId: "book-1",
          userId: "user-1"
        }
      });
      expect(Payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          booking: "book-1",
          user: "user-1",
          amount: 1200,
          status: "Pending",
          paymentMethod: "Razorpay",
          razorpayOrderId: "order_mock_123"
        })
      );
      expect(result.orderId).toBe("order_mock_123");
      expect(result.amount).toBe(120000);
    });

    test("throws 400 when booking is already paid", async () => {
      Booking.findOne.mockResolvedValue({
        _id: "book-2",
        user: "user-1",
        paymentStatus: "Paid"
      });

      await expect(createOrder({ bookingId: "book-2", userId: "user-1" })).rejects.toThrow(
        "This booking is already paid"
      );
    });

    test("throws 404 when booking not found", async () => {
      Booking.findOne.mockResolvedValue(null);
      await expect(createOrder({ bookingId: "book-x", userId: "user-x" })).rejects.toThrow("Booking not found");
    });

    test("throws 400 when booking is cancelled", async () => {
      Booking.findOne.mockResolvedValue({ _id: "b", user: "u", status: "Cancelled" });
      await expect(createOrder({ bookingId: "b", userId: "u" })).rejects.toThrow(/Cannot create payment order/);
    });
  });

  describe("Payment Verification", () => {
    test("verifies valid signature, creates Success payment, updates booking to Paid", async () => {
      const orderId = "order_abc_1";
      const paymentId = "pay_xyz_1";
      const secret = process.env.RAZORPAY_KEY_SECRET;
      const validSignature = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      const mockBooking = {
        _id: "book-verify-1",
        user: "user-1",
        totalPrice: 900,
        paymentStatus: "Pending",
        status: "Assigned",
        professional: "prof-1",
        save: jest.fn().mockResolvedValue()
      };

      Booking.findById.mockResolvedValue(mockBooking);
      Payment.findOne.mockResolvedValue(null);
      Payment.create.mockResolvedValue({
        _id: "pay-doc-1",
        status: "Success",
        transactionId: paymentId
      });

      const result = await verifyPayment({
        bookingId: "book-verify-1",
        userId: "user-1",
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature
      });

      expect(result.isValid).toBe(true);
      expect(mockBooking.paymentStatus).toBe("Paid");
      expect(mockBooking.status).toBe("Confirmed");
      expect(mockBooking.save).toHaveBeenCalled();
    });

    test("detects duplicate payment and throws 400", async () => {
      Booking.findById.mockResolvedValue({
        _id: "book-verify-dup",
        user: "user-1",
        paymentStatus: "Pending",
        status: "Assigned"
      });

      Payment.findOne.mockResolvedValue({
        transactionId: "pay_duplicate_1",
        status: "Success"
      });

      await expect(
        verifyPayment({
          bookingId: "book-verify-dup",
          userId: "user-1",
          razorpayOrderId: "order_dup",
          razorpayPaymentId: "pay_duplicate_1",
          razorpaySignature: "dummy_sig"
        })
      ).rejects.toThrow("This payment has already been verified successfully");
    });

    test("handles invalid signature properly: marks payment Failure and cancels booking", async () => {
      const mockBooking = {
        _id: "book-verify-fail",
        user: "user-1",
        totalPrice: 500,
        paymentStatus: "Pending",
        status: "Assigned",
        professional: "prof-1",
        save: jest.fn().mockResolvedValue()
      };

      Booking.findById.mockResolvedValue(mockBooking);
      Payment.findOne.mockResolvedValue(null);
      Payment.create.mockResolvedValue({
        _id: "pay-doc-fail",
        status: "Failure"
      });
      Professional.findByIdAndUpdate.mockResolvedValue({});

      const result = await verifyPayment({
        bookingId: "book-verify-fail",
        userId: "user-1",
        razorpayOrderId: "order_bad",
        razorpayPaymentId: "pay_bad",
        razorpaySignature: "invalid_tampered_signature"
      });

      expect(result.isValid).toBe(false);
      expect(mockBooking.status).toBe("Cancelled");
      expect(mockBooking.paymentStatus).toBe("Failed");
      expect(Professional.findByIdAndUpdate).toHaveBeenCalledWith("prof-1", { status: "Available" });
      expect(mockBooking.save).toHaveBeenCalled();
    });

    test("timing-safe comparison: handles equal-length invalid signature without error", async () => {
      const mockBooking = {
        _id: "book-verify-timing",
        user: "user-1",
        totalPrice: 500,
        paymentStatus: "Pending",
        status: "Assigned",
        professional: "prof-1",
        save: jest.fn().mockResolvedValue()
      };

      Booking.findById.mockResolvedValue(mockBooking);
      Payment.findOne.mockResolvedValue(null);
      Payment.create.mockResolvedValue({
        _id: "pay-doc-timing",
        status: "Failure"
      });
      Professional.findByIdAndUpdate.mockResolvedValue({});

      // 64-char hex string, matching expected SHA256 length, but incorrect
      const sameLengthTamperedSignature = "a".repeat(64);

      const result = await verifyPayment({
        bookingId: "book-verify-timing",
        userId: "user-1",
        razorpayOrderId: "order_test",
        razorpayPaymentId: "pay_test",
        razorpaySignature: sameLengthTamperedSignature
      });

      expect(result.isValid).toBe(false);
      expect(mockBooking.paymentStatus).toBe("Failed");
    });

    test("throws 404 when booking not found", async () => {
      Booking.findById.mockResolvedValue(null);
      await expect(verifyPayment({ bookingId: "bx", userId: "u" })).rejects.toThrow("Booking not found");
    });

    test("throws 403 when user mismatch", async () => {
      Booking.findById.mockResolvedValue({ user: "u1" });
      await expect(verifyPayment({ bookingId: "bx", userId: "u2" })).rejects.toThrow("Unauthorized to verify payment");
    });

    test("throws 400 when booking already paid", async () => {
      Booking.findById.mockResolvedValue({ user: "u", paymentStatus: "Paid" });
      await expect(verifyPayment({ bookingId: "bx", userId: "u" })).rejects.toThrow("This booking is already paid");
    });

    test("throws 400 when booking is cancelled", async () => {
      Booking.findById.mockResolvedValue({ user: "u", status: "Cancelled" });
      await expect(verifyPayment({ bookingId: "bx", userId: "u" })).rejects.toThrow(/Cannot verify payment/);
    });
  });

  describe("Webhook Handling & Idempotency", () => {
    test("rejects invalid webhook signature with 400", async () => {
      const result = await processWebhook({
        rawPayload: JSON.stringify({ event: "payment.captured" }),
        signature: "invalid_sig",
        webhookSecret: "whsec_mock_456"
      });

      expect(result.statusCode).toBe(400);
      expect(result.message).toBe("Invalid signature");
    });

    test("processes valid payment.captured webhook and updates booking and payment", async () => {
      const payload = {
        event: "payment.captured",
        event_id: "evt_test_100",
        payload: {
          payment: {
            entity: {
              id: "pay_cap_100",
              order_id: "order_cap_100",
              amount: 80000,
              notes: { bookingId: "booking-cap-1" }
            }
          }
        }
      };

      const rawPayload = JSON.stringify(payload);
      const secret = "whsec_mock_456";
      const validSignature = crypto.createHmac("sha256", secret).update(rawPayload).digest("hex");

      Payment.findOne.mockResolvedValue(null);
      Booking.findById.mockResolvedValue({
        _id: "booking-cap-1",
        user: "user-1",
        totalPrice: 800,
        status: "Assigned",
        paymentStatus: "Pending",
        save: jest.fn().mockResolvedValue()
      });
      Payment.findOneAndUpdate.mockResolvedValue({});

      const result = await processWebhook({
        rawPayload,
        signature: validSignature,
        webhookSecret: secret,
        eventHeaders: { "x-razorpay-event-id": "evt_test_100" }
      });

      expect(result.statusCode).toBe(200);
      expect(result.message).toBe("Payment captured and booking updated");
    });

    test("webhook idempotency: skips re-processing if payment was already processed", async () => {
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_already_done",
              order_id: "order_done"
            }
          }
        }
      };

      const rawPayload = JSON.stringify(payload);
      const secret = "whsec_mock_456";
      const validSignature = crypto.createHmac("sha256", secret).update(rawPayload).digest("hex");

      Payment.findOne.mockResolvedValue({
        transactionId: "pay_already_done",
        status: "Success"
      });

      const result = await processWebhook({
        rawPayload,
        signature: validSignature,
        webhookSecret: secret
      });

      expect(result.statusCode).toBe(200);
      expect(result.message).toBe("Payment already processed");
      expect(Booking.findById).not.toHaveBeenCalled();
    });

    test("missing signature header returns 400", async () => {
      const result = await processWebhook({ rawPayload: "{}", signature: null });
      expect(result.statusCode).toBe(400);
    });

    test("missing webhook secret returns 500", async () => {
      const result = await processWebhook({ rawPayload: "{}", signature: "sig", webhookSecret: null });
      expect(result.statusCode).toBe(500);
    });

    test("payment.captured without payment entity returns 400", async () => {
      const payload = { event: "payment.captured", payload: {} };
      const secret = "whsec_mock_456";
      const sig = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
      const result = await processWebhook({ rawPayload: JSON.stringify(payload), signature: sig, webhookSecret: secret });
      expect(result.statusCode).toBe(400);
    });

    test("payment.captured booking already paid updates payment record", async () => {
      const payload = { event: "payment.captured", payload: { payment: { entity: { id: "p1", notes: { bookingId: "b1" } } } } };
      const secret = "whsec_mock_456";
      const sig = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
      Payment.findOne.mockResolvedValueOnce(null);
      Booking.findById.mockResolvedValueOnce({ _id: "b1", paymentStatus: "Paid" });
      Payment.findOneAndUpdate.mockResolvedValueOnce({});
      const result = await processWebhook({ rawPayload: JSON.stringify(payload), signature: sig, webhookSecret: secret });
      expect(result.statusCode).toBe(200);
      expect(result.message).toBe("Booking already paid");
    });

    test("payment.failed processing updates booking to Cancelled", async () => {
      const payload = { event: "payment.failed", payload: { payment: { entity: { id: "pf", notes: { bookingId: "bf" } } } } };
      const secret = "whsec_mock_456";
      const sig = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
      Payment.findOne.mockResolvedValueOnce(null);
      Booking.findById.mockResolvedValueOnce({ _id: "bf", save: jest.fn() });
      Payment.findOneAndUpdate.mockResolvedValueOnce({});
      const result = await processWebhook({ rawPayload: JSON.stringify(payload), signature: sig, webhookSecret: secret });
      expect(result.statusCode).toBe(200);
      expect(result.message).toBe("Payment failure processed");
    });

    test("unhandled webhook event type returns 200 ignored", async () => {
      const payload = { event: "unknown.event" };
      const secret = "whsec_mock_456";
      const sig = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
      const result = await processWebhook({ rawPayload: JSON.stringify(payload), signature: sig, webhookSecret: secret });
      expect(result.statusCode).toBe(200);
      expect(result.message).toMatch(/not handled/);
    });
  });

  describe("Refund Processing", () => {
    test("refunds payment successfully through Razorpay API", async () => {
      Payment.findOne.mockReset();
      const mockPayment = {
        _id: "pay-ref-1",
        transactionId: "pay_refund_tgt",
        amount: 600,
        status: "Success",
        paymentMethod: "Razorpay",
        save: jest.fn().mockResolvedValue()
      };

      Payment.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockPayment)
      });

      razorpay.payments = {
        refund: jest.fn().mockResolvedValue({ id: "rfnd_mock_123" })
      };

      const result = await refundPayment("booking-ref-1");

      expect(razorpay.payments.refund).toHaveBeenCalledWith("pay_refund_tgt", { amount: 60000 });
      expect(mockPayment.status).toBe("Refunded");
      expect(mockPayment.refundId).toBe("rfnd_mock_123");
      expect(result.id).toBe("rfnd_mock_123");
    });

    test("returns null if payment not found or not Razorpay", async () => {
      Payment.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
      const result = await refundPayment("bx");
      expect(result).toBeNull();
    });

    test("returns null if Razorpay API fails", async () => {
      Payment.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue({ amount: 100, paymentMethod: "Razorpay" }) });
      razorpay.payments = { refund: jest.fn().mockRejectedValue(new Error("API error")) };
      const result = await refundPayment("bx");
      expect(result).toBeNull();
    });
  });

  describe("Payment Status Query", () => {
    test("retrieves payment status by bookingId", async () => {
      Payment.findOne.mockReset();
      const mockPayment = { _id: "pay-status-1", status: "Success", amount: 450 };
      Payment.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockPayment)
      });

      const result = await getPaymentStatus({ bookingId: "book-123" });
      expect(result._id).toBe("pay-status-1");
    });

    test("retrieves payment status by transactionId", async () => {
      Payment.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue({ _id: "pt" }) });
      const result = await getPaymentStatus({ transactionId: "t1" });
      expect(result._id).toBe("pt");
    });

    test("throws 400 if neither provided", async () => {
      await expect(getPaymentStatus({})).rejects.toThrow("Either bookingId or transactionId is required");
    });

    test("throws 404 if payment not found", async () => {
      Payment.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
      await expect(getPaymentStatus({ bookingId: "bx" })).rejects.toThrow("Payment record not found");
    });
  });
});
