// RAZORPAY_WEBHOOK_SECRET is deliberately NOT required here. Order
// creation/verification/refund only need RAZORPAY_KEY_ID/SECRET; webhook
// receipt is a separate, optional capability guarded at the point of use
// (see processWebhook in services/paymentService.js) so the service can
// run in TEST mode without a configured Razorpay webhook.
const REQUIRED_ENV = [
  "MONGO_URI",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET"
];

/**
 * Validates that all required environment variables are present and non-empty.
 * @param {Object} env - Environment object, defaults to process.env
 * @returns {{ isValid: boolean, missing: string[] }}
 */
const validateEnv = (env = process.env) => {
  const missing = REQUIRED_ENV.filter((key) => {
    const value = env[key];
    return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  });

  return {
    isValid: missing.length === 0,
    missing
  };
};

module.exports = {
  REQUIRED_ENV,
  validateEnv
};
