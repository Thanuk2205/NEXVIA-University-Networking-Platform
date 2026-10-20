import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import net from "node:net";
import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { names } from "@nexvia/platform-utils";
dotenv.config({ quiet: true });
export async function startMongo(
  persistent = false,
  {
    directory = ".local",
    port = 27027,
    launchTimeout = Number(
      process.env.NEXVIA_MONGO_STARTUP_TIMEOUT_MS || 120000,
    ),
  } = {},
) {
  if (!Number.isSafeInteger(launchTimeout) || launchTimeout < 1000)
    throw new Error(
      "NEXVIA_MONGO_STARTUP_TIMEOUT_MS must be a whole number of at least 1000 milliseconds.",
    );
  if (persistent)
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once("error", (error) => {
        if (error.code !== "EADDRINUSE") return reject(error);
        const conflict = new Error(
          `Local MongoDB port ${port} is already in use. A Nexvia stack may already be running at http://localhost:5173. Stop the previous development terminal with Ctrl+C before starting another copy.`,
        );
        conflict.code = "NEXVIA_MONGO_IN_USE";
        reject(conflict);
      });
      probe.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
        probe.close((error) => (error ? reject(error) : resolve()));
      });
    });
  const dataDir = path.join(directory, "mongo"),
    secretsFile = path.join(directory, "mongo-secrets.json");
  let binary = process.env.MONGOMS_SYSTEM_BINARY;
  if (!binary && process.platform === "win32") {
    const base = `${process.env.ProgramFiles || "C:/Program Files"}/MongoDB/Server`;
    if (fs.existsSync(base))
      for (const version of fs.readdirSync(base).sort().reverse()) {
        const p = `${base}/${version}/bin/mongod.exe`;
        if (fs.existsSync(p)) {
          binary = p;
          break;
        }
      }
  }
  process.env.MONGOMS_SYSTEM_BINARY_VERSION_CHECK = "false";
  if (persistent) fs.mkdirSync(dataDir, { recursive: true });
  let secrets;
  if (persistent && fs.existsSync(secretsFile))
    secrets = JSON.parse(fs.readFileSync(secretsFile, "utf8"));
  else {
    secrets = {
      rootPassword: crypto.randomBytes(32).toString("hex"),
      keyfile: crypto.randomBytes(756).toString("base64"),
      passwords: Object.fromEntries(
        names.map((n) => [n, crypto.randomBytes(24).toString("hex")]),
      ),
    };
    if (persistent)
      fs.writeFileSync(secretsFile, JSON.stringify(secrets), {
        mode: 0o600,
      });
  }
  let mongo;
  if (persistent && fs.existsSync(path.join(dataDir, "WiredTiger"))) {
    // An existing authenticated replica set must not be initialized again anonymously.
    const keyfile = path.join(directory, "mongo-native-keyfile");
    if (!fs.existsSync(keyfile))
      fs.writeFileSync(keyfile, secrets.keyfile, { mode: 0o600 });
    mongo = await MongoMemoryServer.create({
      binary: binary ? { systemBinary: binary } : undefined,
      spawn: { windowsHide: true },
      instance: {
        dbPath: path.resolve(dataDir),
        port,
        portGeneration: false,
        launchTimeout,
        replSet: "nexvia",
        storageEngine: "wiredTiger",
        keyfileLocation: path.resolve(keyfile),
      },
      auth: {
        enable: true,
        customRootName: "nexvia_local_root",
        customRootPwd: secrets.rootPassword,
      },
    });
    const adminUri = new URL(mongo.getUri("admin"));
    adminUri.username = "nexvia_local_root";
    adminUri.password = secrets.rootPassword;
    adminUri.searchParams.set("authSource", "admin");
    adminUri.searchParams.set("replicaSet", "nexvia");
    const admin = new MongoClient(adminUri.toString(), {
      serverSelectionTimeoutMS: launchTimeout,
    });
    try {
      await admin.connect();
      await admin.db("admin").command({ ping: 1 });
    } catch {
      await mongo.stop({ doCleanup: false });
      throw new Error(
        "Existing MongoDB could not authenticate or elect its primary; saved data was preserved.",
      );
    } finally {
      await admin.close();
    }
  } else
    mongo = await MongoMemoryReplSet.create({
      binary: binary ? { systemBinary: binary } : undefined,
      instanceOpts: [
        {
          launchTimeout,
          ...(persistent
            ? { dbPath: dataDir, port, portGeneration: false }
            : {}),
        },
      ],
      replSet: {
        name: "nexvia",
        count: 1,
        storageEngine: "wiredTiger",
        spawn: { windowsHide: true },
        auth: {
          enable: true,
          customRootName: "nexvia_local_root",
          customRootPwd: secrets.rootPassword,
          keyfileContent: secrets.keyfile,
          extraUsers: names.map((n) => ({
            createUser: `nexvia_${n}`,
            pwd: secrets.passwords[n],
            database: `nexvia_${n}`,
            roles: [{ role: "readWrite", db: `nexvia_${n}` }],
          })),
        },
      },
    });
  mongo.serviceUris = Object.fromEntries(
    names.map((n) => {
      const uri = new URL(mongo.getUri(`nexvia_${n}`));
      uri.username = `nexvia_${n}`;
      uri.password = secrets.passwords[n];
      uri.searchParams.set("replicaSet", "nexvia");
      return [n, uri.toString()];
    }),
  );
  if (persistent)
    fs.writeFileSync(
      path.join(directory, "service-uris.json"),
      JSON.stringify(mongo.serviceUris),
      { mode: 0o600 },
    );
  return mongo;
}
