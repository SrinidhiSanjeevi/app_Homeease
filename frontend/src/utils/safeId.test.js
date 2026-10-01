import { describe, expect, it } from "vitest";
import { isObjectId, toSafeDate, toSafeId } from "./safeId";

describe("safeId", () => {
  const good = "507f1f77bcf86cd799439011";

  it("accepts a 24-character hex id", () => {
    expect(isObjectId(good)).toBe(true);
    expect(isObjectId(good.toUpperCase())).toBe(true);
    expect(toSafeId(good)).toBe(good);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "abc", "../admin", `${good}/x`, "507f1f77bcf86cd79943901z", null, undefined, 42]) {
      expect(isObjectId(bad)).toBe(false);
      expect(toSafeId(bad)).toBeNull();
    }
  });
});


describe("toSafeDate", () => {
  it("accepts a valid YYYY-MM-DD date", () => {
    expect(toSafeDate("2026-10-02")).toBe("2026-10-02");
  });
  it("rejects malformed, impossible and non-string values", () => {
    for (const bad of ["", "2026-13-01", "2026-02-30", "2026-10-02&x=1", "../etc", "10/02/2026", null, undefined, 20261002]) {
      expect(toSafeDate(bad)).toBeNull();
    }
  });
});
