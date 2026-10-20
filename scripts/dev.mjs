import { spawn } from "node:child_process";
import { startMongo } from "./mongo.mjs";
import "./setup.mjs";
console.log(
  "Starting local MongoDB; database recovery can take up to two minutes.",
);
let mongo;
try {
  mongo = await startMongo(true);
} catch (error) {
  console.error(`Nexvia could not start: ${error.message}`);
  process.exit(1);
}
const children = [];
const paths = [
  "apps/api-gateway",
  ...[
    "identity",
    "profile",
    "opportunity",
    "matching-dispatch",
    "community",
    "notification",
    "cv",
  ].map((n) => `services/${n}-service`),
];
for (const path of paths)
  children.push(
    spawn(process.execPath, [`${path}/src/server.js`], {
      stdio: "inherit",
      windowsHide: true,
    }),
  );
children.push(
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    cwd: "frontend",
    stdio: "inherit",
    windowsHide: true,
  }),
);
console.log(
  "Nexvia web: http://localhost:5173 | API: http://localhost:5000/api/v1",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const p of children) p.kill();
  await mongo.stop({ doCleanup: false });
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
for (const child of children)
  child.once("exit", (code) => {
    if (code && !stopping) {
      console.error("A development process failed; stopping the stack.");
      stop();
    }
  });
