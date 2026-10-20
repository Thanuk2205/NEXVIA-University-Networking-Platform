import fs from "node:fs";
import crypto from "node:crypto";
if (process.env.NODE_ENV === "production")
  throw new Error("Synthetic demo provisioning is disabled in production.");
fs.mkdirSync(".local", { recursive: true });
const file = ".local/demo-password.txt";
if (!fs.existsSync(file))
  fs.writeFileSync(file, crypto.randomBytes(24).toString("base64url"), {
    mode: 0o600,
    flag: "wx",
  });
process.env.DEMO_PASSWORD = fs.readFileSync(file, "utf8").trim();
await import("./seed.mjs");
console.log(
  "The private demo password is saved in .local/demo-password.txt. Keep it out of source control.",
);
