import { createService, configFor } from "@nexvia/platform-utils";
import { install as identity } from "../services/identity-service/src/app.js";
import { install as profile } from "../services/profile-service/src/app.js";
import { install as opportunity } from "../services/opportunity-service/src/app.js";
import { install as community } from "../services/community-service/src/app.js";
import { seedFixtures } from "./fixtures.mjs";
if (process.env.NODE_ENV === "production")
  throw new Error("Demo fixtures are disabled in production.");
if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12)
  throw new Error(
    "Set DEMO_PASSWORD (12+ characters) for synthetic demo accounts.",
  );
const services = {};
try {
  for (const [name, install] of Object.entries({
    identity,
    profile,
    opportunity,
    community,
  }))
    services[name] = await createService(
      { ...configFor(name), workerInterval: 10000000 },
      install,
    );
  await seedFixtures(services, process.env.DEMO_PASSWORD);
  console.log(
    "Synthetic accounts created: admin/faculty/student/alumni/employer @demo.example. No real email was sent.",
  );
} finally {
  await Promise.all(Object.values(services).map((s) => s.close()));
}
