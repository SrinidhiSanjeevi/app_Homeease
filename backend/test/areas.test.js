const { test } = require("node:test");
const assert = require("node:assert/strict");
const { areaDistanceKm, normalizeServiceAreas, MAX_SERVICE_AREAS } = require("../services/areas");
const { coversArea } = require("../services/professionalMatcher");

test("areaDistanceKm is 0 for the same area and symmetric", () => {
  assert.equal(areaDistanceKm("Gachibowli", "gachibowli"), 0);
  assert.equal(areaDistanceKm("Gachibowli", "Kondapur"), areaDistanceKm("Kondapur", "Gachibowli"));
  assert.ok(areaDistanceKm("Gachibowli", "Kondapur") > 0);
});

test("areaDistanceKm is Infinity for unknown or missing areas", () => {
  assert.equal(areaDistanceKm("Gachibowli", null), Infinity);
  assert.equal(areaDistanceKm("Nowhere", "Gachibowli"), Infinity);
});

test("normalizeServiceAreas puts the home area first and removes duplicates", () => {
  assert.deepEqual(normalizeServiceAreas(["madhapur", "HITEC City", "Madhapur"], "Gachibowli"), {
    areas: ["Gachibowli", "Madhapur", "HITEC City"]
  });
});

test("normalizeServiceAreas enforces the area limit and rejects unknown areas", () => {
  const tooMany = ["Kondapur", "Raidurg", "Manikonda", "Kothaguda", "Madhapur"];
  assert.ok(tooMany.length + 1 > MAX_SERVICE_AREAS);
  assert.match(normalizeServiceAreas(tooMany, "Gachibowli").error, /at most/);
  assert.match(normalizeServiceAreas(["Mars"], "Gachibowli").error, /Unknown/);
});

test("coversArea uses serviceAreas, falling back to the home area for older records", () => {
  assert.equal(coversArea({ locality: "Kondapur", serviceAreas: ["Kondapur", "Gachibowli"] }, "gachibowli"), true);
  assert.equal(coversArea({ locality: "HITEC City", serviceAreas: ["HITEC City"] }, "Gachibowli"), false);
  assert.equal(coversArea({ locality: "Raidurg", serviceAreas: [] }, "Raidurg"), true);
  assert.equal(coversArea({ locality: "Raidurg", serviceAreas: [] }, "Madhapur"), false);
});
