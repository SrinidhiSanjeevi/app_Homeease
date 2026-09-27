const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");
// admin-backend no longer holds a local User model/DB (Stage 1 split) —
// the authenticated user is fetched from booking-service instead.
const bookingServiceClient = require("../services/bookingServiceClient");

const protect = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Not authorized, no token provided"
        });
    }

    try {
        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Not authorized, no token provided"
            });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // A "password OK, MFA pending" token is only good for /mfa/verify —
        // never as a login, or MFA could be skipped entirely.
        if (decoded.mfaPending) {
            return res.status(401).json({
                success: false,
                message: "Two-factor verification required"
            });
        }

        let userData;
        try {
            userData = await bookingServiceClient.getUserById(decoded.id);
        } catch (fetchError) {
            if (fetchError.statusCode === 404) {
                return res.status(401).json({
                    success: false,
                    message: "Not authorized, user not found"
                });
            }
            // Network/service errors (e.g. booking-service unreachable) fall
            // through to the outer catch below.
            throw fetchError;
        }

        req.user = userData.user;

        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Not authorized, user not found"
            });
        }

        // Deactivated accounts lose access immediately, not when the
        // access token expires.
        if (req.user.active === false) {
            return res.status(401).json({
                success: false,
                message: "This account has been deactivated"
            });
        }

        next();

    } catch (error) {
        logger.warn({ err: error.message }, "Auth Middleware Error");

        return res.status(401).json({
            success: false,
            message: "Not authorized, token failed"
        });
    }
};

module.exports = { protect };