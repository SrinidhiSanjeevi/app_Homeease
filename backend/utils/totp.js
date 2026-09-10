const crypto = require("crypto");

// Base32 alphabet (RFC 4648)
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Encodes a buffer into a Base32 string
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string into a Buffer
 */
function base32Decode(base32) {
  const cleanBase32 = base32.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleanBase32.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleanBase32[i]);
    if (idx === -1) {
      continue;
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a random Base32 secret for TOTP (160 bits / 20 bytes)
 */
function generateSecret(length = 20) {
  const randomBytes = crypto.randomBytes(length);
  return base32Encode(randomBytes);
}

/**
 * Generates a 6-digit TOTP token for a given counter (RFC 6238 / RFC 4226)
 */
function generateTokenForCounter(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac("sha1", key);
  hmac.update(buffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0xf;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = (code % 1000000).toString().padStart(6, "0");
  return otp;
}

/**
 * Generates the current 6-digit TOTP token
 */
function generateCurrentToken(secretBase32, step = 30) {
  const counter = Math.floor(Date.now() / 1000 / step);
  return generateTokenForCounter(secretBase32, counter);
}

/**
 * Verifies a 6-digit TOTP token against the secret with a +/- 1 step window (RFC 6238)
 */
function verifyTotp(token, secretBase32, window = 1, step = 30) {
  if (!token || !secretBase32) return false;
  const sanitizedToken = token.toString().trim();
  if (sanitizedToken.length !== 6) return false;

  const currentCounter = Math.floor(Date.now() / 1000 / step);

  for (let i = -window; i <= window; i++) {
    const expected = generateTokenForCounter(secretBase32, currentCounter + i);
    if (crypto.timingSafeEqual(Buffer.from(sanitizedToken), Buffer.from(expected))) {
      return true;
    }
  }

  return false;
}

/**
 * Generates an otpauth:// URL for QR code generation
 */
function getOtpAuthUrl(email, secretBase32, issuer = "HomeEase") {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30"
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = {
  generateSecret,
  generateCurrentToken,
  verifyTotp,
  getOtpAuthUrl,
  base32Encode,
  base32Decode
};
