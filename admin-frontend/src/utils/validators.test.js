import { describe, expect, it } from "vitest";
import { PASSWORD_RULES, isValidEmail, scorePassword } from "./validators";

describe("isValidEmail", () => {
  it("accepts normal addresses", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("first.last@mail.example.com")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "plain", "@b.co", "a@", "a@b", "a@.co", "a@b.", "a b@c.de", "a@@b.co", "a@b@c.de", null]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });

  it("is fast on hostile input", () => {
    const start = Date.now();
    isValidEmail(`a@${"b".repeat(50000)}`);
    expect(Date.now() - start).toBeLessThan(200);
  });
});

describe("password rules", () => {
  it("checks each rule", () => {
    const met = (p) => PASSWORD_RULES.filter((r) => r.test(p)).map((r) => r.id);
    expect(met("Abcdefg1")).toEqual(["length", "upper", "lower", "number"]);
    expect(met("abc")).toEqual(["lower"]);
  });

  it("scores from 0 to 4", () => {
    expect(scorePassword("")).toBe(0);
    expect(scorePassword("abc")).toBe(0);
    expect(scorePassword("abcdefgh")).toBe(2);
    expect(scorePassword("Abcdefg1")).toBe(4);
    expect(scorePassword("Abcdefghij1!")).toBe(4);
  });
});
