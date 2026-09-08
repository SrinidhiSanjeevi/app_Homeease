const { REQUIRED_ENV, validateEnv } = require("../config/validateEnv");

describe("Environment Validation (validateEnv)", () => {
  const completeEnv = {
    MONGO_URI: "mongodb://localhost:27017/test",
    RAZORPAY_KEY_ID: "rzp_test_12345",
    RAZORPAY_KEY_SECRET: "secret_67890",
    RAZORPAY_WEBHOOK_SECRET: "whsec_abcde"
  };

  it("should declare the expected required environment variables", () => {
    expect(REQUIRED_ENV).toEqual([
      "MONGO_URI",
      "RAZORPAY_KEY_ID",
      "RAZORPAY_KEY_SECRET",
      "RAZORPAY_WEBHOOK_SECRET"
    ]);
  });

  it("should pass validation when all required variables are present and non-empty", () => {
    const result = validateEnv(completeEnv);
    expect(result.isValid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("should fail validation if MONGO_URI is missing", () => {
    const env = { ...completeEnv };
    delete env.MONGO_URI;

    const result = validateEnv(env);
    expect(result.isValid).toBe(false);
    expect(result.missing).toEqual(["MONGO_URI"]);
  });

  it("should fail validation if RAZORPAY_KEY_ID is missing", () => {
    const env = { ...completeEnv };
    delete env.RAZORPAY_KEY_ID;

    const result = validateEnv(env);
    expect(result.isValid).toBe(false);
    expect(result.missing).toEqual(["RAZORPAY_KEY_ID"]);
  });

  it("should fail validation if RAZORPAY_KEY_SECRET is missing", () => {
    const env = { ...completeEnv };
    delete env.RAZORPAY_KEY_SECRET;

    const result = validateEnv(env);
    expect(result.isValid).toBe(false);
    expect(result.missing).toEqual(["RAZORPAY_KEY_SECRET"]);
  });

  it("should fail validation if RAZORPAY_WEBHOOK_SECRET is missing", () => {
    const env = { ...completeEnv };
    delete env.RAZORPAY_WEBHOOK_SECRET;

    const result = validateEnv(env);
    expect(result.isValid).toBe(false);
    expect(result.missing).toEqual(["RAZORPAY_WEBHOOK_SECRET"]);
  });

  it("should treat empty strings and whitespace-only strings as missing", () => {
    const env = {
      MONGO_URI: "   ",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "secret_67890",
      RAZORPAY_WEBHOOK_SECRET: "whsec_abcde"
    };

    const result = validateEnv(env);
    expect(result.isValid).toBe(false);
    expect(result.missing).toEqual(["MONGO_URI", "RAZORPAY_KEY_ID"]);
  });

  it("should report all missing variables when multiple are missing", () => {
    const result = validateEnv({});
    expect(result.isValid).toBe(false);
    expect(result.missing).toEqual(REQUIRED_ENV);
  });
});
