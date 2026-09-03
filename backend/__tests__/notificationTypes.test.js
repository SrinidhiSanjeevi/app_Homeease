const { NOTIFICATION_TYPES, NOTIFICATION_CHANNELS, NOTIFICATION_STATUS } = require("../services/notification/notificationTypes");
const { getBookingConfirmedTemplate, getBookingCompletedTemplate } = require("../services/notification/notificationTemplates");

describe("Notification Services", () => {
  test("notification types are frozen constants", () => {
    expect(NOTIFICATION_TYPES.BOOKING_CONFIRMED).toBe("BOOKING_CONFIRMED");
    expect(NOTIFICATION_CHANNELS.EMAIL).toBe("Email");
    expect(NOTIFICATION_STATUS.SUCCESS).toBe("Success");
  });

  test("booking confirmed template formats HTML and subject properly", () => {
    const template = getBookingConfirmedTemplate({
      recipientName: "Alice",
      bookingRef: "BK1234",
      booking: { date: new Date("2026-10-01"), totalPrice: 500, timeSlot: "10:00 AM", address: "123 Main St" },
      recipientEmail: "alice@example.com"
    });
    expect(template.subject).toContain("BK1234");
    expect(template.html).toContain("Alice");
    expect(template.html).toContain("₹500");
  });

  test("booking completed template formats HTML and subject properly", () => {
    const template = getBookingCompletedTemplate({
      recipientName: "Bob",
      bookingRef: "BK5678",
      booking: { date: new Date("2026-10-01"), totalPrice: 750, address: "456 Side St", paymentMethod: "Razorpay" },
      recipientEmail: "bob@example.com"
    });
    expect(template.subject).toContain("BK5678");
    expect(template.html).toContain("COMPLETED");
    expect(template.html).toContain("₹750");
  });
});
