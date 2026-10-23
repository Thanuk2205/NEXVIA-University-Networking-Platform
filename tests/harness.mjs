import crypto from "node:crypto";
import { createService, names } from "@nexvia/platform-utils";
import { startMongo } from "../scripts/mongo.mjs";
import { createGateway } from "../apps/api-gateway/src/app.js";
import { seedFixtures } from "../scripts/fixtures.mjs";
export const demoPassword = "SyntheticTestPassword123!";
export async function stack({ origin = "http://localhost:5173" } = {}) {
  const mongo = await startMongo();
  const urls = {};
  const keys = {};
  for (const name of ["user", ...names, "gateway"])
    keys[name] = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
  const base = {
    production: false,
    origin,
    userPublicKey: keys.user.publicKey,
    servicePublicKeys: Object.fromEntries(
      names.map((n) => [n, keys[n].publicKey]),
    ),
    urls,
    workerInterval: 1000000,
    tokenKey: crypto.randomBytes(32).toString("hex"),
  };
  base.servicePublicKeys.gateway = keys.gateway.publicKey;
  const services = {},
    servers = [],
    sent = [];
  for (const name of names) {
    const path = name === "matching" ? "matching-dispatch" : name;
    const { install } = await import(`../services/${path}-service/src/app.js`);
    const config = {
      ...base,
      name,
      mongoUri: mongo.serviceUris[name],
      servicePrivateKey: keys[name].privateKey,
      userPrivateKey: name === "identity" ? keys.user.privateKey : undefined,
      gmailProvider: {
        configured: true,
        send: async (message) => {
          sent.push(message);
          return {
            status: "provider_accepted",
            providerMessageId: `test-${sent.length}`,
          };
        },
      },
    };
    const s = await createService(config, install);
    services[name] = s;
    const server = await new Promise((resolve) => {
      const x = s.app.listen(0, "127.0.0.1", () => resolve(x));
    });
    servers.push(server);
    urls[name] = `http://127.0.0.1:${server.address().port}`;
  }
  const gateway = createGateway({
    ...base,
    name: "gateway",
    servicePrivateKey: keys.gateway.privateKey,
  });
  const fixtures = await seedFixtures(services, demoPassword);
  return {
    gateway,
    services,
    urls,
    fixtures,
    sent,
    keys,
    async pump(rounds = 3) {
      for (let i = 0; i < rounds; i++)
        for (const service of Object.values(services)) await service.tick();
    },
    async close() {
      await Promise.all(
        servers.map((s) => new Promise((resolve) => s.close(resolve))),
      );
      await Promise.all(Object.values(services).map((s) => s.close()));
      await mongo.stop();
    },
  };
}
