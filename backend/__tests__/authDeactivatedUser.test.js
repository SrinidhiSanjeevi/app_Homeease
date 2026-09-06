const User = require("../models/User");
const { login } = require("../controllers/authController");
const bcrypt = require("bcryptjs");

jest.mock("../models/User");
jest.mock("bcryptjs");

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Task 9: Deactivated User Login Rejection", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test_jwt_secret_12345";
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects login with 403 when user.active is false", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-deactivated",
      email: "deactivated@example.com",
      password: "hashed_password",
      active: false
    });

    const req = {
      body: {
        email: "deactivated@example.com",
        password: "ValidPassword123"
      }
    };
    const res = createMockRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Account has been deactivated"
    });
  });

  test("allows login when user.active is true (or undefined legacy)", async () => {
    User.findOne.mockResolvedValue({
      _id: "user-active",
      name: "Active Customer",
      email: "active@example.com",
      password: "hashed_password",
      role: "user",
      active: true
    });
    bcrypt.compare.mockResolvedValue(true);

    const req = {
      body: {
        email: "active@example.com",
        password: "ValidPassword123"
      }
    };
    const res = createMockRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        token: expect.any(String),
        user: expect.objectContaining({
          email: "active@example.com"
        })
      })
    );
  });
});
