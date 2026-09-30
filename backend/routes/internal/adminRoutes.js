const express = require("express");
const router = express.Router();
const { requireInternalToken } = require("../../middleware/internalAuth");
const {
  getStats,
  getAllUsers,
  getUserById,
  deleteUser,
  getAllBookings,
  updateBookingStatus,
  getAllServices,
  createService,
  updateService,
  deleteService,
  getAreas,
  getAllProfessionals,
  createProfessional,
  updateProfessional,
  deleteProfessional,
  getAllEmergencies,
  updateEmergencyStatus,
} = require("../../controllers/internal/adminBookingController");

router.use(requireInternalToken);

// Stats
router.get("/stats", getStats);

// Users
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.delete("/users/:id", deleteUser);

// Bookings
router.get("/bookings", getAllBookings);
router.put("/bookings/:id/status", updateBookingStatus);

// Services (full CRUD)
router.get("/services", getAllServices);
router.post("/services", createService);
router.put("/services/:id", updateService);
router.delete("/services/:id", deleteService);

// Service areas (home area of each professional)
router.get("/areas", getAreas);

// Professionals (full CRUD)
router.get("/professionals", getAllProfessionals);
router.post("/professionals", createProfessional);
router.put("/professionals/:id", updateProfessional);
router.delete("/professionals/:id", deleteProfessional);

// Emergencies
router.get("/emergencies", getAllEmergencies);
router.put("/emergencies/:id/status", updateEmergencyStatus);

module.exports = router;
