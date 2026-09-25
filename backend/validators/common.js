const { body } = require("express-validator");

// Indian mobile number: optional +91 / 0 prefix, then 10 digits starting 6-9.
// Normalised to the bare 10 digits.
const mobileNumber = (field = "contactNumber") =>
  body(field)
    .trim()
    .customSanitizer((value) => String(value || "").replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=[6-9]\d{9}$)/, ""))
    .matches(/^[6-9]\d{9}$/)
    .withMessage("Please enter a valid 10-digit mobile number");

const serviceAddress = (field = "address") =>
  body(field)
    .trim()
    .isLength({ min: 5, max: 300 })
    .withMessage("Please enter the full address (5–300 characters)");

module.exports = { mobileNumber, serviceAddress };
