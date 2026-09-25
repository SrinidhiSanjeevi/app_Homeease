const mongoose = require("mongoose");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const Professional = require("../models/Professional");
const EmergencyRequest = require("../models/EmergencyRequest");
const AuditLog = require("../models/AuditLog");
const SlotReservation = require("../models/SlotReservation");
const { reassignWaitingWork } = require("../services/professionalMatcher");
const { canTransition } = require("../services/booking/bookingStateMachine");

// Allowed emergency status moves — mirrors backend emergencyConfig.js.
const EMERGENCY_TRANSITIONS = {
  Dispatched: ["OnTheWay", "Arrived", "Resolved", "Cancelled"],
  OnTheWay: ["Arrived", "Resolved", "Cancelled"],
  Arrived: ["Resolved", "Cancelled"],
  Resolved: [],
  Cancelled: []
};
const canTransitionEmergency = (from, to) => (EMERGENCY_TRANSITIONS[from] || []).includes(to);
const logger = require("../utils/logger");
const { parsePagination, formatPaginationResult } = require("../utils/pagination");
const { attachImageUrls } = require("../services/blobStorage");

// The admin form's `image` field may hold a short-lived SAS preview URL.
// Only persist real blob keys ("<container>/<blob>"), never URLs, or the
// stored image breaks once the SAS token expires.
const toImageKey = (value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return undefined;
  return trimmed;
};

const getStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalBookings,
      totalServices,
      totalProfessionals,
      totalEmergencies,
      activeEmergencies,
      createdBookings,
      assignedBookings,
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
      // Everything still in flight — this is what the admin overview's
      // emergency alert banner reacts to, not the all-time total above.
      EmergencyRequest.countDocuments({ status: { $nin: ["Resolved", "Cancelled"] } }),
      Booking.countDocuments({ status: "Created" }),
      Booking.countDocuments({ status: "Assigned" }),
      Booking.countDocuments({ status: "Confirmed" }),
      Booking.countDocuments({ status: "Cancelled" }),
      Booking.countDocuments({ status: "Completed" }),
      Booking.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "name email")
        .populate("service", "name category"),
    ]);

    const pendingBookings = createdBookings + assignedBookings;

    const revenueAgg = await Booking.aggregate([
      // Money actually received: paid online, cash collected, or the fee
      // kept on a late cancellation.
      { $match: { paymentStatus: { $in: ["Paid", "Paid (Cash Collected)", "Partially Refunded"] } } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Partially Refunded"] }, { $ifNull: ["$cancellationFee", 0] }, "$totalPrice"]
            }
          }
        }
      },
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
        activeEmergencies,
        createdBookings,
        assignedBookings,
        pendingBookings,
        confirmedBookings,
        cancelledBookings,
        completedBookings,
        totalRevenue,
      },
      recentBookings,
    });
  } catch (error) {
    logger.error({ err: error.message }, "Admin Stats Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    const ALLOWED_ROLES = ["user", "admin", "professional"];
    if (typeof req.query.role === "string" && ALLOWED_ROLES.includes(req.query.role)) {
      filter.role = req.query.role;
    }
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [{ name: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("name email role phone address active createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const pagination = formatPaginationResult({ page, limit, total });

    res.status(200).json({
      success: true,
      ...pagination,
      pagination,
      users
    });
  } catch (error) {
    logger.error({ err: error.message }, "Get All Users Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.role === "admin") return res.status(400).json({ success: false, message: "Cannot delete admin user" });

    const hasBookings = await Booking.exists({ user: req.params.id });
    const hasEmergencies = await EmergencyRequest.exists({ user: req.params.id });

    if (hasBookings || hasEmergencies) {
      const updatedUser = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
      if (!updatedUser) return res.status(404).json({ success: false, message: "User not found" });
      return res.status(200).json({
        success: true,
        message: "User deactivated successfully (preserved for existing booking/emergency history)",
        user: updatedUser
      });
    }

    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) return res.status(404).json({ success: false, message: "User not found" });
    res.status(200).json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    logger.error({ err: error.message }, "Delete User Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (typeof req.query.status === "string" && req.query.status.trim()) {
      filter.status = req.query.status.trim();
    }
    if (typeof req.query.paymentStatus === "string" && req.query.paymentStatus.trim()) {
      filter.paymentStatus = req.query.paymentStatus.trim();
    }
    if (typeof req.query.user === "string" && mongoose.Types.ObjectId.isValid(req.query.user)) {
      filter.user = new mongoose.Types.ObjectId(req.query.user);
    }
    if (typeof req.query.professional === "string" && mongoose.Types.ObjectId.isValid(req.query.professional)) {
      filter.professional = new mongoose.Types.ObjectId(req.query.professional);
    }
    if (typeof req.query.service === "string" && mongoose.Types.ObjectId.isValid(req.query.service)) {
      filter.service = new mongoose.Types.ObjectId(req.query.service);
    }

    const [total, bookings] = await Promise.all([
      Booking.countDocuments(filter),
      Booking.find(filter)
        .select("user service professional isCustom customCategory customDescription date timeSlot address contactNumber notes selectedProduct paymentMethod paymentStatus status totalPrice userRating userReview createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email phone")
        .populate("service", "name category price")
        .populate("professional", "name category experience")
        .lean()
    ]);

    const pagination = formatPaginationResult({ page, limit, total });

    res.status(200).json({
      success: true,
      ...pagination,
      pagination,
      bookings
    });
  } catch (error) {
    logger.error({ err: error.message }, "Get All Bookings Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Created", "Assigned", "Confirmed", "Completed", "Cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const existingBooking = await Booking.findById(req.params.id);
    if (!existingBooking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    // Setting the same status again is a no-op — never re-run the side
    // effects (freeing the professional, refunds) a second time.
    if (existingBooking.status === status) {
      return res.status(400).json({ success: false, message: `Booking is already ${status}` });
    }

    if (!canTransition(existingBooking.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Illegal booking status transition from '${existingBooking.status}' to '${status}'`
      });
    }

    const isCash = existingBooking.paymentMethod === "Cash on Delivery";
    const isPaid = existingBooking.paymentStatus === "Paid";

    if ((status === "Confirmed" || status === "Assigned") && !isCash && !isPaid) {
      return res.status(400).json({ success: false, message: "An online booking can't be confirmed before it is paid" });
    }

    const update = { status };
    if (status === "Completed" && isCash) {
      update.paymentStatus = "Paid (Cash Collected)";
    }
    if (status === "Cancelled") {
      Object.assign(update, { cancelledAt: new Date(), cancelledBy: "admin", cancellationReason: "Cancelled by admin" });
      if (isPaid) {
        // Full refund; issued (and retried) by the backend scheduler.
        Object.assign(update, { paymentStatus: "Refund Pending", refundAmount: existingBooking.totalPrice, refundAttempts: 0 });
      } else if (existingBooking.paymentStatus === "Pending") {
        update.paymentStatus = "Cancelled";
      }
    }

    // Admins may complete a booking at any time, regardless of its slot.
    // Conditional on the old status so two admins can't both apply it.
    const booking = await Booking.findOneAndUpdate(
      { _id: existingBooking._id, status: existingBooking.status },
      { $set: update },
      { new: true, runValidators: true }
    ).populate("user", "name email").populate("service", "name");

    if (!booking) {
      return res.status(409).json({ success: false, message: "This booking was just updated. Please refresh." });
    }

    if (status === "Cancelled" || status === "Completed") {
      // Frees exactly this booking's slot — nothing else of the professional's.
      await SlotReservation.deleteMany({ booking: booking._id });
      if (status === "Completed" && booking.professional) {
        await Professional.updateOne({ _id: booking.professional }, { $inc: { completedJobs: 1 } });
      }
      reassignWaitingWork().catch((err) =>
        logger.error({ err: err.message }, "Auto-reassignment error")
      );
    }

    res.status(200).json({ success: true, message: `Booking marked as ${status}`, booking });
  } catch (error) {
    logger.error({ err: error.message }, "Update Booking Status Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const getAllServices = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (typeof req.query.category === "string" && req.query.category.trim()) {
      filter.category = req.query.category.trim();
    }
    if (req.query.active !== undefined) {
      filter.active = req.query.active === "true" || req.query.active === true;
    }
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = { $regex: escaped, $options: "i" };
    }

    const [total, services] = await Promise.all([
      Service.countDocuments(filter),
      Service.find(filter)
        .select("name category price description imageKey imageAlt duration rating ratingCount bookingCount completedBookingCount active products createdAt")
        .sort({ category: 1, name: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const pagination = formatPaginationResult({ page, limit, total });
    const enrichedServices = await attachImageUrls(services);

    res.status(200).json({
      success: true,
      ...pagination,
      pagination,
      services: enrichedServices
    });
  } catch (error) {
    logger.error({ err: error.message }, "Get All Services Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const getAllProfessionals = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (typeof req.query.category === "string" && req.query.category.trim()) {
      filter.category = req.query.category.trim();
    }
    if (typeof req.query.status === "string" && ["Available", "Busy"].includes(req.query.status.trim())) {
      filter.status = req.query.status.trim();
    }
    if (req.query.active !== undefined) {
      filter.active = req.query.active === "true" || req.query.active === true;
    }
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = { $regex: escaped, $options: "i" };
    }

    const [total, professionals] = await Promise.all([
      Professional.countDocuments(filter),
      Professional.find(filter)
        .select("name category description rating ratingCount experience imageKey imageAlt status active completedJobs createdAt")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const pagination = formatPaginationResult({ page, limit, total });
    const enrichedProfessionals = await attachImageUrls(professionals);

    res.status(200).json({
      success: true,
      ...pagination,
      pagination,
      professionals: enrichedProfessionals
    });
  } catch (error) {
    logger.error({ err: error.message }, "Get All Professionals Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const getAllEmergencies = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const filter = {};
    if (typeof req.query.status === "string" && req.query.status.trim()) {
      filter.status = req.query.status.trim();
    }
    if (typeof req.query.category === "string" && req.query.category.trim()) {
      filter.category = req.query.category.trim();
    }
    if (typeof req.query.severity === "string" && req.query.severity.trim()) {
      filter.severity = req.query.severity.trim();
    }

    const [total, emergencies] = await Promise.all([
      EmergencyRequest.countDocuments(filter),
      EmergencyRequest.find(filter)
        .select("user category severity description contactNumber address status assignedProfessional fireEngineDispatched fireEngineNumber emergencyServiceNumber estimatedArrivalMinutes resolvedAt createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email phone contactNumber")
        .populate("assignedProfessional", "name category experience")
        .lean()
    ]);

    const pagination = formatPaginationResult({ page, limit, total });

    res.status(200).json({
      success: true,
      ...pagination,
      pagination,
      emergencies
    });
  } catch (error) {
    logger.error({ err: error.message }, "Get All Emergencies Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const updateEmergencyStatus = async (req, res) => {
  try {
    let { status } = req.body;
    const statusMap = {
      "En Route": "OnTheWay",
      "On Scene": "Arrived",
      "Assigned": "Dispatched"
    };
    if (statusMap[status]) {
      status = statusMap[status];
    }
    const validStatuses = ["Dispatched", "OnTheWay", "Arrived", "Resolved", "Cancelled"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    const existing = await EmergencyRequest.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Emergency request not found" });

    if (!canTransitionEmergency(existing.status, status)) {
      return res.status(400).json({
        success: false,
        message: existing.status === status
          ? `Emergency is already ${status}`
          : `Can't move an emergency from ${existing.status} to ${status}`
      });
    }

    const isClosing = status === "Resolved" || status === "Cancelled";
    const emergency = await EmergencyRequest.findOneAndUpdate(
      { _id: existing._id, status: existing.status },
      { $set: { status, ...(isClosing ? { resolvedAt: new Date() } : {}) } },
      { new: true }
    );
    if (!emergency) {
      return res.status(409).json({ success: false, message: "This emergency was just updated. Please refresh." });
    }

    if (isClosing && emergency.assignedProfessional) {
      await Professional.updateOne({ _id: emergency.assignedProfessional, status: "Busy" }, { $set: { status: "Available" } });
      reassignWaitingWork().catch((err) =>
        logger.error({ err: err.message }, "Auto-reassignment error")
      );
    }

    res.status(200).json({ success: true, message: `Emergency status updated to ${status}`, emergency });
  } catch (error) {
    logger.error({ err: error.message }, "Update Emergency Status Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const createService = async (req, res) => {
  try {
    const { name, category, price, description, imageKey, imageAlt, image, duration, products } = req.body;
    const finalImageKey = toImageKey(imageKey) || toImageKey(image);
    const finalImageAlt = imageAlt || (name ? `${name} service` : "HomeEase service");

    if (!name || !category || !price || !description || !finalImageKey || !duration) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be provided (name, category, price, description, imageKey, duration)"
      });
    }

    const service = await Service.create({
      name: name.trim(),
      category,
      price: Number(price),
      description: description.trim(),
      imageKey: finalImageKey.trim(),
      imageAlt: finalImageAlt.trim(),
      duration: duration.trim(),
      products: products || [],
      active: true
    });

    res.status(201).json({ success: true, message: "Service created successfully", service });
  } catch (error) {
    logger.error({ err: error.message }, "Create Service Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const updateService = async (req, res) => {
  try {
    const { name, category, price, description, image, imageKey, imageAlt, duration, products } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (price !== undefined) updateData.price = price;
    if (description !== undefined) updateData.description = description;
    const finalImageKey = imageKey !== undefined ? toImageKey(imageKey) : toImageKey(image);
    if (finalImageKey !== undefined) updateData.imageKey = finalImageKey;
    if (imageAlt !== undefined) updateData.imageAlt = imageAlt;
    if (duration !== undefined) updateData.duration = duration;
    if (products !== undefined) updateData.products = products;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields provided for update" });
    }

    const service = await Service.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!service) return res.status(404).json({ success: false, message: "Service not found" });
    res.status(200).json({ success: true, message: "Service updated successfully", service });
  } catch (error) {
    logger.error({ err: error.message }, "Update Service Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const deleteService = async (req, res) => {
  try {
    const hasBookings = await Booking.exists({ service: req.params.id });
    if (hasBookings) {
      const service = await Service.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
      if (!service) return res.status(404).json({ success: false, message: "Service not found" });
      return res.status(200).json({
        success: true,
        message: "Service deactivated successfully (preserved for existing booking history)",
        service
      });
    }

    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: "Service not found" });
    res.status(200).json({ success: true, message: "Service deleted successfully" });
  } catch (error) {
    logger.error({ err: error.message }, "Delete Service Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const createProfessional = async (req, res) => {
  try {
    const { name, category, experience, imageKey, imageAlt, image, description, status } = req.body;
    const finalImageKey = toImageKey(imageKey) || toImageKey(image);
    const finalImageAlt = imageAlt || (name ? `${name} - ${category} professional` : "HomeEase professional");

    if (!name || !category || experience === undefined || !finalImageKey) {
      return res.status(400).json({
        success: false,
        message: "name, category, experience and imageKey are required"
      });
    }

    const professional = await Professional.create({
      name: name.trim(),
      category: category.trim(),
      experience: Number(experience),
      description: description ? description.trim() : "",
      imageKey: finalImageKey.trim(),
      imageAlt: finalImageAlt.trim(),
      status: status || "Available",
      active: true
    });

    res.status(201).json({ success: true, message: "Professional added successfully", professional });
  } catch (error) {
    logger.error({ err: error.message }, "Create Professional Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const updateProfessional = async (req, res) => {
  try {
    const { name, category, experience, imageKey, imageAlt, image, description, status } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (experience !== undefined) updateData.experience = experience;
    const finalImageKey = imageKey !== undefined ? toImageKey(imageKey) : toImageKey(image);
    if (finalImageKey !== undefined) updateData.imageKey = finalImageKey;
    if (imageAlt !== undefined) updateData.imageAlt = imageAlt;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields provided for update" });
    }

    const professional = await Professional.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!professional) return res.status(404).json({ success: false, message: "Professional not found" });

    if (updateData.status === "Available") {
      reassignWaitingWork(professional.category).catch((err) =>
        logger.error({ err: err.message }, "Auto-reassignment error")
      );
    }

    res.status(200).json({ success: true, message: "Professional updated successfully", professional });
  } catch (error) {
    logger.error({ err: error.message }, "Update Professional Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const deleteProfessional = async (req, res) => {
  try {
    const hasBookings = await Booking.exists({ professional: req.params.id });
    if (hasBookings) {
      const professional = await Professional.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
      if (!professional) return res.status(404).json({ success: false, message: "Professional not found" });
      return res.status(200).json({
        success: true,
        message: "Professional deactivated successfully (preserved for existing booking history)",
        professional
      });
    }

    const professional = await Professional.findByIdAndDelete(req.params.id);
    if (!professional) return res.status(404).json({ success: false, message: "Professional not found" });
    res.status(200).json({ success: true, message: "Professional deleted successfully" });
  } catch (error) {
    logger.error({ err: error.message }, "Delete Professional Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, action } = req.query;
    const query = {};
    if (typeof action === "string" && action.trim()) {
      query.action = action.trim();
    }

    const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(query),
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("adminId", "name email")
        .lean()
    ]);

    res.status(200).json({
      success: true,
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    logger.error({ err: error.message }, "Get Audit Logs Error");
    res.status(500).json({ success: false, message: "Failed to retrieve audit logs" });
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
  getAuditLogs
};