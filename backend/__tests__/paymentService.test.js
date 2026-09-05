const { createOrder, verifyPayment, refundPayment } = require("../controllers/paymentController");
const paymentClient = require("../services/payment/paymentClient");

jest.mock("../services/payment/paymentClient");

describe("Customer API Payment Controller & Client Integration", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  test("1. createOrder: returns order details from paymentClient", async () => {
    req = {
      user: { _id: "user-123" },
      body: { bookingId: "book-123" }
    };

    paymentClient.createOrder.mockResolvedValue({
      orderId: "order_mock_1",
      amount: 50000,
      currency: "INR",
      keyId: "rzp_mock"
    });

    await createOrder(req, res);

    expect(paymentClient.createOrder).toHaveBeenCalledWith({
      bookingId: "book-123",
      userId: "user-123"
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        orderId: "order_mock_1"
      })
    );
  });

  test("2. verifyPayment: delegates verification and returns booking/payment", async () => {
    req = {
      user: { _id: "user-123" },
      body: {
        bookingId: "book-123",
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_123",
        razorpay_signature: "sig_123"
      }
    };

    paymentClient.verifyPayment.mockResolvedValue({
      isValid: true,
      booking: { _id: "book-123", paymentStatus: "Paid" },
      payment: { _id: "pay-123", status: "Success" }
    });

    await verifyPayment(req, res);

    expect(paymentClient.verifyPayment).toHaveBeenCalledWith({
      bookingId: "book-123",
      userId: "user-123",
      razorpayOrderId: "order_123",
      razorpayPaymentId: "pay_123",
      razorpaySignature: "sig_123"
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true
      })
    );
  });

  test("3. refundPayment: delegates refund to paymentClient", async () => {
    paymentClient.refundPayment.mockResolvedValue({ id: "rfnd_123", amount: 50000 });

    const refund = await refundPayment("book-123");

    expect(paymentClient.refundPayment).toHaveBeenCalledWith("book-123");
    expect(refund.id).toBe("rfnd_123");
  });
});
