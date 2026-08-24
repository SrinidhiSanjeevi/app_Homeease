const User = require("../models/User");
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const Professional = require("../models/Professional");
const EmergencyRequest = require("../models/EmergencyRequest");

// ──────────────────────────────────────────────────────
// GET /api/admin/stats  — Dashboard overview counts
// ──────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalBookings,
      totalServices,
      totalProfessionals,
      totalEmergencies,
      pendingBookings,
      confirmedBookings,
      cancelledBookings,
      completedBookings,
      recentBookings,
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      Booking.countDocuments(),
      Service.countDocuments(),
      Professional.countDocuments(),
      EmergencyRequest.countDocuments(),
      Booking.countDocuments({ status: { $in: ["Assigned", "pending", "Created"] } }),
      Booking.countDocuments({ status: { $in: ["Confirmed", "confirmed"] } }),
      Booking.countDocuments({ status: { $in: ["Cancelled", "cancelled"] } }),
      Booking.countDocuments({ status: { $in: ["Completed", "completed"] } }),
      Booking.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "name email")
        .populate("service", "name category"),
    ]);

    // Revenue estimate (₹ sum from confirmed/completed bookings)
    const revenueAgg = await Booking.aggregate([
      { $match: { status: { $in: ["Confirmed", "confirmed", "Completed", "completed"] } } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalBookings,
        totalServices,
        totalProfessionals,
        totalEmergencies,
        pendingBookings,
        confirmedBookings,
        cancelledBookings,
        completedBookings,
        totalRevenue,
      },
      recentBookings,
    });
  } catch (error) {
    console.error("Admin Stats Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// GET /api/admin/users  — All registered users
// ──────────────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.status(200).json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// DELETE /api/admin/users/:id  — Delete a user
// ──────────────────────────────────────────────────────
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.role === "admin") return res.status(400).json({ success: false, message: "Cannot delete admin user" });
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// GET /api/admin/bookings  — All bookings (all users)
// ──────────────────────────────────────────────────────
const getAllBookings = async (req, res) => {
  try {
    const bookings = await Booking.find()
      .sort({ createdAt: -1 })
      .populate("user", "name email")
      .populate("service", "name category price")
      .populate("professional", "name category experience");
    res.status(200).json({ success: true, bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// PUT /api/admin/bookings/:id/status  — Update booking status
// ──────────────────────────────────────────────────────
const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "confirmed", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("user", "name email").populate("service", "name");

    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
    res.status(200).json({ success: true, message: `Booking marked as ${status}`, booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// GET /api/admin/services  — All services
// ──────────────────────────────────────────────────────
const getAllServices = async (req, res) => {
  try {
    const services = await Service.find().sort({ category: 1, name: 1 });
    res.status(200).json({ success: true, services });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// GET /api/admin/professionals  — All professionals
// ──────────────────────────────────────────────────────
const getAllProfessionals = async (req, res) => {
  try {
    const professionals = await Professional.find().sort({ name: 1 });
    res.status(200).json({ success: true, professionals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// GET /api/admin/emergencies  — All emergency requests
// ──────────────────────────────────────────────────────
const getAllEmergencies = async (req, res) => {
  try {
    const emergencies = await EmergencyRequest.find()
      .sort({ createdAt: -1 })
      .populate("user", "name email phone contactNumber")
      .populate("assignedProfessional", "name category experience");
    res.status(200).json({ success: true, emergencies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// PUT /api/admin/emergencies/:id/status — Admin update emergency status
// ──────────────────────────────────────────────────────
const updateEmergencyStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const emergency = await EmergencyRequest.findById(req.params.id);
    if (!emergency) return res.status(404).json({ success: false, message: "Emergency request not found" });

    emergency.status = status;
    if (status === "Resolved" || status === "Cancelled") {
      emergency.resolvedAt = new Date();
      if (emergency.assignedProfessional) {
        await Professional.findByIdAndUpdate(emergency.assignedProfessional, { status: "Available" });
      }
    }
    await emergency.save();
    res.status(200).json({ success: true, message: `Emergency status updated to ${status}`, emergency });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// POST /api/admin/services  — Create a new service
// ──────────────────────────────────────────────────────
const createService = async (req, res) => {
  try {
    const { name, category, price, description, image, duration, products } = req.body;
    if (!name || !category || !price || !description || !image || !duration) {
      return res.status(400).json({ success: false, message: "All required fields must be provided" });
    }
    const service = await Service.create({ name, category, price, description, image, duration, products: products || [] });
    res.status(201).json({ success: true, message: "Service created successfully", service });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// PUT /api/admin/services/:id  — Update a service
// ──────────────────────────────────────────────────────
const updateService = async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!service) return res.status(404).json({ success: false, message: "Service not found" });
    res.status(200).json({ success: true, message: "Service updated successfully", service });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// DELETE /api/admin/services/:id  — Delete a service
// ──────────────────────────────────────────────────────
const deleteService = async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: "Service not found" });
    res.status(200).json({ success: true, message: "Service deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// POST /api/admin/professionals  — Create a professional
// ──────────────────────────────────────────────────────
const createProfessional = async (req, res) => {
  try {
    const { name, category, experience, image, status } = req.body;
    if (!name || !category || !experience || !image) {
      return res.status(400).json({ success: false, message: "name, category, experience and image are required" });
    }
    const professional = await Professional.create({ name, category, experience, image, status: status || "Available" });
    res.status(201).json({ success: true, message: "Professional added successfully", professional });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// PUT /api/admin/professionals/:id  — Update a professional
// ──────────────────────────────────────────────────────
const updateProfessional = async (req, res) => {
  try {
    const professional = await Professional.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!professional) return res.status(404).json({ success: false, message: "Professional not found" });
    res.status(200).json({ success: true, message: "Professional updated successfully", professional });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ──────────────────────────────────────────────────────
// DELETE /api/admin/professionals/:id  — Delete a professional
// ──────────────────────────────────────────────────────
const deleteProfessional = async (req, res) => {
  try {
    const professional = await Professional.findByIdAndDelete(req.params.id);
    if (!professional) return res.status(404).json({ success: false, message: "Professional not found" });
    res.status(200).json({ success: true, message: "Professional deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
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
};

