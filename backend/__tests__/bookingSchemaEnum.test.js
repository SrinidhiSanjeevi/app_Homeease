const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { BOOKING_STATUSES } = require("../services/booking/bookingStateMachine");

describe("Task 5: Schema-level enum on Booking.status", () => {
  test("Booking status schema has correct enum values matching BOOKING_STATUSES", () => {
    const statusPath = Booking.schema.path("status");
    expect(statusPath.enumValues).toBeDefined();
    expect(statusPath.enumValues).toEqual(Object.values(BOOKING_STATUSES));
    expect(statusPath.enumValues).toEqual([
      "Created",
      "Assigned",
      "Confirmed",
      "Completed",
      "Cancelled"
    ]);
  });

  test("accepts valid enum status values in validate()", async () => {
    for (const validStatus of Object.values(BOOKING_STATUSES)) {
      const doc = new Booking({
        user: new mongoose.Types.ObjectId(),
        service: new mongoose.Types.ObjectId(),
        date: new Date(),
        timeSlot: "10:00 AM",
        address: "123 Main St",
        contactNumber: "9876543210",
        totalPrice: 499,
        status: validStatus
      });
      let err;
      try {
        await doc.validate({ paths: ["status"] });
      } catch (e) {
        err = e;
      }
      expect(err).toBeUndefined();
    }
  });

  test("rejects invalid status values with ValidationError in validate()", async () => {
    const invalidStatuses = ["Pending", "In_Progress", "InProgress", "Deleted", "random", ""];
    for (const invalidStatus of invalidStatuses) {
      const doc = new Booking({
        user: new mongoose.Types.ObjectId(),
        service: new mongoose.Types.ObjectId(),
        date: new Date(),
        timeSlot: "10:00 AM",
        address: "123 Main St",
        contactNumber: "9876543210",
        totalPrice: 499,
        status: invalidStatus
      });
      let err;
      try {
        await doc.validate({ paths: ["status"] });
      } catch (e) {
        err = e;
      }
      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
    }
  });
});
