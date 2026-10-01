// Linear-time email check (no regex backtracking).
// Accepts: one "@", no whitespace, non-empty local part, and a domain with a dot that has text on both sides.
export function isValidEmail(email) {
  if (typeof email !== "string" || /\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at < 1 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  return domain.length >= 3 && domain.slice(1, -1).includes(".");
}

// Keep in sync with backend/validators/authValidators.js (signupRules).
export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "number", label: "One number", test: (p) => /\d/.test(p) },
];

// Returns 0 (too weak) to 4 (strong).
export function scorePassword(p) {
  if (!p) return 0;
  let score = PASSWORD_RULES.filter((r) => r.test(p)).length; // 0-4
  if (p.length >= 12 && /[^A-Za-z0-9]/.test(p)) score += 1;
  return Math.min(4, Math.max(0, score - (p.length < 8 ? 1 : 0)));
}
