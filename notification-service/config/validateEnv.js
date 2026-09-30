const REQUIRED_ENV = ["MONGO_URI", "BOOKING_SERVICE_URL"];

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
