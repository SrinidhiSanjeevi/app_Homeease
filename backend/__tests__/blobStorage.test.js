const {
  parseImageKey,
  generateImageUrl,
  attachImageUrls
} = require("../services/blobStorage");

describe("Blob Storage Service - Unit Tests", () => {
  describe("parseImageKey", () => {
    test("correctly parses valid container/blob key", () => {
      const result = parseImageKey("service-images/AC Deep Filter & Foam Service.jpeg");
      expect(result).not.toBeNull();
      expect(result.containerName).toBe("service-images");
      expect(result.blobName).toBe("AC Deep Filter & Foam Service.jpeg");
    });

    test("correctly parses professional images key", () => {
      const result = parseImageKey("professional-images/Robert Wade.jpeg");
      expect(result).not.toBeNull();
      expect(result.containerName).toBe("professional-images");
      expect(result.blobName).toBe("Robert Wade.jpeg");
    });

    test("returns null for empty or non-string key", () => {
      expect(parseImageKey(null)).toBeNull();
      expect(parseImageKey(undefined)).toBeNull();
      expect(parseImageKey("")).toBeNull();
      expect(parseImageKey(123)).toBeNull();
    });

    test("rejects keys with directory traversal", () => {
      expect(parseImageKey("../service-images/image.jpg")).toBeNull();
      expect(parseImageKey("service-images/../secret.txt")).toBeNull();
    });

    test("rejects keys without container or blob", () => {
      expect(parseImageKey("single-word-no-slash")).toBeNull();
      expect(parseImageKey("/leading-slash.jpg")).toBeNull();
      expect(parseImageKey("trailing-slash/")).toBeNull();
    });
  });

  describe("generateImageUrl validation and safety", () => {
    test("returns null for null/undefined/invalid imageKey without throwing", async () => {
      expect(await generateImageUrl(null)).toBeNull();
      expect(await generateImageUrl("")).toBeNull();
      expect(await generateImageUrl("invalid-no-slash")).toBeNull();
    });
  });

  describe("attachImageUrls batch helper", () => {
    test("handles empty array gracefully", async () => {
      const result = await attachImageUrls([]);
      expect(result).toEqual([]);
    });

    test("handles non-array input gracefully", async () => {
      const result = await attachImageUrls(null);
      expect(result).toEqual([]);
    });

    test("attaches imageUrl to array of items with invalid/null key as null", async () => {
      const items = [
        { name: "Item 1", imageKey: null },
        { name: "Item 2", imageKey: "invalidKey" }
      ];
      const result = await attachImageUrls(items);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Item 1");
      expect(result[0].imageUrl).toBeNull();
      expect(result[1].name).toBe("Item 2");
      expect(result[1].imageUrl).toBeNull();
    });
  });
});
