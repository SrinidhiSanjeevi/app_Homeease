const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");
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
} = require("../controllers/adminController");

// All routes are protected by JWT auth + admin role check
const guard = [protect, adminOnly];

// Stats
router.get("/stats",                    ...guard, getStats);

// Users
router.get("/users",                    ...guard, getAllUsers);
router.delete("/users/:id",             ...guard, deleteUser);

// Bookings
router.get("/bookings",                 ...guard, getAllBookings);
router.put("/bookings/:id/status",      ...guard, updateBookingStatus);

// Services (full CRUD)
router.get("/services",                 ...guard, getAllServices);
router.post("/services",                ...guard, createService);
router.put("/services/:id",             ...guard, updateService);
router.delete("/services/:id",          ...guard, deleteService);

// Professionals (full CRUD)
router.get("/professionals",            ...guard, getAllProfessionals);
router.post("/professionals",           ...guard, createProfessional);
router.put("/professionals/:id",        ...guard, updateProfessional);
router.delete("/professionals/:id",     ...guard, deleteProfessional);

// Emergencies
router.get("/emergencies",              ...guard, getAllEmergencies);
router.put("/emergencies/:id/status",   ...guard, updateEmergencyStatus);

module.exports = router;
