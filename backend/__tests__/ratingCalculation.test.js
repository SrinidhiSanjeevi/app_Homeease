const fs = require("fs");
const path = require("path");

function calculateNewRating(currentRating, currentRatingCount, submittedRating) {
  const ratingCount = typeof currentRatingCount === "number" ? currentRatingCount : 0;
  const rating = typeof currentRating === "number" ? currentRating : 0;
  const currentTotal = rating * ratingCount;
  const newRatingCount = ratingCount + 1;
  const newAverage = (currentTotal + submittedRating) / newRatingCount;
  return {
    newRating: Math.round(newAverage * 10) / 10,
    newRatingCount
  };
}

describe("Rating Calculation and ratingCount Consistency Tests", () => {
  test("calculates weighted average correctly with existing ratingCount", () => {
    // Current rating 4.5, 10 ratings; submit 5
    // (4.5 * 10 + 5) / 11 = (45 + 5) / 11 = 50 / 11 = 4.545 -> 4.5
    const result = calculateNewRating(4.5, 10, 5);
    expect(result.newRatingCount).toBe(11);
    expect(result.newRating).toBe(4.5);
  });

  test("calculates first rating correctly from 0 ratingCount", () => {
    // Current rating 0, 0 ratings; submit 4
    const result = calculateNewRating(0, 0, 4);
    expect(result.newRatingCount).toBe(1);
    expect(result.newRating).toBe(4.0);
  });

  test("handles undefined/null initial ratingCount safely", () => {
    const result = calculateNewRating(null, null, 5);
    expect(result.newRatingCount).toBe(1);
    expect(result.newRating).toBe(5.0);
  });

  test("rounds to 1 decimal place properly", () => {
    // 4.0 with 2 ratings (total 8.0) + 5 = 13 / 3 = 4.3333 -> 4.3
    const result = calculateNewRating(4.0, 2, 5);
    expect(result.newRatingCount).toBe(3);
    expect(result.newRating).toBe(4.3);
  });

  test("ensures bookingController contains ZERO occurrences of numRatings", () => {
    const controllerPath = path.join(__dirname, "../controllers/bookingController.js");
    const content = fs.readFileSync(controllerPath, "utf8");
    expect(content.includes("numRatings")).toBe(false);
  });

  test("ensures models contain ZERO occurrences of numRatings", () => {
    const serviceModelPath = path.join(__dirname, "../models/Service.js");
    const content = fs.readFileSync(serviceModelPath, "utf8");
    expect(content.includes("numRatings")).toBe(false);
  });
});
