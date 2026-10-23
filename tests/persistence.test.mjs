import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { MongoClient } from "mongodb";
import { startMongo } from "../scripts/mongo.mjs";
test("Authenticated development Mongo rejects duplicate starts and restarts with saved data", async () => {
  const base = path.resolve(".local"),
    directory = path.join(base, `persistence-test-${crypto.randomUUID()}`);
  const available = net.createServer();
  await new Promise((resolve) => available.listen(0, "127.0.0.1", resolve));
  const port = available.address().port;
  await new Promise((resolve) => available.close(resolve));
  let mongo, db;
  try {
    mongo = await startMongo(true, { directory, port });
    db = new MongoClient(mongo.serviceUris.profile);
    await db.connect();
    await db.db().collection("restart_test").insertOne({ proof: "retained" });
    await assert.rejects(
      () => startMongo(true, { directory, port }),
      (error) => error.code === "NEXVIA_MONGO_IN_USE",
    );
    assert.equal(
      (await db.db().collection("restart_test").findOne()).proof,
      "retained",
    );
    const firstUri = mongo.serviceUris.profile;
    await db.close();
    db = null;
    await mongo.stop({ doCleanup: false });
    mongo = await startMongo(true, { directory, port });
    assert.equal(mongo.serviceUris.profile, firstUri);
    db = new MongoClient(mongo.serviceUris.profile);
    await db.connect();
    assert.equal(
      (await db.db().collection("restart_test").findOne()).proof,
      "retained",
    );
    await assert.rejects(
      () => db.db("nexvia_identity").collection("accounts").findOne(),
      (error) => error.code === 13,
    );
  } finally {
    if (db) await db.close();
    if (mongo) await mongo.stop({ doCleanup: false });
    // Only this test's verified, generated directory is removed.
    if (
      !directory.startsWith(base + path.sep) ||
      !path.basename(directory).startsWith("persistence-test-")
    )
      throw new Error("Unsafe test cleanup path.");
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
