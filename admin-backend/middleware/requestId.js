const crypto = require("crypto");
const requestIdMiddleware = (req, res, next) => {
  const incomingId = req.headers["x-request-id"];
  const requestId = incomingId && typeof incomingId === "string" && incomingId.trim().length > 0
    ? incomingId.trim() : crypto.randomUUID();
  req.id = requestId;
  res.setHeader("X-Request-ID", requestId);
  next();
};
module.exports = requestIdMiddleware;
