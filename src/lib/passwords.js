const crypto = require('node:crypto');

const KEY_LENGTH = 64;

// Stored as "scrypt:<salt>:<hash>", so the scheme can change later without guessing.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false; // a GitHub-only account has no password
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  // A damaged hash could decode to zero bytes, and two empty buffers compare as equal.
  if (expected.length !== KEY_LENGTH) return false;
  const actual = crypto.scryptSync(password, salt, KEY_LENGTH);
  // Compare in constant time, so the time taken does not leak how much matched.
  return crypto.timingSafeEqual(expected, actual);
}

module.exports = { hashPassword, verifyPassword };
