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
