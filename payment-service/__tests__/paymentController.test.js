const paymentController = require("../controllers/paymentController");
const paymentService = require("../services/paymentService");
const metrics = require("../metrics");

jest.mock("../services/paymentService");
jest.mock("../metrics", () => ({
  paymentOrderCreatedTotal: { inc: jest.fn() },
  paymentVerifySuccessTotal: { inc: jest.fn() },
  paymentVerifyFailedTotal: { inc: jest.fn() },
  paymentRefundTotal: { inc: jest.fn() }
}));
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe("paymentController", () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      query: {},
      headers: {},
      rawBody: null
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe("createOrder", () => {
    it("should return 400 if bookingId or userId is missing", async () => {
      req.body = { bookingId: "b1" };
      await paymentController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "bookingId and userId are required" });
    });

    it("should create order, increment metric, and return 200", async () => {
      req.body = { bookingId: "b1", userId: "u1" };
      const mockOrder = { orderId: "order_1", amount: 500 };
      paymentService.createOrder.mockResolvedValue(mockOrder);

      await paymentController.createOrder(req, res);
      
      expect(paymentService.createOrder).toHaveBeenCalledWith({ bookingId: "b1", userId: "u1" });
      expect(metrics.paymentOrderCreatedTotal.inc).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, ...mockOrder });
    });

    it("should handle operational errors from service", async () => {
      req.body = { bookingId: "b1", userId: "u1" };
      const opError = new Error("Not Found");
      opError.isOperational = true;
      opError.statusCode = 404;
      paymentService.createOrder.mockRejectedValue(opError);

      await paymentController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Not Found" });
    });

    it("should handle unexpected errors with 500", async () => {
      req.body = { bookingId: "b1", userId: "u1" };
      paymentService.createOrder.mockRejectedValue(new Error("DB failure"));

      await paymentController.createOrder(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Could not create payment order" });
    });
  });

  describe("verifyPayment", () => {
    it("should return 400 if fields are missing", async () => {
      req.body = { bookingId: "b1" }; // missing other fields
      await paymentController.verifyPayment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should handle camelCase fields and success", async () => {
      req.body = {
        bookingId: "b1",
        userId: "u1",
        razorpayOrderId: "order_1",
        razorpayPaymentId: "pay_1",
        razorpaySignature: "sig_1"
      };
      paymentService.verifyPayment.mockResolvedValue({ isValid: true, booking: {}, payment: {} });

      await paymentController.verifyPayment(req, res);
      expect(metrics.paymentVerifySuccessTotal.inc).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it("should handle snake_case fields and invalid signature", async () => {
      req.body = {
        bookingId: "b1",
        userId: "u1",
        razorpay_order_id: "order_1",
        razorpay_payment_id: "pay_1",
        razorpay_signature: "sig_bad"
      };
      paymentService.verifyPayment.mockResolvedValue({ isValid: false });

      await paymentController.verifyPayment(req, res);
      expect(metrics.paymentVerifyFailedTotal.inc).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it("should handle service errors", async () => {
      req.body = {
        bookingId: "b1", userId: "u1",
        razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", razorpaySignature: "sig_1"
      };
      const opError = new Error("Invalid");
      opError.isOperational = true;
      opError.statusCode = 403;
      paymentService.verifyPayment.mockRejectedValue(opError);

      await paymentController.verifyPayment(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });
    
    it("should handle unexpected errors", async () => {
      req.body = {
        bookingId: "b1", userId: "u1",
        razorpayOrderId: "order_1", razorpayPaymentId: "pay_1", razorpaySignature: "sig_1"
      };
      paymentService.verifyPayment.mockRejectedValue(new Error("Network failure"));
      await paymentController.verifyPayment(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("refundPayment", () => {
    it("should return 400 if bookingId missing", async () => {
      await paymentController.refundPayment(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should return 404 if refund is null", async () => {
      req.body = { bookingId: "b1" };
      paymentService.refundPayment.mockResolvedValue(null);
      await paymentController.refundPayment(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should process refund and return 200", async () => {
      req.body = { bookingId: "b1" };
      paymentService.refundPayment.mockResolvedValue({ refundId: "ref_1" });
      await paymentController.refundPayment(req, res);
      expect(metrics.paymentRefundTotal.inc).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should handle unexpected errors with 500", async () => {
      req.body = { bookingId: "b1" };
      paymentService.refundPayment.mockRejectedValue(new Error("API fail"));
      await paymentController.refundPayment(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getStatus", () => {
    it("should return 200 with payment status", async () => {
      req.query = { bookingId: "b1" };
      paymentService.getPaymentStatus.mockResolvedValue({ status: "PAID" });
      await paymentController.getStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, payment: { status: "PAID" } });
    });

    it("should handle operational errors", async () => {
      req.query = { bookingId: "b1" };
      const opError = new Error("Not Found");
      opError.isOperational = true;
      opError.statusCode = 404;
      paymentService.getPaymentStatus.mockRejectedValue(opError);
      await paymentController.getStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("should handle unexpected errors", async () => {
      req.query = { bookingId: "b1" };
      paymentService.getPaymentStatus.mockRejectedValue(new Error("DB error"));
      await paymentController.getStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("handleWebhook", () => {
    it("should process webhook and return service status code with rawBody string", async () => {
      req.headers["x-razorpay-signature"] = "sig_1";
      req.rawBody = Buffer.from('{"event":"payment.captured"}');
      paymentService.processWebhook.mockResolvedValue({ statusCode: 200, success: true });
      
      await paymentController.handleWebhook(req, res);
      
      expect(paymentService.processWebhook).toHaveBeenCalledWith(expect.objectContaining({
        rawPayload: '{"event":"payment.captured"}',
        signature: "sig_1"
      }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it("should handle string req.body fallback", async () => {
      req.headers["x-razorpay-signature"] = "sig_1";
      req.body = '{"event":"payment.failed"}';
      paymentService.processWebhook.mockResolvedValue({ statusCode: 200 });
      
      await paymentController.handleWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should handle object req.body fallback", async () => {
      req.headers["x-razorpay-signature"] = "sig_1";
      req.body = { event: "payment.failed" };
      paymentService.processWebhook.mockResolvedValue({ statusCode: 200 });
      
      await paymentController.handleWebhook(req, res);
      expect(paymentService.processWebhook).toHaveBeenCalledWith(expect.objectContaining({
        rawPayload: JSON.stringify({ event: "payment.failed" })
      }));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should handle unexpected errors", async () => {
      paymentService.processWebhook.mockRejectedValue(new Error("Fail"));
      await paymentController.handleWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
