const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");
const { auditAction } = require("../middleware/auditMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const {
  getStats,
  getAllUsers,
  deleteUser,
  getAllBookings,
  updateBookingStatus,
  getAllServices,
  createService,
  updateService,
  deleteService,
  getAllProfessionals,
  createProfessional,
  updateProfessional,
  deleteProfessional,
  getAllEmergencies,
  updateEmergencyStatus,
  getAuditLogs,
} = require("../controllers/adminController");

// All routes are protected by JWT auth + admin role check
const guard = [protect, adminOnly];

// Stats
router.get("/stats",                    ...guard, getStats);

// Audit Logs
router.get("/audit-logs",               ...guard, requirePermission("audit:read"), getAuditLogs);

// Users
router.get("/users",                    ...guard, requirePermission("users:read"), getAllUsers);
router.delete("/users/:id",             ...guard, requirePermission("users:delete"), auditAction("USER_DELETED", "User"), deleteUser);

// Bookings
router.get("/bookings",                 ...guard, requirePermission("bookings:read"), getAllBookings);
router.put("/bookings/:id/status",      ...guard, requirePermission("bookings:manage"), auditAction("BOOKING_STATUS_UPDATED", "Booking"), updateBookingStatus);

// Services (full CRUD)
router.get("/services",                 ...guard, requirePermission("services:read"), getAllServices);
router.post("/services",                ...guard, requirePermission("services:manage"), auditAction("SERVICE_CREATED", "Service"), createService);
router.put("/services/:id",             ...guard, requirePermission("services:manage"), auditAction("SERVICE_UPDATED", "Service"), updateService);
router.delete("/services/:id",          ...guard, requirePermission("services:manage"), auditAction("SERVICE_DELETED", "Service"), deleteService);

// Professionals (full CRUD)
router.get("/professionals",            ...guard, requirePermission("professionals:read"), getAllProfessionals);
router.post("/professionals",           ...guard, requirePermission("professionals:manage"), auditAction("PROFESSIONAL_CREATED", "Professional"), createProfessional);
router.put("/professionals/:id",        ...guard, requirePermission("professionals:manage"), auditAction("PROFESSIONAL_UPDATED", "Professional"), updateProfessional);
router.delete("/professionals/:id",     ...guard, requirePermission("professionals:manage"), auditAction("PROFESSIONAL_DELETED", "Professional"), deleteProfessional);

// Emergencies
router.get("/emergencies",              ...guard, requirePermission("emergencies:manage"), getAllEmergencies);
router.put("/emergencies/:id/status",   ...guard, requirePermission("emergencies:manage"), auditAction("EMERGENCY_STATUS_UPDATED", "EmergencyRequest"), updateEmergencyStatus);

module.exports = router;
