const { body, param } = require("express-validator");

const dispatchEmergencyRules = [
  body("category")
    .trim()
    .notEmpty()
    .withMessage("Emergency category is required")
    .isIn(["Electrical", "Plumbing", "Security", "Fire", "Medical"])
    .withMessage("Category must be one of: Electrical, Plumbing, Security, Fire, Medical"),
  body("address").trim().notEmpty().withMessage("Emergency location address is required"),
  body("contactNumber").trim().notEmpty().withMessage("Contact number is required"),
  body("severity")
    .optional()
    .isIn(["Low", "Medium", "High", "Critical"])
    .withMessage("Severity must be one of: Low, Medium, High, Critical"),
  // Optional — only sent when the customer used "Use my current location".
  body("latitude").optional({ nullable: true }).isFloat({ min: -90, max: 90 }).withMessage("Latitude must be between -90 and 90"),
  body("longitude").optional({ nullable: true }).isFloat({ min: -180, max: 180 }).withMessage("Longitude must be between -180 and 180"),
  body("accuracy").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("Accuracy must be a positive number")
];

const cancelEmergencyRules = [
  param("id").isMongoId().withMessage("Valid emergency request ID is required")
];

module.exports = {
  dispatchEmergencyRules,
  cancelEmergencyRules
};
