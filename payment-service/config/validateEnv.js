const REQUIRED_ENV = [
  "MONGO_URI",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET"
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
