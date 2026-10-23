import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import { z, validate } from "@nexvia/platform-utils";
const derive = promisify(scrypt);
export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((v) => Buffer.byteLength(v, "utf8") <= 512, "Password is too long.");
export async function hashPassword(password, { legacy = false } = {}) {
  if (!legacy) validate(passwordSchema, password);
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  if (stored?.startsWith("$2"))
    return (
      Buffer.byteLength(password, "utf8") <= 72 &&
      bcrypt.compare(password, stored)
    );
  if (
    !stored?.startsWith("scrypt:") ||
    typeof password !== "string" ||
    Buffer.byteLength(password) > 512
  )
    return false;
  const [, salt, hash] = stored.split(":");
  const actual = await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  });
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
