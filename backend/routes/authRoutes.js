const express = require("express");
const router = express.Router();
const { signup, login } = require("../controllers/authController");
const { authLimiter } = require("../middleware/rateLimiter");
const validate = require("../middleware/validate");
const { signupRules, loginRules } = require("../validators/authValidators");

router.post("/signup", authLimiter, validate(signupRules), signup);
router.post("/login", authLimiter, validate(loginRules), login);

module.exports = router;
