const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");
const { generateSecret, verifyTotp, getOtpAuthUrl } = require("../utils/totp");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Helper to hash refresh token before storing in MongoDB
 */
const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Helper to generate access & refresh tokens
 */
const generateTokens = async (user, req = null) => {
  const accessToken = jwt.sign(
    { id: user._id, role: user.role, permissions: user.permissions || [] },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );

  const rawRefreshToken = crypto.randomBytes(40).toString("hex");
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
  const ip = req?.headers ? req.headers["x-forwarded-for"] || req?.socket?.remoteAddress || "" : "";
  const userAgent = req?.headers ? req.headers["user-agent"] || "" : "";

  // Append new refresh token and prune expired ones
  const activeTokens = (user.refreshTokens || []).filter(
    (rt) => rt.expiresAt && new Date(rt.expiresAt) > new Date()
  );

  activeTokens.push({
    tokenHash,
    expiresAt,
    userAgent: String(userAgent),
    ip: String(ip),
    createdAt: new Date()
  });

  if (typeof user.save === "function") {
    user.refreshTokens = activeTokens;
    await user.save();
  } else if (User.updateOne) {
    await User.updateOne({ _id: user._id }, { $set: { refreshTokens: activeTokens } });
  }

  return {
    accessToken,
    refreshToken: rawRefreshToken
  };
};

// SIGNUP
const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Name is required" });
    }
    if (!EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "A valid email is required" });
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
    });

    res.status(201).json({ success: true, message: "User registered successfully" });
  } catch (error) {
    logger.error({ err: error.message }, "SIGNUP ERROR");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    if (user.active === false) {
      return res.status(403).json({ success: false, message: "Account has been deactivated" });
    }

    // Account Lockout Protection
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(user.lockUntil) - new Date()) / (60 * 1000));
      return res.status(403).json({
        success: false,
        message: `Account is temporarily locked due to consecutive failed login attempts. Please try again in ${remainingMinutes} minute(s).`
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      let lockUntil = null;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        logger.warn({ email: normalizedEmail, attempts }, "Account temporarily locked due to brute-force threshold");
      }

      if (typeof user.save === "function") {
        user.failedLoginAttempts = attempts;
        user.lockUntil = lockUntil;
        await user.save();
      } else if (User.updateOne) {
        await User.updateOne(
          { _id: user._id },
          { $set: { failedLoginAttempts: attempts, lockUntil } }
        );
      }

      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    // Reset failed login attempts upon successful password verification
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      if (typeof user.save === "function") {
        user.failedLoginAttempts = 0;
        user.lockUntil = null;
        await user.save();
      } else if (User.updateOne) {
        await User.updateOne(
          { _id: user._id },
          { $set: { failedLoginAttempts: 0, lockUntil: null } }
        );
      }
    }

    // Admin MFA check (2-Step Verification)
    if (user.role === "admin" && user.isMfaEnabled && user.mfaSecret) {
      const tempToken = jwt.sign(
        { id: user._id, mfaPending: true },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );

      return res.status(200).json({
        success: true,
        mfaRequired: true,
        tempToken,
        email: user.email,
        message: "Two-Factor Authentication required. Enter your 6-digit authenticator code."
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(user, req);

    res.status(200).json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        isMfaEnabled: Boolean(user.isMfaEnabled),
        phone: user.phone || "",
        address: user.address || "",
      },
    });
  } catch (error) {
    logger.error({ err: error.message }, "LOGIN ERROR");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

// VERIFY MFA (Second step of admin login)
const verifyMfa = async (req, res) => {
  try {
    const { tempToken, code } = req.body;

    if (!tempToken || !code) {
      return res.status(400).json({
        success: false,
        message: "Temporary token and 6-digit code are required"
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        message: "MFA session expired or invalid. Please sign in again."
      });
    }

    if (!decoded.mfaPending) {
      return res.status(400).json({ success: false, message: "Invalid MFA verification token" });
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.isMfaEnabled || !user.mfaSecret) {
      return res.status(400).json({ success: false, message: "MFA is not configured for this user" });
    }

    const isValid = verifyTotp(code, user.mfaSecret);
    if (!isValid) {
      return res.status(400).json({ success: false, message: "Invalid 6-digit authenticator code" });
    }

    const { accessToken, refreshToken } = await generateTokens(user, req);

    res.status(200).json({
      success: true,
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || [],
        isMfaEnabled: true,
        phone: user.phone || "",
        address: user.address || "",
      },
    });
  } catch (error) {
    logger.error({ err: error.message }, "MFA VERIFICATION ERROR");
    res.status(500).json({ success: false, message: "Failed to verify 2FA code" });
  }
};

// SETUP MFA (Generate TOTP secret and QR code URI for admin)
const setupMfa = async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const secret = generateSecret();
    const otpAuthUrl = getOtpAuthUrl(user.email, secret, "HomeEase");

    user.mfaSecret = secret;
    await user.save();

    res.status(200).json({
      success: true,
      secret,
      otpAuthUrl,
      message: "Scan the QR code or enter the secret into your authenticator app"
    });
  } catch (error) {
    logger.error({ err: error.message }, "SETUP MFA ERROR");
    res.status(500).json({ success: false, message: "Failed to initialize MFA setup" });
  }
};

// CONFIRM MFA (Activates MFA after testing the code)
const confirmMfa = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id || req.user.id);

    if (!user || !user.mfaSecret) {
      return res.status(400).json({ success: false, message: "Please run MFA setup first" });
    }

    const isValid = verifyTotp(code, user.mfaSecret);
    if (!isValid) {
      return res.status(400).json({ success: false, message: "Invalid verification code" });
    }

    user.isMfaEnabled = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Two-Factor Authentication has been successfully enabled"
    });
  } catch (error) {
    logger.error({ err: error.message }, "CONFIRM MFA ERROR");
    res.status(500).json({ success: false, message: "Failed to confirm MFA activation" });
  }
};

// REFRESH TOKEN (Rotates refresh token and issues new short-lived access token)
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: rawRefreshToken } = req.body;

    if (!rawRefreshToken) {
      return res.status(400).json({ success: false, message: "Refresh token is required" });
    }

    const tokenHash = hashToken(rawRefreshToken);
    const user = await User.findOne({
      "refreshTokens.tokenHash": tokenHash,
      "refreshTokens.expiresAt": { $gt: new Date() }
    });

    if (!user || user.active === false) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token. Please log in again."
      });
    }

    // Revoke used refresh token
    user.refreshTokens = (user.refreshTokens || []).filter((rt) => rt.tokenHash !== tokenHash);

    // Issue new token pair
    const tokens = await generateTokens(user, req);

    res.status(200).json({
      success: true,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });
  } catch (error) {
    logger.error({ err: error.message }, "REFRESH TOKEN ERROR");
    res.status(500).json({ success: false, message: "Failed to refresh token" });
  }
};

// LOGOUT (Revokes refresh token)
const logout = async (req, res) => {
  try {
    const { refreshToken: rawRefreshToken } = req.body;
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await User.updateOne(
        { "refreshTokens.tokenHash": tokenHash },
        { $pull: { refreshTokens: { tokenHash } } }
      );
    }
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    logger.error({ err: error.message }, "LOGOUT ERROR");
    res.status(500).json({ success: false, message: "Logout failed" });
  }
};

module.exports = {
  signup,
  login,
  verifyMfa,
  setupMfa,
  confirmMfa,
  refreshToken,
  logout
};