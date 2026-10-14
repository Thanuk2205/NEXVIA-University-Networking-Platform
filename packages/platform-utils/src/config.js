import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export const names = [
  "identity",
  "profile",
  "opportunity",
  "matching",
  "community",
  "notification",
  "cv",
];
export const ports = Object.fromEntries(names.map((n, i) => [n, 5101 + i]));
const read = (key, fallback) =>
  process.env[key] ||
  (fs.existsSync(fallback) ? fs.readFileSync(fallback, "utf8").trim() : "");
export function configFor(name) {
  dotenv.config({ quiet: true });
  const dir = process.env.SERVICE_KEYS_DIR || ".local";
  const localUris =
    process.env.NODE_ENV !== "production" &&
    fs.existsSync(".local/service-uris.json")
      ? JSON.parse(fs.readFileSync(".local/service-uris.json", "utf8"))
      : {};
  const publicKeys = Object.fromEntries(
    [...names, "gateway"].map((n) => [
      n,
      read(
        `${n.toUpperCase()}_SERVICE_PUBLIC_KEY`,
        path.join(dir, `${n}-public.pem`),
      ),
    ]),
  );
  const config = {
    name,
    trustedProxies: (process.env.TRUST_PROXY || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    userKeyId: process.env.USER_JWT_KEY_ID || "identity-1",
    serviceKeyId: process.env.SERVICE_KEY_ID || name,
    production: process.env.NODE_ENV === "production",
    port: Number(process.env.PORT || ports[name] || 5000),
    mongoUri: process.env[`${name.toUpperCase()}_MONGO_URI`]?.includes("@")
      ? process.env[`${name.toUpperCase()}_MONGO_URI`]
      : localUris[name] || process.env[`${name.toUpperCase()}_MONGO_URI`],
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    userPublicKey: read(
      "USER_JWT_PUBLIC_KEY",
      process.env.USER_JWT_PUBLIC_KEY_FILE || ".local/user-public.pem",
    ),
    userPrivateKey:
      name === "identity"
        ? read(
            "USER_JWT_PRIVATE_KEY",
            process.env.USER_JWT_PRIVATE_KEY_FILE || ".local/user-private.pem",
          )
        : undefined,
    servicePrivateKey: read(
      "SERVICE_PRIVATE_KEY",
      process.env.SERVICE_PRIVATE_KEY_FILE ||
        path.join(dir, `${name}-private.pem`),
    ),
    servicePublicKeys: process.env.SERVICE_PUBLIC_KEYS_JSON
      ? JSON.parse(process.env.SERVICE_PUBLIC_KEYS_JSON)
      : publicKeys,
    urls: process.env.SERVICE_URLS_JSON
      ? JSON.parse(process.env.SERVICE_URLS_JSON)
      : Object.fromEntries(
          names.map((n) => [n, `http://127.0.0.1:${ports[n]}`]),
        ),
    tokenKey:
      name === "identity"
        ? read(
            "TOKEN_ENCRYPTION_KEY",
            process.env.TOKEN_ENCRYPTION_KEY_FILE || ".local/token-key.txt",
          )
        : undefined,
    workerInterval: 750,
  };
  config.userPublicKeys = process.env.USER_JWT_PUBLIC_KEYS_JSON
    ? JSON.parse(process.env.USER_JWT_PUBLIC_KEYS_JSON)
    : { [config.userKeyId]: config.userPublicKey };
  if (
    (name === "identity" && !config.userPublicKeys[config.userKeyId]) ||
    !config.servicePublicKeys[config.serviceKeyId] ||
    config.serviceKeyId.split(":")[0] !== name
  )
    throw new Error("Signing key IDs must match their registered identities.");
  if (
    !Object.values(config.userPublicKeys).some(Boolean) ||
    !config.servicePrivateKey ||
    (name !== "gateway" && !config.mongoUri)
  )
    throw new Error(
      `Missing configuration for ${name}; run npm run setup or supply service secrets.`,
    );
  if (
    config.production &&
    (!config.origin.startsWith("https://") ||
      Object.values(config.urls).some((u) => !u.startsWith("https://")))
  )
    throw new Error("Production requires HTTPS for browser and service URLs.");
  if (
    name === "identity" &&
    (!config.userPrivateKey || !/^[a-f0-9]{64}$/i.test(config.tokenKey || ""))
  )
    throw new Error("Identity signing/encryption keys are required.");
  return config;
}
