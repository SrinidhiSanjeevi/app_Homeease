// Only 24-character hex strings (MongoDB ObjectIds) are allowed inside request URLs.
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

export function isObjectId(value) {
  return typeof value === "string" && OBJECT_ID_RE.test(value);
}

// Returns the id when it is a valid ObjectId, otherwise null (never builds a URL from raw input).
export function toSafeId(value) {
  return isObjectId(value) ? value : null;
}
