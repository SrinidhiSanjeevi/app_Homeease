const Service = require("../models/Service");
const Professional = require("../models/Professional");
const { updateService, updateProfessional } = require("../controllers/adminController");
const { reassignWaitingWork } = require("../services/professionalMatcher");

jest.mock("../models/Service");
jest.mock("../models/Professional");
jest.mock("../models/Booking");
jest.mock("../models/EmergencyRequest");
jest.mock("../services/professionalMatcher", () => ({
  reassignWaitingWork: jest.fn().mockResolvedValue(true)
}));

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Task 3: Whitelist fields on admin update endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("updateService", () => {
    test("rejects request with 400 if none of the whitelisted fields are present", async () => {
      const req = {
        params: { id: "srv-123" },
        body: { rating: 5, _id: "hacked_id", bookingCount: 20 }
      };
      const res = createMockRes();

      await updateService(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("No valid fields")
        })
      );
      expect(Service.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("rejects request with 400 if body is completely empty", async () => {
      const req = {
        params: { id: "srv-123" },
        body: {}
      };
      const res = createMockRes();

      await updateService(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Service.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("updates document with whitelisted fields and strips non-whitelisted fields (e.g. rating, _id)", async () => {
      const req = {
        params: { id: "srv-123" },
        body: {
          name: "Deep Cleaning Deluxe",
          price: 1299,
          rating: 5,
          _id: "attempted_overwrite_id",
          completedBookingCount: 99
        }
      };
      const res = createMockRes();
      const updatedDoc = {
        _id: "srv-123",
        name: "Deep Cleaning Deluxe",
        price: 1299,
        rating: 4.2
      };
      Service.findByIdAndUpdate.mockResolvedValue(updatedDoc);

      await updateService(req, res);

      expect(Service.findByIdAndUpdate).toHaveBeenCalledWith(
        "srv-123",
        {
          name: "Deep Cleaning Deluxe",
          price: 1299
        },
        { new: true, runValidators: true }
      );
      expect(Service.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty("rating");
      expect(Service.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty("_id");
      expect(Service.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty("completedBookingCount");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Service updated successfully",
        service: updatedDoc
      });
    });

    test("returns 404 when service is not found", async () => {
      const req = {
        params: { id: "nonexistent" },
        body: { name: "New Name" }
      };
      const res = createMockRes();
      Service.findByIdAndUpdate.mockResolvedValue(null);

      await updateService(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Service not found"
      });
    });
  });

  describe("updateProfessional", () => {
    test("rejects request with 400 if none of the whitelisted fields are present", async () => {
      const req = {
        params: { id: "prof-123" },
        body: { rating: 5, _id: "injected_id", completedJobs: 15 }
      };
      const res = createMockRes();

      await updateProfessional(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("No valid fields")
        })
      );
      expect(Professional.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("updates document with whitelisted fields and strips non-whitelisted fields (e.g. rating, _id)", async () => {
      const req = {
        params: { id: "prof-123" },
        body: {
          name: "John Pro",
          experience: 8,
          status: "Available",
          rating: 5,
          _id: "cannot_change_id",
          ratingCount: 100
        }
      };
      const res = createMockRes();
      const updatedProf = {
        _id: "prof-123",
        name: "John Pro",
        category: "Plumbing",
        experience: 8,
        status: "Available"
      };
      Professional.findByIdAndUpdate.mockResolvedValue(updatedProf);

      await updateProfessional(req, res);

      expect(Professional.findByIdAndUpdate).toHaveBeenCalledWith(
        "prof-123",
        {
          name: "John Pro",
          experience: 8,
          status: "Available"
        },
        { new: true, runValidators: true }
      );
      expect(Professional.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty("rating");
      expect(Professional.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty("_id");
      expect(Professional.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty("ratingCount");
      expect(reassignWaitingWork).toHaveBeenCalledWith("Plumbing");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Professional updated successfully",
        professional: updatedProf
      });
    });

    test("returns 404 when professional is not found", async () => {
      const req = {
        params: { id: "nonexistent" },
        body: { name: "Jane" }
      };
      const res = createMockRes();
      Professional.findByIdAndUpdate.mockResolvedValue(null);

      await updateProfessional(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Professional not found"
      });
    });
  });
});
