const AuditLog = require("../models/AuditLog");
const logger = require("../utils/logger");
const bookingServiceClient = require("../services/bookingServiceClient");

const GENERIC_ERROR_MESSAGE = "Something went wrong, please try again";

const handleClientError = (res, error, logLabel) => {
  logger.error({ err: error.message }, logLabel);
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || GENERIC_ERROR_MESSAGE
  });
};

const getAreas = async (req, res) => {
  try {
    const data = await bookingServiceClient.getAreas();
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Get Areas Error");
  }
};

const getStats = async (req, res) => {
  try {
    const data = await bookingServiceClient.getStats();
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Admin Stats Error");
  }
};

const getAllUsers = async (req, res) => {
  try {
    const data = await bookingServiceClient.getAllUsers(req.query);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Get All Users Error");
  }
};

const deleteUser = async (req, res) => {
  try {
    const data = await bookingServiceClient.deleteUser(req.params.id);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Delete User Error");
  }
};

const getAllBookings = async (req, res) => {
  try {
    const data = await bookingServiceClient.getAllBookings(req.query);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Get All Bookings Error");
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const data = await bookingServiceClient.updateBookingStatus(req.params.id, req.body.status);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Update Booking Status Error");
  }
};

const getAllServices = async (req, res) => {
  try {
    const data = await bookingServiceClient.getAllServices(req.query);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Get All Services Error");
  }
};

const createService = async (req, res) => {
  try {
    const data = await bookingServiceClient.createService(req.body);
    res.status(201).json(data);
  } catch (error) {
    handleClientError(res, error, "Create Service Error");
  }
};

const updateService = async (req, res) => {
  try {
    const data = await bookingServiceClient.updateService(req.params.id, req.body);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Update Service Error");
  }
};

const deleteService = async (req, res) => {
  try {
    const data = await bookingServiceClient.deleteService(req.params.id);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Delete Service Error");
  }
};

const getAllProfessionals = async (req, res) => {
  try {
    const data = await bookingServiceClient.getAllProfessionals(req.query);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Get All Professionals Error");
  }
};

const createProfessional = async (req, res) => {
  try {
    const data = await bookingServiceClient.createProfessional(req.body);
    res.status(201).json(data);
  } catch (error) {
    handleClientError(res, error, "Create Professional Error");
  }
};

const updateProfessional = async (req, res) => {
  try {
    const data = await bookingServiceClient.updateProfessional(req.params.id, req.body);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Update Professional Error");
  }
};

const deleteProfessional = async (req, res) => {
  try {
    const data = await bookingServiceClient.deleteProfessional(req.params.id);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Delete Professional Error");
  }
};

const getAllEmergencies = async (req, res) => {
  try {
    const data = await bookingServiceClient.getAllEmergencies(req.query);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Get All Emergencies Error");
  }
};

const updateEmergencyStatus = async (req, res) => {
  try {
    const data = await bookingServiceClient.updateEmergencyStatus(req.params.id, req.body.status);
    res.status(200).json(data);
  } catch (error) {
    handleClientError(res, error, "Update Emergency Status Error");
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
  getAreas,
  getAllProfessionals,
  createProfessional,
  updateProfessional,
  deleteProfessional,
  getAllEmergencies,
  updateEmergencyStatus,
  getAuditLogs
};
