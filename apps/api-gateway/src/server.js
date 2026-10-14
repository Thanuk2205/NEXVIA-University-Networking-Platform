import { configFor } from "@nexvia/platform-utils";
import { createGateway } from "./app.js";
const config = configFor("gateway");
const server = createGateway(config).listen(config.port, "0.0.0.0", () =>
  console.log(JSON.stringify({ service: "gateway", port: config.port })),
);
process.once("SIGTERM", () => server.close());
process.once("SIGINT", () => server.close());
