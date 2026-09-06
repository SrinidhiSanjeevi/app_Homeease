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

  describe("timingSafeEqual comparison pattern", () => {
    function verifySignatureTimingSafe(expected, actual) {
      return (
        typeof actual === "string" &&
        expected.length === actual.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
      );
    }

    test("returns true for matching signature", () => {
      const expected = generateExpectedSignature(ORDER_ID, PAYMENT_ID, TEST_SECRET);
      const incoming = generateExpectedSignature(ORDER_ID, PAYMENT_ID, TEST_SECRET);
      expect(verifySignatureTimingSafe(expected, incoming)).toBe(true);
    });

    test("returns false for different length signature without throwing", () => {
      const expected = generateExpectedSignature(ORDER_ID, PAYMENT_ID, TEST_SECRET);
      const shortSig = "short_sig";
      expect(() => verifySignatureTimingSafe(expected, shortSig)).not.toThrow();
      expect(verifySignatureTimingSafe(expected, shortSig)).toBe(false);
    });

    test("returns false for same length tampered signature", () => {
      const expected = generateExpectedSignature(ORDER_ID, PAYMENT_ID, TEST_SECRET);
      const sameLengthTampered = "0".repeat(expected.length);
      expect(verifySignatureTimingSafe(expected, sameLengthTampered)).toBe(false);
    });

    test("returns false for null/undefined/non-string signature", () => {
      const expected = generateExpectedSignature(ORDER_ID, PAYMENT_ID, TEST_SECRET);
      expect(verifySignatureTimingSafe(expected, null)).toBe(false);
      expect(verifySignatureTimingSafe(expected, undefined)).toBe(false);
      expect(verifySignatureTimingSafe(expected, 12345)).toBe(false);
    });
  });
});
