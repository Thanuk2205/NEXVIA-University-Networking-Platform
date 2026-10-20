import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { createServer } = await import(
  pathToFileURL(require.resolve("vite")).href
);
import { stack } from "../tests/harness.mjs";
const s = await stack({ origin: "http://localhost:5301" });
const gateway = s.gateway.listen(5300, "127.0.0.1");
const vite = await createServer({
  root: "frontend",
  server: {
    host: "localhost",
    port: 5301,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:5300" },
  },
});
await vite.listen();
const timer = setInterval(() => s.pump(1).catch(() => {}), 500);
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  await vite.close();
  await new Promise((r) => gateway.close(r));
  await s.close();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
