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

const requiredCoordinates = [
  body("latitude").exists({ values: "null" }).withMessage("Location is required").bail().isFloat({ min: -90, max: 90 }).withMessage("Latitude must be between -90 and 90"),
  body("longitude").exists({ values: "null" }).withMessage("Location is required").bail().isFloat({ min: -180, max: 180 }).withMessage("Longitude must be between -180 and 180"),
  body("accuracy").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("Accuracy must be a positive number")
];

module.exports = { mobileNumber, serviceAddress, requiredCoordinates };
