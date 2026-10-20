import { configFor, startService } from "@nexvia/platform-utils";
import { install } from "./app.js";
await startService(configFor("cv"), install);
