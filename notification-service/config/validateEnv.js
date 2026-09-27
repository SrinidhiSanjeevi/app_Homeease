// SMTP vars (EMAIL_USER/EMAIL_PASS/EMAIL_FROM) are deliberately NOT required
// here — same soft/optional treatment backend gave them today: when unset,
// emailProvider.js simulates delivery (logs only) instead of failing, so the
// service can run locally/in CI without real SMTP credentials.
const REQUIRED_ENV = ["MONGO_URI", "BOOKING_SERVICE_URL"];

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
