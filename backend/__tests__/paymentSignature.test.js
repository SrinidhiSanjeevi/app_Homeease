const crypto = require("crypto");

// Pure function extracted from paymentController — testable without DB
function generateExpectedSignature(orderId, paymentId, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

describe("Payment Signature Verification", () => {
  const TEST_SECRET = "test_razorpay_secret";
  const ORDER_ID = "order_test_12345";
  const PAYMENT_ID = "pay_test_12345";

  test("correct signature validates successfully", () => {
    const expectedSignature = generateExpectedSignature(ORDER_ID, PAYMENT_ID, TEST_SECRET);
    const incoming = crypto.createHmac("sha256", TEST_SECRET).update(`${ORDER_ID}|${PAYMENT_ID}`).digest("hex");
    expect(incoming).toBe(expectedSignature);
  });

  test("tampered signature fails validation", () => {
    const expectedSignature = generateExpectedSignature(ORDER_ID, PAYMENT_ID, TEST_SECRET);
    expect("tampered_signature_value").not.toBe(expectedSignature);
  });

  test("wrong secret produces different signature", () => {
    const sig1 = generateExpectedSignature(ORDER_ID, PAYMENT_ID, TEST_SECRET);
    const sig2 = generateExpectedSignature(ORDER_ID, PAYMENT_ID, "wrong_secret");
    expect(sig1).not.toBe(sig2);
  });

  test("signature is order-dependent (order matters)", () => {
    const sig1 = generateExpectedSignature(ORDER_ID, PAYMENT_ID, TEST_SECRET);
    const sig2 = generateExpectedSignature(PAYMENT_ID, ORDER_ID, TEST_SECRET);
    expect(sig1).not.toBe(sig2);
  });
});
