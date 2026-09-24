const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");

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

        req.user = await User.findById(decoded.id)
            .select("-password");

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