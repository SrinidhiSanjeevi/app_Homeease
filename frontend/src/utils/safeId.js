// Only 24-character hex strings (MongoDB ObjectIds) are allowed inside request URLs.
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

export function isObjectId(value) {
  return typeof value === "string" && OBJECT_ID_RE.test(value);
}

// Returns the id when it is a valid ObjectId, otherwise null (never builds a URL from raw input).
export function toSafeId(value) {
  return isObjectId(value) ? value : null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns the date only when it is a real calendar date in YYYY-MM-DD form, otherwise null.
export function toSafeDate(value) {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}
