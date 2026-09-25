const { body, param } = require("express-validator");
const { mobileNumber, serviceAddress, serviceArea } = require("./common");

const dispatchEmergencyRules = [
  body("category")
    .trim()
    .notEmpty()
    .withMessage("Emergency category is required")
    .isIn(["Electrical", "Plumbing", "Security", "Fire", "Medical"])
    .withMessage("Category must be one of: Electrical, Plumbing, Security, Fire, Medical"),
  serviceAddress("address"),
  mobileNumber("contactNumber"),
  serviceArea("area"),
  body("description").trim().isLength({ min: 3, max: 1000 }).withMessage("Please describe the emergency (3–1000 characters)"),
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
