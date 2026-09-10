const express = require("express");
const router = express.Router();
const {
  signup,
  login,
  verifyMfa,
  setupMfa,
  confirmMfa,
  refreshToken,
  logout
} = require("../controllers/authController");
const { authLimiter } = require("../middleware/rateLimiter");
const { protect } = require("../middleware/authMiddleware");
const validate = require("../middleware/validate");
const { signupRules, loginRules } = require("../validators/authValidators");

router.post("/signup", authLimiter, validate(signupRules), signup);
router.post("/login", authLimiter, validate(loginRules), login);
router.post("/mfa/verify", authLimiter, verifyMfa);
router.post("/mfa/setup", protect, setupMfa);
router.post("/mfa/confirm", protect, confirmMfa);
router.post("/refresh", refreshToken);
router.post("/logout", logout);

module.exports = router;
