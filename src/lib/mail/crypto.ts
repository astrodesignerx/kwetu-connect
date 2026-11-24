import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Mailbox passwords are encrypted before they reach the database (AES-256-GCM). The key lives only in the
 * server environment, so a leaked backup or database access does not reveal a password.
 *
 *   MAIL_ENCRYPTION_KEY           base64 of 32 random bytes (openssl rand -base64 32)
 *   MAIL_ENCRYPTION_KEY_PREVIOUS  the same, optional, decrypt only, for rotating the key
 *
 * Format: enc:v1:<iv>:<tag>:<ciphertext>, all base64url. Adapted from the Mjengo suite (Sauti Salama).
 * Unlike the original there is no plaintext fallback: without a key nothing is saved.
 */
const PREFIX = "enc:v1:";

function loadKey(name: string): Buffer | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded (openssl rand -base64 32).`);
  return key;
}

export function encryptionConfigured(): boolean {
  return !!process.env.MAIL_ENCRYPTION_KEY?.trim();
}

export function encryptSecret(plain: string): string {
  const key = loadKey("MAIL_ENCRYPTION_KEY");
  if (!key) throw new Error("Mail is not set up on this server yet: MAIL_ENCRYPTION_KEY is missing.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${body.toString("base64url")}`;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) throw new Error("The saved password could not be read. Reconnect this mailbox.");
  const [iv, tag, body] = value.slice(PREFIX.length).split(":");
  if (!iv || !tag || !body) throw new Error("The saved password could not be read. Reconnect this mailbox.");
  for (const name of ["MAIL_ENCRYPTION_KEY", "MAIL_ENCRYPTION_KEY_PREVIOUS"]) {
    const key = loadKey(name);
    if (!key) continue;
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      // Wrong key or altered value: try the previous key.
    }
  }
  throw new Error("The saved password could not be read. Reconnect this mailbox.");
}
