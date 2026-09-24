const { body } = require("express-validator");

const signupRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 100 })
    .withMessage("Name cannot exceed 100 characters"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("A valid email is required")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be 8–128 characters")
    .matches(/[a-z]/)
    .withMessage("Password must include a lowercase letter")
    .matches(/[A-Z]/)
    .withMessage("Password must include an uppercase letter")
    .matches(/\d/)
    .withMessage("Password must include a number")
];

const loginRules = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("A valid email is required")
    .normalizeEmail(),
  body("password")
    .notEmpty()
    .withMessage("Password is required")
];

module.exports = { signupRules, loginRules };
