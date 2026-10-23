import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  archiveDatabase,
  decryptArchive,
  restoreArchive,
} from "../scripts/backups.mjs";
import { startMongo } from "../scripts/mongo.mjs";
import mongoose from "mongoose";
test("Encrypted backup restores BSON identities and indexes into an empty authorized target", async () => {
  const mongo = await startMongo();
  const source = await mongoose
    .createConnection(mongo.serviceUris.profile)
    .asPromise();
  const target = await mongoose
    .createConnection(mongo.serviceUris.cv)
    .asPromise();
  try {
    const id = new mongoose.Types.ObjectId();
    await source.db
      .collection("profiles")
      .createIndex({ userId: 1 }, { unique: true });
    await source.db.collection("profiles").insertOne({
      _id: id,
      userId: "synthetic-student",
      updatedAt: new Date(),
      skills: ["Python"],
    });
    const key = crypto.randomBytes(32).toString("hex");
    const archive = await archiveDatabase(source.db, key);
    assert.equal(archive.includes(Buffer.from("synthetic-student")), false);
    assert.throws(() =>
      decryptArchive(archive, crypto.randomBytes(32).toString("hex")),
    );
    const counts = await restoreArchive(target.db, archive, key);
    assert.equal(counts.records, 1);
    const restored = await target.db
      .collection("profiles")
      .findOne({ userId: "synthetic-student" });
    assert.equal(restored._id.toHexString(), id.toHexString());
    assert.ok(restored.updatedAt instanceof Date);
    assert.ok(
      (await target.db.collection("profiles").indexes()).some(
        (i) => i.unique && i.key.userId,
      ),
    );
    await assert.rejects(
      () => restoreArchive(target.db, archive, key),
      /empty database/,
    );
    await assert.rejects(
      () =>
        source
          .getClient()
          .db("nexvia_identity")
          .collection("accounts")
          .findOne(),
      (e) => e.code === 13,
    );
  } finally {
    await source.close();
    await target.close();
    await mongo.stop();
  }
});
