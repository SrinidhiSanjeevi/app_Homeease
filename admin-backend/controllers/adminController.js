const User = require("../models/User");
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const Professional = require("../models/Professional");
const EmergencyRequest = require("../models/EmergencyRequest");
const { reassignWaitingWork } = require("../services/professionalMatcher");
const { canTransition } = require("../services/booking/bookingStateMachine");
const logger = require("../utils/logger");
const { parsePagination, formatPaginationResult } = require("../utils/pagination");

const getStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalBookings,
      totalServices,
      totalProfessionals,
      totalEmergencies,
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
      { $match: { status: { $in: ["Confirmed", "Completed"] } } },
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
    if (req.query.role && ["user", "admin", "professional"].includes(req.query.role)) {
      filter.role = req.query.role;
    }
    if (req.query.search) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escaped, "i");
      filter.$or = [{ name: searchRegex }, { email: searchRegex }];
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
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.paymentStatus) {
      filter.paymentStatus = req.query.paymentStatus;
    }
    if (req.query.user) {
      filter.user = req.query.user;
    }
    if (req.query.professional) {
      filter.professional = req.query.professional;
    }
    if (req.query.service) {
      filter.service = req.query.service;
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

    const existingBooking = await Booking.findById(req.params.id).populate("professional", "category");
    if (!existingBooking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (!canTransition(existingBooking.status, status)) {
      return res.status(400).json({
        success: false,
        message: `Illegal booking status transition from '${existingBooking.status}' to '${status}'`
      });
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).populate("user", "name email").populate("service", "name");

    if ((status === "Cancelled" || status === "Completed") && existingBooking?.professional) {
      const freedProfessional = await Professional.findByIdAndUpdate(
        existingBooking.professional._id,
        { status: "Available" },
        { new: true }
      );
      if (freedProfessional) {
        reassignWaitingWork(freedProfessional.category).catch((err) =>
          logger.error({ err: err.message }, "Auto-reassignment error")
        );
      }
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
    if (req.query.category) {
      filter.category = req.query.category;
    }
    if (req.query.active !== undefined) {
      filter.active = req.query.active === "true" || req.query.active === true;
    }
    if (req.query.search) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = new RegExp(escaped, "i");
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

    res.status(200).json({
      success: true,
      ...pagination,
      pagination,
      services
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
    if (req.query.category) {
      filter.category = req.query.category;
    }
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.active !== undefined) {
      filter.active = req.query.active === "true" || req.query.active === true;
    }
    if (req.query.search) {
      const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = new RegExp(escaped, "i");
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

    res.status(200).json({
      success: true,
      ...pagination,
      pagination,
      professionals
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
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.category) {
      filter.category = req.query.category;
    }
    if (req.query.severity) {
      filter.severity = req.query.severity;
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

    const emergency = await EmergencyRequest.findById(req.params.id);
    if (!emergency) return res.status(404).json({ success: false, message: "Emergency request not found" });

    emergency.status = status;

    if (status === "Resolved" || status === "Cancelled") {
      emergency.resolvedAt = new Date();

      if (emergency.assignedProfessional) {
        const freedProfessional = await Professional.findByIdAndUpdate(
          emergency.assignedProfessional,
          { status: "Available" },
          { new: true }
        );

        if (freedProfessional) {
          reassignWaitingWork(freedProfessional.category).catch((err) =>
            logger.error({ err: err.message }, "Auto-reassignment error")
          );
        }
      }
    }

    await emergency.save();
    res.status(200).json({ success: true, message: `Emergency status updated to ${status}`, emergency });
  } catch (error) {
    logger.error({ err: error.message }, "Update Emergency Status Error");
    res.status(500).json({ success: false, message: "Something went wrong, please try again" });
  }
};

const createService = async (req, res) => {
  try {
    const { name, category, price, description, imageKey, imageAlt, image, duration, products } = req.body;
    const finalImageKey = imageKey || image;
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
    const { name, category, price, description, image, duration, products } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (price !== undefined) updateData.price = price;
    if (description !== undefined) updateData.description = description;
    if (image !== undefined) updateData.image = image;
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
    const finalImageKey = imageKey || image;
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
    const { name, category, experience, imageKey, imageAlt, description, status } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (experience !== undefined) updateData.experience = experience;
    if (imageKey !== undefined) updateData.imageKey = imageKey;
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