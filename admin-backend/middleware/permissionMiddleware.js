/**
 * Permission-based authorization middleware.
 * Supports granular scopes like 'users:delete', 'services:write', 'bookings:manage', etc.
 * Admins with 'all' or default wildcard permissions pass all checks.
 */
const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied: Admin privileges required"
      });
    }

    const userPermissions = Array.isArray(req.user.permissions) ? req.user.permissions : [];

    // Default admin with no restricted scopes or explicit 'all' permission has full access
    if (
      userPermissions.length === 0 ||
      userPermissions.includes("all") ||
      userPermissions.includes(requiredPermission)
    ) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `Access denied: Missing required permission [${requiredPermission}]`
    });
  };
};

module.exports = { requirePermission };
