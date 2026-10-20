import fs from "node:fs";
import path from "node:path";
const roots = [
  "apps",
  "services",
  "packages",
  "scripts",
  "frontend/src",
  "docs",
  "infrastructure",
  ".github",
];
const patterns = [
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
  /GOCSPX-[\w-]{20,}/,
  /AIza[\w-]{35}/,
];
let failed = false;
for (const root of roots)
  if (fs.existsSync(root))
    for (const entry of fs.readdirSync(root, { recursive: true })) {
      const file = path.join(root, entry);
      if (
        !/\.(?:[cm]?js|jsx|json|md|ya?ml|css)$/.test(file) ||
        file.includes("node_modules")
      )
        continue;
      const source = fs.readFileSync(file, "utf8");
      if (patterns.some((pattern) => pattern.test(source))) {
        console.error(`Potential secret in ${file}; value redacted.`);
        failed = true;
      }
    }
if (failed) process.exit(1);
console.log(
  "Active source secret-pattern scan passed; ignored local secrets were excluded.",
);
