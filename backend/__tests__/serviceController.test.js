const { getServices, getProfessionals } = require("../controllers/serviceController");
const Service = require("../models/Service");
const Professional = require("../models/Professional");

jest.mock("../models/Service");
jest.mock("../models/Professional");
jest.mock("../services/blobStorage", () => ({
  attachImageUrls: jest.fn().mockImplementation(async (items) => {
    return items.map((item) => ({
      ...item,
      imageUrl: item.imageKey ? `https://mock-storage.blob.core.windows.net/${item.imageKey}?mockSasToken` : null
    }));
  })
}));

describe("Service Controller - Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getServices", () => {
    test("queries active services only and returns enriched records", async () => {
      const mockServices = [
        {
          _id: "s1",
          name: "Deep Cleaning",
          category: "Cleaning",
          imageKey: "service-images/cleaning.jpg",
          imageAlt: "Deep Cleaning service",
          ratingCount: 5,
          active: true
        }
      ];

      const selectMock = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockServices)
        })
      });

      Service.find.mockReturnValue({
        select: selectMock
      });

      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await getServices(req, res);

      expect(Service.find).toHaveBeenCalledWith({ active: true });
      expect(selectMock).toHaveBeenCalledWith("-image -numRatings");
      expect(res.status).toHaveBeenCalledWith(200);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.success).toBe(true);
      expect(responseBody.services).toHaveLength(1);
      expect(responseBody.services[0].imageUrl).toContain("mock-storage");
      expect(responseBody.services[0].imageKey).toBe("service-images/cleaning.jpg");
      expect(responseBody.services[0].imageAlt).toBe("Deep Cleaning service");
    });
  });

  describe("getProfessionals", () => {
    test("queries active professionals with optional category filter", async () => {
      const mockProfessionals = [
        {
          _id: "p1",
          name: "Robert Wade",
          category: "Plumbing",
          imageKey: "professional-images/robert.jpg",
          imageAlt: "Robert Wade - Plumbing professional",
          active: true
        }
      ];

      const selectMock = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockProfessionals)
        })
      });

      Professional.find.mockReturnValue({
        select: selectMock
      });

      const req = { query: { category: "Plumbing" } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await getProfessionals(req, res);

      expect(Professional.find).toHaveBeenCalledWith({ active: true, category: "Plumbing" });
      expect(res.status).toHaveBeenCalledWith(200);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.success).toBe(true);
      expect(responseBody.professionals).toHaveLength(1);
      expect(responseBody.professionals[0].imageUrl).toContain("mock-storage");
    });
  });
});
