const { requirePermission } = require("../middleware/permissionMiddleware");
const { recordAudit } = require("../middleware/auditMiddleware");
const AuditLog = require("../models/AuditLog");

jest.mock("../models/AuditLog");

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Admin Audit & Permission-Based Authorization", () => {
  describe("Permission Middleware", () => {
    test("allows admin with wildcard 'all' permission", () => {
      const middleware = requirePermission("users:delete");
      const req = {
        user: { role: "admin", permissions: ["all"] }
      };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test("allows admin with specific permission match", () => {
      const middleware = requirePermission("services:manage");
      const req = {
        user: { role: "admin", permissions: ["users:read", "services:manage"] }
      };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test("blocks admin lacking the specific permission scope", () => {
      const middleware = requirePermission("users:delete");
      const req = {
        user: { role: "admin", permissions: ["services:read", "bookings:read"] }
      };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining("Missing required permission")
        })
      );
    });

    test("rejects non-admin role", () => {
      const middleware = requirePermission("users:read");
      const req = {
        user: { role: "user", permissions: ["all"] }
      };
      const res = createMockRes();
      const next = jest.fn();

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe("Audit Logging", () => {
    test("records structured audit log for admin action", async () => {
      AuditLog.create = jest.fn().mockResolvedValue({ _id: "audit-1" });

      await recordAudit({
        admin: { _id: "admin-1", email: "admin@homeease.com" },
        action: "USER_DELETED",
        targetType: "User",
        targetId: "target-user-123",
        status: "SUCCESS",
        details: { reason: "Terms violation" }
      });

      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: "admin-1",
          adminEmail: "admin@homeease.com",
          action: "USER_DELETED",
          targetType: "User",
          targetId: "target-user-123",
          status: "SUCCESS"
        })
      );
    });
  });
});
