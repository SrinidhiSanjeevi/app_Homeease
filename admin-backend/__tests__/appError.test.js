const AppError = require("../utils/AppError");

describe("Admin AppError Utility", () => {
  test("creates operational 403 error correctly", () => {
    const err = new AppError("Forbidden action", 403);
    expect(err.message).toBe("Forbidden action");
    expect(err.statusCode).toBe(403);
    expect(err.status).toBe("fail");
    expect(err.isOperational).toBe(true);
  });
});
