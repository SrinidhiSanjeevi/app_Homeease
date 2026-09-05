const paymentClient = require("../services/payment/paymentClient");
const AppError = require("../utils/AppError");

describe("Customer API → Payment Service Client Adapter", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test("1. createOrder: sends POST to /api/payments/order and returns order details", async () => {
    const mockOrderResponse = {
      orderId: "order_test_999",
      amount: 50000,
      currency: "INR",
      keyId: "rzp_test_mock"
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockOrderResponse)
    });

    const result = await paymentClient.createOrder({
      bookingId: "book-123",
      userId: "user-123"
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/payments/order"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bookingId: "book-123", userId: "user-123" })
      })
    );
    expect(result).toEqual(mockOrderResponse);
  });

  test("2. verifyPayment: forwards verification request to Payment Service", async () => {
    const mockVerifyResponse = {
      isValid: true,
      booking: { _id: "book-123", paymentStatus: "Paid" },
      payment: { _id: "pay-123", status: "Success" }
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockVerifyResponse)
    });

    const result = await paymentClient.verifyPayment({
      bookingId: "book-123",
      userId: "user-123",
      razorpayOrderId: "order_123",
      razorpayPaymentId: "pay_123",
      razorpaySignature: "sig_123"
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/payments/verify"),
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(result.isValid).toBe(true);
  });

  test("3. refundPayment: sends refund request and handles response", async () => {
    const mockRefund = { id: "rfnd_abc_1", amount: 50000 };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true, refund: mockRefund })
    });

    const result = await paymentClient.refundPayment("book-123");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/payments/refund"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bookingId: "book-123" })
      })
    );
    expect(result).toEqual(mockRefund);
  });

  test("4. getPaymentStatus: queries status by bookingId", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ success: true, payment: { status: "Success" } })
    });

    const result = await paymentClient.getPaymentStatus({ bookingId: "book-123" });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/payments/status?bookingId=book-123"),
      expect.objectContaining({ method: "GET" })
    );
    expect(result.payment.status).toBe("Success");
  });

  test("5. processWebhook: forwards webhook payload and signature header", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: "ok", message: "Processed" })
    });

    const result = await paymentClient.processWebhook({
      rawPayload: '{"event":"payment.captured"}',
      signature: "test_sig_123",
      eventHeaders: { "x-razorpay-event-id": "evt_1" }
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/payments/webhook"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-razorpay-signature": "test_sig_123",
          "x-razorpay-event-id": "evt_1"
        })
      })
    );
    expect(result.statusCode).toBe(200);
  });

  test("6. error handling: transforms 400 from Payment Service into operational AppError", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({ message: "This booking is already paid" })
    });

    await expect(
      paymentClient.createOrder({ bookingId: "book-already-paid", userId: "u1" })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "This booking is already paid",
      isOperational: true
    });
  });

  test("7. error handling: handles network outage with 503 operational AppError", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      paymentClient.createOrder({ bookingId: "book-down", userId: "u1" })
    ).rejects.toMatchObject({
      statusCode: 503,
      message: "Payment service is temporarily unavailable",
      isOperational: true
    });
  });
});
