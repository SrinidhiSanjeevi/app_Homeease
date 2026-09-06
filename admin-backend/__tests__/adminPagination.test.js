const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parsePagination,
  formatPaginationResult
} = require("../utils/pagination");

const User = require("../models/User");
const Booking = require("../models/Booking");
const Service = require("../models/Service");
const Professional = require("../models/Professional");
const EmergencyRequest = require("../models/EmergencyRequest");

const {
  getAllUsers,
  getAllBookings,
  getAllServices,
  getAllProfessionals,
  getAllEmergencies
} = require("../controllers/adminController");

jest.mock("../models/User");
jest.mock("../models/Booking");
jest.mock("../models/Service");
jest.mock("../models/Professional");
jest.mock("../models/EmergencyRequest");

// Helper to create mock Express response
const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Helper to build chained query mock
const createChainedQueryMock = (resolvedData = []) => {
  const query = {};
  query.select = jest.fn().mockReturnValue(query);
  query.sort = jest.fn().mockReturnValue(query);
  query.skip = jest.fn().mockReturnValue(query);
  query.limit = jest.fn().mockReturnValue(query);
  query.populate = jest.fn().mockReturnValue(query);
  query.lean = jest.fn().mockResolvedValue(resolvedData);
  return query;
};

describe("Admin Pagination & Query Limits", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Pagination Utility Functions", () => {
    test("1. default pagination: parses empty query into default page and limit", () => {
      const result = parsePagination({});
      expect(result.page).toBe(DEFAULT_PAGE);
      expect(result.limit).toBe(DEFAULT_LIMIT);
      expect(result.skip).toBe(0);
      expect(result.maxLimit).toBe(MAX_LIMIT);
    });

    test("2. custom page/limit: correctly calculates offset for custom parameters", () => {
      const result = parsePagination({ page: "3", limit: "15" });
      expect(result.page).toBe(3);
      expect(result.limit).toBe(15);
      expect(result.skip).toBe(30); // (3 - 1) * 15
    });

    test("3. maximum limit enforcement: caps oversized limits to MAX_LIMIT (50)", () => {
      const result = parsePagination({ page: "1", limit: "500" });
      expect(result.limit).toBe(MAX_LIMIT);
      expect(result.limit).toBe(50);
      expect(result.skip).toBe(0);
    });

    test("4. invalid inputs fallback: handles negative, zero, and non-numeric inputs safely", () => {
      const res1 = parsePagination({ page: "-5", limit: "0" });
      expect(res1.page).toBe(1);
      expect(res1.limit).toBe(DEFAULT_LIMIT);

      const res2 = parsePagination({ page: "abc", limit: "xyz" });
      expect(res2.page).toBe(1);
      expect(res2.limit).toBe(DEFAULT_LIMIT);
    });

    test("5. pagination metadata: formats page, limit, total, and totalPages correctly", () => {
      const meta1 = formatPaginationResult({ page: 2, limit: 20, total: 45 });
      expect(meta1).toEqual({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3
      });

      const metaEmpty = formatPaginationResult({ page: 1, limit: 20, total: 0 });
      expect(metaEmpty).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
      });
    });
  });

  describe("Admin Controller Endpoints Pagination & Filtering", () => {
    test("6. getAllUsers - default pagination & projection", async () => {
      const mockUsers = [
        { _id: "u1", name: "Alice", email: "alice@example.com", role: "user" },
        { _id: "u2", name: "Bob", email: "bob@example.com", role: "user" }
      ];

      User.countDocuments.mockResolvedValue(2);
      const queryMock = createChainedQueryMock(mockUsers);
      User.find.mockReturnValue(queryMock);

      const req = { query: {} };
      const res = createMockRes();

      await getAllUsers(req, res);

      expect(User.countDocuments).toHaveBeenCalledWith({});
      expect(User.find).toHaveBeenCalledWith({});
      expect(queryMock.skip).toHaveBeenCalledWith(0);
      expect(queryMock.limit).toHaveBeenCalledWith(DEFAULT_LIMIT);
      expect(queryMock.select).toHaveBeenCalledWith(
        "name email role phone address active createdAt updatedAt"
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
          users: mockUsers,
          pagination: {
            page: 1,
            limit: 20,
            total: 2,
            totalPages: 1
          }
        })
      );
    });

    test("7. getAllUsers - filtering by role and search regex", async () => {
      User.countDocuments.mockResolvedValue(1);
      const queryMock = createChainedQueryMock([
        { _id: "u_adm", name: "Super Admin", email: "admin@homeease.com", role: "admin" }
      ]);
      User.find.mockReturnValue(queryMock);

      const req = { query: { role: "admin", search: "Super" } };
      const res = createMockRes();

      await getAllUsers(req, res);

      const expectedFilter = {
        role: "admin",
        $or: [
          { name: expect.any(RegExp) },
          { email: expect.any(RegExp) }
        ]
      };

      expect(User.countDocuments).toHaveBeenCalledWith(expect.objectContaining(expectedFilter));
      expect(User.find).toHaveBeenCalledWith(expect.objectContaining(expectedFilter));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("8. getAllBookings - custom page/limit and status filtering", async () => {
      const mockBookings = [
        { _id: "b1", status: "Confirmed", totalPrice: 500 }
      ];

      Booking.countDocuments.mockResolvedValue(15);
      const queryMock = createChainedQueryMock(mockBookings);
      Booking.find.mockReturnValue(queryMock);

      const req = { query: { page: "2", limit: "10", status: "Confirmed" } };
      const res = createMockRes();

      await getAllBookings(req, res);

      expect(Booking.countDocuments).toHaveBeenCalledWith({ status: "Confirmed" });
      expect(Booking.find).toHaveBeenCalledWith({ status: "Confirmed" });
      expect(queryMock.skip).toHaveBeenCalledWith(10); // (2 - 1) * 10
      expect(queryMock.limit).toHaveBeenCalledWith(10);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          page: 2,
          limit: 10,
          total: 15,
          totalPages: 2,
          bookings: mockBookings
        })
      );
    });

    test("9. getAllServices - maximum limit enforcement when client requests oversized limit", async () => {
      Service.countDocuments.mockResolvedValue(100);
      const queryMock = createChainedQueryMock([]);
      Service.find.mockReturnValue(queryMock);

      const req = { query: { page: "1", limit: "250" } }; // Over MAX_LIMIT
      const res = createMockRes();

      await getAllServices(req, res);

      expect(queryMock.limit).toHaveBeenCalledWith(50); // Capped at MAX_LIMIT
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          total: 100,
          totalPages: 2
        })
      );
    });

    test("10. getAllProfessionals - category and active filtering with pagination", async () => {
      Professional.countDocuments.mockResolvedValue(3);
      const queryMock = createChainedQueryMock([
        { _id: "p1", name: "John Plumber", category: "Plumbing", status: "Available", active: true }
      ]);
      Professional.find.mockReturnValue(queryMock);

      const req = { query: { category: "Plumbing", active: "true", page: "1", limit: "5" } };
      const res = createMockRes();

      await getAllProfessionals(req, res);

      expect(Professional.countDocuments).toHaveBeenCalledWith({ category: "Plumbing", active: true });
      expect(Professional.find).toHaveBeenCalledWith({ category: "Plumbing", active: true });
      expect(queryMock.limit).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("11. getAllEmergencies - handles empty results cleanly", async () => {
      EmergencyRequest.countDocuments.mockResolvedValue(0);
      const queryMock = createChainedQueryMock([]);
      EmergencyRequest.find.mockReturnValue(queryMock);

      const req = { query: { status: "Resolved" } };
      const res = createMockRes();

      await getAllEmergencies(req, res);

      expect(EmergencyRequest.countDocuments).toHaveBeenCalledWith({ status: "Resolved" });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          emergencies: [],
          pagination: {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0
          }
        })
      );
    });
  });
});
