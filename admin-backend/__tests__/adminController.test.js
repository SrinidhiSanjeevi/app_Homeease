const adminController = require("../controllers/adminController");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const Professional = require("../models/Professional");
const EmergencyRequest = require("../models/EmergencyRequest");
const { reassignWaitingWork } = require("../services/professionalMatcher");
const { canTransition } = require("../services/booking/bookingStateMachine");

jest.mock("../models/User");
jest.mock("../models/Booking");
jest.mock("../models/Service");
jest.mock("../models/Professional");
jest.mock("../models/EmergencyRequest");
jest.mock("../services/professionalMatcher");
jest.mock("../services/booking/bookingStateMachine");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe("adminController", () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { params: {}, query: {}, body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  describe("getStats", () => {
    it("should return stats with revenue", async () => {
      User.countDocuments.mockResolvedValue(10);
      Booking.countDocuments.mockResolvedValue(5);
      Service.countDocuments.mockResolvedValue(4);
      Professional.countDocuments.mockResolvedValue(3);
      EmergencyRequest.countDocuments.mockResolvedValue(2);
      Booking.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis()
      });
      Booking.aggregate.mockResolvedValue([{ total: 1500 }]);

      await adminController.getStats(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        stats: expect.objectContaining({ totalRevenue: 1500 })
      }));
    });

    it("should return 0 revenue if aggregate is empty", async () => {
      User.countDocuments.mockResolvedValue(10);
      Booking.countDocuments.mockResolvedValue(5);
      Service.countDocuments.mockResolvedValue(4);
      Professional.countDocuments.mockResolvedValue(3);
      EmergencyRequest.countDocuments.mockResolvedValue(2);
      Booking.find.mockReturnValue({ sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis() });
      Booking.aggregate.mockResolvedValue([]);

      await adminController.getStats(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        stats: expect.objectContaining({ totalRevenue: 0 })
      }));
    });

    it("should handle errors", async () => {
      User.countDocuments.mockRejectedValue(new Error("DB Error"));
      await adminController.getStats(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAllUsers", () => {
    it("should return paginated users with filters", async () => {
      req.query = { role: "user", search: "john", page: "1", limit: "10" };
      User.countDocuments.mockResolvedValue(1);
      User.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ name: "John" }])
      });
      await adminController.getAllUsers(req, res);
      expect(User.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should handle errors", async () => {
      User.countDocuments.mockRejectedValue(new Error("Err"));
      await adminController.getAllUsers(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("deleteUser", () => {
    it("should return 400 for admin user", async () => {
      req.params.id = "u1";
      User.findById.mockResolvedValue({ role: "admin" });
      await adminController.deleteUser(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("should soft delete if user has bookings", async () => {
      req.params.id = "u1";
      User.findById.mockResolvedValue({ role: "user" });
      Booking.exists.mockResolvedValue(true);
      EmergencyRequest.exists.mockResolvedValue(false);
      User.findByIdAndUpdate.mockResolvedValue({ active: false });

      await adminController.deleteUser(req, res);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith("u1", { active: false }, { new: true });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should hard delete if user has no bookings or emergencies", async () => {
      req.params.id = "u1";
      User.findById.mockResolvedValue({ role: "user" });
      Booking.exists.mockResolvedValue(false);
      EmergencyRequest.exists.mockResolvedValue(false);
      User.findByIdAndDelete.mockResolvedValue({ _id: "u1" });

      await adminController.deleteUser(req, res);
      expect(User.findByIdAndDelete).toHaveBeenCalledWith("u1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("should handle 404", async () => {
      req.params.id = "u1";
      User.findById.mockResolvedValue(null);
      await adminController.deleteUser(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    
    it("should handle 500", async () => {
      req.params.id = "u1";
      User.findById.mockRejectedValue(new Error("DB Err"));
      await adminController.deleteUser(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAllBookings", () => {
    it("should apply filters and return bookings", async () => {
      req.query = { status: "Created", paymentStatus: "Paid", user: "u1", professional: "p1", service: "s1" };
      Booking.countDocuments.mockResolvedValue(1);
      Booking.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: "b1" }])
      });
      await adminController.getAllBookings(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("handles errors", async () => {
      Booking.countDocuments.mockRejectedValue(new Error("Err"));
      await adminController.getAllBookings(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateBookingStatus", () => {
    it("returns 400 for invalid status", async () => {
      req.body = { status: "FakeStatus" };
      await adminController.updateBookingStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 for illegal transition", async () => {
      req.params.id = "b1";
      req.body = { status: "Completed" };
      Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ status: "Created" }) });
      canTransition.mockReturnValue(false);

      await adminController.updateBookingStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("updates status and frees professional if cancelled", async () => {
      req.params.id = "b1";
      req.body = { status: "Cancelled" };
      Booking.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue({ status: "Assigned", professional: { _id: "p1", category: "Cleaning" } })
      });
      canTransition.mockReturnValue(true);
      Booking.findByIdAndUpdate.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        populate: jest.fn().mockResolvedValue({ status: "Cancelled" })
      });
      Professional.findByIdAndUpdate.mockResolvedValue({ category: "Cleaning" });
      reassignWaitingWork.mockResolvedValue();

      await adminController.updateBookingStatus(req, res);
      expect(Professional.findByIdAndUpdate).toHaveBeenCalledWith("p1", { status: "Available" }, { new: true });
      expect(reassignWaitingWork).toHaveBeenCalledWith("Cleaning");
      expect(res.status).toHaveBeenCalledWith(200);
    });
    
    it("handles 404", async () => {
      req.params.id = "b1";
      req.body = { status: "Assigned" };
      Booking.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });
      await adminController.updateBookingStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    
    it("handles 500", async () => {
      req.params.id = "b1";
      req.body = { status: "Assigned" };
      Booking.findById.mockImplementation(() => { throw new Error("Err"); });
      await adminController.updateBookingStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAllServices", () => {
    it("applies filters and returns services", async () => {
      req.query = { category: "Cleaning", active: "true", search: "Deep" };
      Service.countDocuments.mockResolvedValue(1);
      Service.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });
      await adminController.getAllServices(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    
    it("handles 500", async () => {
      Service.countDocuments.mockRejectedValue(new Error("Err"));
      await adminController.getAllServices(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAllProfessionals", () => {
    it("applies filters and returns professionals", async () => {
      req.query = { category: "Cleaning", status: "Available", active: true, search: "Alice" };
      Professional.countDocuments.mockResolvedValue(1);
      Professional.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });
      await adminController.getAllProfessionals(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("handles 500", async () => {
      Professional.countDocuments.mockRejectedValue(new Error("Err"));
      await adminController.getAllProfessionals(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getAllEmergencies", () => {
    it("applies filters and returns emergencies", async () => {
      req.query = { status: "Dispatched", category: "Medical", severity: "High" };
      EmergencyRequest.countDocuments.mockResolvedValue(1);
      EmergencyRequest.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });
      await adminController.getAllEmergencies(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
    it("handles 500", async () => {
      EmergencyRequest.countDocuments.mockRejectedValue(new Error("Err"));
      await adminController.getAllEmergencies(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateEmergencyStatus", () => {
    it("maps status and updates, triggering reassignment on Resolved", async () => {
      req.params.id = "e1";
      req.body = { status: "En Route" }; // maps to OnTheWay
      const mockEmergency = { assignedProfessional: "p1", save: jest.fn() };
      EmergencyRequest.findById.mockResolvedValue(mockEmergency);
      
      await adminController.updateEmergencyStatus(req, res);
      expect(mockEmergency.status).toBe("OnTheWay");
      expect(mockEmergency.save).toHaveBeenCalled();
      
      req.body.status = "Resolved";
      Professional.findByIdAndUpdate.mockResolvedValue({ category: "Medical" });
      reassignWaitingWork.mockResolvedValue();
      
      await adminController.updateEmergencyStatus(req, res);
      expect(mockEmergency.status).toBe("Resolved");
      expect(Professional.findByIdAndUpdate).toHaveBeenCalledWith("p1", { status: "Available" }, { new: true });
      expect(reassignWaitingWork).toHaveBeenCalledWith("Medical");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns 400 for invalid status", async () => {
      req.body = { status: "Fake" };
      await adminController.updateEmergencyStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
    
    it("returns 404", async () => {
      req.body = { status: "Dispatched" };
      EmergencyRequest.findById.mockResolvedValue(null);
      await adminController.updateEmergencyStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });
    
    it("handles 500", async () => {
      req.body = { status: "Dispatched" };
      EmergencyRequest.findById.mockRejectedValue(new Error("Err"));
      await adminController.updateEmergencyStatus(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("Service CRUD", () => {
    it("createService validates fields", async () => {
      req.body = { name: "Test" };
      await adminController.createService(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      
      req.body = { name: "Test", category: "Cleaning", price: 100, description: "Desc", imageKey: "key", duration: "1 hr" };
      Service.create.mockResolvedValue({});
      await adminController.createService(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("updateService validates empty fields and updates", async () => {
      req.params.id = "s1";
      await adminController.updateService(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      
      req.body = { name: "Updated" };
      Service.findByIdAndUpdate.mockResolvedValue({});
      await adminController.updateService(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("deleteService soft deletes if bookings exist", async () => {
      req.params.id = "s1";
      Booking.exists.mockResolvedValue(true);
      Service.findByIdAndUpdate.mockResolvedValue({});
      await adminController.deleteService(req, res);
      expect(Service.findByIdAndUpdate).toHaveBeenCalledWith("s1", { active: false }, { new: true });
      expect(res.status).toHaveBeenCalledWith(200);
    });
    
    it("deleteService hard deletes if no bookings", async () => {
      req.params.id = "s1";
      Booking.exists.mockResolvedValue(false);
      Service.findByIdAndDelete.mockResolvedValue({});
      await adminController.deleteService(req, res);
      expect(Service.findByIdAndDelete).toHaveBeenCalledWith("s1");
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("Professional CRUD", () => {
    it("createProfessional validates fields", async () => {
      req.body = { name: "Test" };
      await adminController.createProfessional(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      
      req.body = { name: "Test", category: "Cleaning", experience: 5, imageKey: "key" };
      Professional.create.mockResolvedValue({});
      await adminController.createProfessional(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("updateProfessional triggers reassignment if status becomes Available", async () => {
      req.params.id = "p1";
      req.body = { status: "Available" };
      Professional.findByIdAndUpdate.mockResolvedValue({ category: "Cleaning" });
      reassignWaitingWork.mockResolvedValue();
      await adminController.updateProfessional(req, res);
      expect(reassignWaitingWork).toHaveBeenCalledWith("Cleaning");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("deleteProfessional soft deletes if bookings exist", async () => {
      req.params.id = "p1";
      Booking.exists.mockResolvedValue(true);
      Professional.findByIdAndUpdate.mockResolvedValue({});
      await adminController.deleteProfessional(req, res);
      expect(Professional.findByIdAndUpdate).toHaveBeenCalledWith("p1", { active: false }, { new: true });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
