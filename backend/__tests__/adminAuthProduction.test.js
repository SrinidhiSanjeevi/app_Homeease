const User = require("../models/User");
const { login, verifyMfa, refreshToken, logout } = require("../controllers/authController");
const { generateSecret, generateCurrentToken, verifyTotp } = require("../utils/totp");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

jest.mock("../models/User");
jest.mock("bcryptjs");

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Production Admin Authentication & Hardening", () => {
  const JWT_SECRET = "test_super_secret_production_key_123";

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("RFC 6238 TOTP Engine", () => {
    test("generates secret and verifies valid TOTP token", () => {
      const secret = generateSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe("string");

      const token = generateCurrentToken(secret);
      expect(token).toMatch(/^\d{6}$/);

      const isValid = verifyTotp(token, secret);
      expect(isValid).toBe(true);
    });

    test("rejects invalid TOTP token", () => {
      const secret = generateSecret();
      const isValid = verifyTotp("000000", secret);
      expect(isValid).toBe(false);
    });
  });

  describe("Account Lockout & Brute-force Throttling", () => {
    test("rejects login immediately when account is locked", async () => {
      const futureLockDate = new Date(Date.now() + 10 * 60 * 1000);
      User.findOne.mockResolvedValue({
        _id: "user-locked",
        email: "target@example.com",
        password: "hashed_password",
        active: true,
        lockUntil: futureLockDate
      });

      const req = {
        body: { email: "target@example.com", password: "AnyPassword123" }
      };
      const res = createMockRes();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("temporarily locked")
        })
      );
    });

    test("increments failed attempts on invalid password and locks account on 5th attempt", async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      const mockUser = {
        _id: "user-victim",
        email: "victim@example.com",
        password: "hashed_password",
        active: true,
        failedLoginAttempts: 4,
        lockUntil: null,
        save: mockSave
      };

      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      const req = {
        body: { email: "victim@example.com", password: "WrongPassword" }
      };
      const res = createMockRes();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockUser.failedLoginAttempts).toBe(5);
      expect(mockUser.lockUntil).not.toBeNull();
      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe("Admin 2-Step MFA Flow", () => {
    test("triggers MFA requirement when admin has MFA enabled", async () => {
      const secret = generateSecret();
      const mockUser = {
        _id: "admin-123",
        name: "Security Admin",
        email: "admin@example.com",
        password: "hashed_password",
        role: "admin",
        active: true,
        isMfaEnabled: true,
        mfaSecret: secret,
        failedLoginAttempts: 0,
        lockUntil: null
      };

      User.findOne.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);

      const req = {
        body: { email: "admin@example.com", password: "CorrectAdminPassword123!" }
      };
      const res = createMockRes();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          mfaRequired: true,
          tempToken: expect.any(String),
          email: "admin@example.com"
        })
      );
    });

    test("successfully verifies MFA code with tempToken and issues full access token", async () => {
      const secret = generateSecret();
      const validCode = generateCurrentToken(secret);
      const tempToken = jwt.sign({ id: "admin-123", mfaPending: true }, JWT_SECRET, { expiresIn: "5m" });

      const mockSave = jest.fn().mockResolvedValue(true);
      const mockAdmin = {
        _id: "admin-123",
        name: "Security Admin",
        email: "admin@example.com",
        role: "admin",
        permissions: ["all"],
        isMfaEnabled: true,
        mfaSecret: secret,
        refreshTokens: [],
        save: mockSave
      };

      User.findById.mockResolvedValue(mockAdmin);

      const req = {
        body: { tempToken, code: validCode }
      };
      const res = createMockRes();

      await verifyMfa(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          token: expect.any(String),
          refreshToken: expect.any(String),
          user: expect.objectContaining({
            email: "admin@example.com",
            role: "admin"
          })
        })
      );
    });
  });

  describe("Refresh Token Strategy & Logout", () => {
    test("rotates refresh token and issues fresh access token", async () => {
      const rawRefreshToken = "sample-valid-refresh-token-xyz";
      const crypto = require("crypto");
      const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");

      const mockSave = jest.fn().mockResolvedValue(true);
      const mockUser = {
        _id: "user-refresh",
        name: "Token User",
        email: "token@example.com",
        role: "user",
        active: true,
        refreshTokens: [
          { tokenHash, expiresAt: new Date(Date.now() + 100000) }
        ],
        save: mockSave
      };

      User.findOne.mockResolvedValue(mockUser);

      const req = {
        body: { refreshToken: rawRefreshToken }
      };
      const res = createMockRes();

      await refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          token: expect.any(String),
          refreshToken: expect.any(String)
        })
      );
    });

    test("revokes refresh token on logout", async () => {
      User.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const req = {
        body: { refreshToken: "logout-token-123" }
      };
      const res = createMockRes();

      await logout(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Logged out successfully"
      });
    });
  });
});
