const { validationResult } = require("express-validator");

const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    for (const validation of validations) {
      const result = await validation.run(req);
      if (result.errors.length) break; // fail fast
    }

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const errorDetails = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg
    }));

    return res.status(400).json({
      success: false,
      message: errorDetails[0]?.message || "Invalid input data",
      errors: errorDetails
    });
  };
};

module.exports = validate;
