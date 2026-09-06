const User = require("../models/User");
const Booking = require("../models/Booking");
const EmergencyRequest = require("../models/EmergencyRequest");
const { deleteUser } = require("../controllers/adminController");

jest.mock("../models/User");
jest.mock("../models/Booking");
jest.mock("../models/EmergencyRequest");
jest.mock("../models/Service");
jest.mock("../models/Professional");

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Task 9: deleteUser soft-delete and protection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("blocks deleting an admin user regardless of bookings or emergencies", async () => {
    User.findById.mockResolvedValue({
      _id: "admin-1",
      role: "admin",
      name: "Super Admin"
    });

    const req = { params: { id: "admin-1" } };
    const res = createMockRes();

    await deleteUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Cannot delete admin user"
      })
    );
    expect(Booking.exists).not.toHaveBeenCalled();
    expect(EmergencyRequest.exists).not.toHaveBeenCalled();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  test("soft-deletes (active: false) user when referenced by existing Bookings", async () => {
    User.findById.mockResolvedValue({
      _id: "user-with-booking",
      role: "user",
      name: "Customer Bob",
      active: true
    });
    Booking.exists.mockResolvedValue(true);
    EmergencyRequest.exists.mockResolvedValue(false);
    User.findByIdAndUpdate.mockResolvedValue({
      _id: "user-with-booking",
      active: false
    });

    const req = { params: { id: "user-with-booking" } };
    const res = createMockRes();

    await deleteUser(req, res);

    expect(Booking.exists).toHaveBeenCalledWith({ user: "user-with-booking" });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "user-with-booking",
      { active: false },
      { new: true }
    );
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining("User deactivated successfully")
      })
    );
  });

  test("soft-deletes (active: false) user when referenced by existing EmergencyRequests", async () => {
    User.findById.mockResolvedValue({
      _id: "user-with-emergency",
      role: "user",
      name: "Customer Dave",
      active: true
    });
    Booking.exists.mockResolvedValue(false);
    EmergencyRequest.exists.mockResolvedValue(true);
    User.findByIdAndUpdate.mockResolvedValue({
      _id: "user-with-emergency",
      active: false
    });

    const req = { params: { id: "user-with-emergency" } };
    const res = createMockRes();

    await deleteUser(req, res);

    expect(Booking.exists).toHaveBeenCalledWith({ user: "user-with-emergency" });
    expect(EmergencyRequest.exists).toHaveBeenCalledWith({ user: "user-with-emergency" });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "user-with-emergency",
      { active: false },
      { new: true }
    );
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.stringContaining("User deactivated successfully")
      })
    );
  });

  test("hard-deletes user when neither Bookings nor EmergencyRequests exist", async () => {
    User.findById.mockResolvedValue({
      _id: "user-clean",
      role: "user",
      name: "Clean User"
    });
    Booking.exists.mockResolvedValue(false);
    EmergencyRequest.exists.mockResolvedValue(false);
    User.findByIdAndDelete.mockResolvedValue({ _id: "user-clean" });

    const req = { params: { id: "user-clean" } };
    const res = createMockRes();

    await deleteUser(req, res);

    expect(Booking.exists).toHaveBeenCalledWith({ user: "user-clean" });
    expect(EmergencyRequest.exists).toHaveBeenCalledWith({ user: "user-clean" });
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(User.findByIdAndDelete).toHaveBeenCalledWith("user-clean");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "User deleted successfully"
    });
  });

  test("returns 404 when user does not exist", async () => {
    User.findById.mockResolvedValue(null);

    const req = { params: { id: "non-existent" } };
    const res = createMockRes();

    await deleteUser(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "User not found"
    });
  });
});
