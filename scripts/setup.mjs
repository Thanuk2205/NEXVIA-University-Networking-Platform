import fs from "node:fs";
import crypto from "node:crypto";
import { names } from "@nexvia/platform-utils";
fs.mkdirSync(".local", { recursive: true });
for (const name of ["user", ...names, "gateway"])
  if (!fs.existsSync(`.local/${name}-private.pem`)) {
    const pair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    fs.writeFileSync(`.local/${name}-private.pem`, pair.privateKey, {
      mode: 0o600,
    });
    fs.writeFileSync(`.local/${name}-public.pem`, pair.publicKey);
  }
if (!fs.existsSync(".local/token-key.txt"))
  fs.writeFileSync(
    ".local/token-key.txt",
    crypto.randomBytes(32).toString("hex"),
    { mode: 0o600 },
  );
if (!fs.existsSync(".env")) fs.copyFileSync(".env.example", ".env");
if (!fs.existsSync(".local/mongo-keyfile"))
  fs.writeFileSync(
    ".local/mongo-keyfile",
    crypto.randomBytes(756).toString("base64"),
    { mode: 0o600 },
  );
if (!fs.existsSync(".local/compose.env"))
  fs.writeFileSync(
    ".local/compose.env",
    [
      "MONGO_ROOT_PASSWORD=" + crypto.randomBytes(32).toString("hex"),
      ...names.map(
        (n) =>
          `${n.toUpperCase()}_DB_PASSWORD=${crypto.randomBytes(24).toString("hex")}`,
      ),
    ].join("\n") + "\n",
    { mode: 0o600 },
  );
console.log(
  "Local keys and configuration are ready. Existing keys and configuration were preserved.",
);
