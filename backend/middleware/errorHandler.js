const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let details = err.details || null;

  // Handle Mongoose Bad ObjectId (CastError)
  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid format for field '${err.path}'`;
  }

  // Handle Mongoose Validation Error
  if (err.name === "ValidationError") {
    statusCode = 422;
    message = "Database validation failed";
    details = Object.values(err.errors || {}).map((e) => e.message);
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token. Please authenticate again.";
  }
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token has expired. Please log in again.";
  }

  // Log error with correlation ID
  const isServerFault = statusCode >= 500;
  const logData = {
    requestId: req.id || "no-request-id",
    method: req.method,
    url: req.originalUrl,
    statusCode,
    errMessage: err.message
  };

  if (isServerFault) {
    logger.error({ ...logData, stack: err.stack }, "Unhandled server error occurred");
  } else {
    logger.warn(logData, "Client-side / operational error handled");
  }

  const responseBody = {
    success: false,
    message,
    ...(details && { details }),
    requestId: req.id || undefined,
    ...(process.env.NODE_ENV !== "production" && isServerFault && { stack: err.stack })
  };

  res.status(statusCode).json(responseBody);
};

module.exports = errorHandler;
