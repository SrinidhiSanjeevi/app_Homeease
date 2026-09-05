const { handleWebhook } = require("../controllers/paymentController");
const paymentClient = require("../services/payment/paymentClient");

jest.mock("../services/payment/paymentClient");

describe("Customer API Payment Controller - Webhook Delegation", () => {
  let req;
  let res;

  beforeEach(() => {
    jest.clearAllMocks();

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  test("1. forwards rawBody and signature to paymentClient and returns 200", async () => {
    const rawPayload = JSON.stringify({ event: "payment.captured", id: "evt_123" });
    req = {
      headers: {
        "x-razorpay-signature": "sig_valid_123",
        "x-razorpay-event-id": "evt_123"
      },
      rawBody: Buffer.from(rawPayload),
      body: { event: "payment.captured", id: "evt_123" }
    };

    paymentClient.processWebhook.mockResolvedValue({
      statusCode: 200,
      status: "ok",
      message: "Payment captured and booking updated"
    });

    await handleWebhook(req, res);

    expect(paymentClient.processWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        rawPayload,
        signature: "sig_valid_123",
        eventHeaders: req.headers
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ok",
        message: "Payment captured and booking updated"
      })
    );
  });

  test("2. returns 400 when paymentClient rejects invalid signature", async () => {
    req = {
      headers: { "x-razorpay-signature": "sig_bad" },
      body: { event: "payment.captured" }
    };

    paymentClient.processWebhook.mockResolvedValue({
      statusCode: 400,
      success: false,
      message: "Invalid signature"
    });

    await handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Invalid signature" })
    );
  });

  test("3. handles duplicate webhook idempotency response", async () => {
    req = {
      headers: { "x-razorpay-signature": "sig_dup" },
      body: { event: "payment.captured" }
    };

    paymentClient.processWebhook.mockResolvedValue({
      statusCode: 200,
      status: "ok",
      message: "Payment already processed"
    });

    await handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ok", message: "Payment already processed" })
    );
  });
});
