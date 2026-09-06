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
  });

  describe("Refund Processing", () => {
    test("refunds payment successfully through Razorpay API", async () => {
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
  });

  describe("Payment Status Query", () => {
    test("retrieves payment status by bookingId", async () => {
      const mockPayment = { _id: "pay-status-1", status: "Success", amount: 450 };
      Payment.findOne.mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockPayment)
      });

      const result = await getPaymentStatus({ bookingId: "book-123" });
      expect(result._id).toBe("pay-status-1");
    });
  });
});
