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
    .withMessage("Severity must be one of: Low, Medium, High, Critical")
];

const cancelEmergencyRules = [
  param("id").isMongoId().withMessage("Valid emergency request ID is required")
];

module.exports = {
  dispatchEmergencyRules,
  cancelEmergencyRules
};
