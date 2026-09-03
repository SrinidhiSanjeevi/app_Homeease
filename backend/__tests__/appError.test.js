const AppError = require("../utils/AppError");

describe("AppError Utility", () => {
  test("creates operational 400 error correctly", () => {
    const err = new AppError("Invalid input", 400, [{ field: "name", message: "Required" }]);
    expect(err.message).toBe("Invalid input");
    expect(err.statusCode).toBe(400);
    expect(err.status).toBe("fail");
    expect(err.isOperational).toBe(true);
    expect(err.details).toHaveLength(1);
  });

  test("creates operational 500 error correctly", () => {
    const err = new AppError("Database connection failed", 500);
    expect(err.message).toBe("Database connection failed");
    expect(err.statusCode).toBe(500);
    expect(err.status).toBe("error");
    expect(err.isOperational).toBe(true);
  });
});
