import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM helpers for Integrations credentials.
 * Key material never leaves the server; ciphertext is safe to store in Supabase.
 */

function secretsKeyMaterial() {
  return (
    process.env.INTEGRATION_SECRETS_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_JWT_SECRET?.trim() ||
    "triada-local-dev-only-not-for-production"
  );
}

/** @returns {Buffer} */
export function getSecretsKey() {
  return createHash("sha256").update(secretsKeyMaterial()).digest();
}

/**
 * @param {string} plaintext
 * @returns {string} `v1.<iv_b64>.<tag_b64>.<cipher_b64>`
 */
export function encryptSecret(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecretsKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

/**
 * @param {string} packed
 * @returns {string}
 */
export function decryptSecret(packed) {
  const parts = String(packed || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Unsupported ciphertext format.");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const data = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", getSecretsKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
