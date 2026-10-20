import fs from "node:fs";
import { spawnSync } from "node:child_process";
let failures = 0;
for (const root of ["apps", "services", "packages", "scripts", "tests"])
  if (fs.existsSync(root))
    for (const entry of fs.readdirSync(root, { recursive: true })) {
      const file = `${root}/${entry}`;
      if (/\.(m?js)$/.test(file)) {
        const result = spawnSync(process.execPath, ["--check", file], {
          encoding: "utf8",
          windowsHide: true,
        });
        if (result.status) {
          console.error(result.stderr);
          failures++;
        }
      }
    }
if (failures) process.exit(1);
console.log("Server, script, and test syntax checks passed.");
await import("./secrets-check.mjs");
