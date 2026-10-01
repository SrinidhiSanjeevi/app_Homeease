import { describe, expect, it } from "vitest";
import { isObjectId, toSafeId } from "./safeId";

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
