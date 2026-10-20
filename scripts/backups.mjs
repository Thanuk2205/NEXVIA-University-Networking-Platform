import fs from "node:fs";
import crypto from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import mongoose from "mongoose";
const { EJSON } = mongoose.mongo.BSON;
export async function archiveDatabase(db, key) {
  if (!/^[a-f0-9]{64}$/i.test(key))
    throw new Error("Use a separate 32-byte BACKUP_ENCRYPTION_KEY.");
  const collections = [];
  for (const c of await db.listCollections({}, { nameOnly: true }).toArray()) {
    const collection = db.collection(c.name);
    collections.push({
      name: c.name,
      indexes: await collection.indexes(),
      documents: await collection.find().toArray(),
    });
  }
  const plain = gzipSync(
    EJSON.stringify(
      { format: 1, database: db.databaseName, at: new Date(), collections },
      { relaxed: false },
    ),
  );
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([
    Buffer.from("NXBACKUP1"),
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]);
}
export function decryptArchive(bytes, key) {
  if (bytes.subarray(0, 9).toString() !== "NXBACKUP1")
    throw new Error("Unsupported archive.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    bytes.subarray(9, 21),
  );
  decipher.setAuthTag(bytes.subarray(21, 37));
  return EJSON.parse(
    gunzipSync(
      Buffer.concat([decipher.update(bytes.subarray(37)), decipher.final()]),
    ).toString(),
    { relaxed: false },
  );
}
export async function restoreArchive(db, bytes, key) {
  const archive = decryptArchive(bytes, key);
  if ((await db.listCollections({}, { nameOnly: true }).toArray()).length)
    throw new Error(
      "Restore target must be a new, empty database. Existing data is never overwritten.",
    );
  for (const c of archive.collections) {
    await db.createCollection(c.name);
    if (c.documents.length) await db.collection(c.name).insertMany(c.documents);
    for (const index of c.indexes) {
      if (index.name === "_id_") continue;
      const { key: keys, v, ns, ...options } = index;
      await db.collection(c.name).createIndex(keys, options);
    }
  }
  return {
    collections: archive.collections.length,
    records: archive.collections.reduce((n, c) => n + c.documents.length, 0),
  };
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/backups.mjs")) {
  const [mode, file] = process.argv.slice(2),
    uri = process.env.BACKUP_MONGO_URI,
    key = process.env.BACKUP_ENCRYPTION_KEY;
  if (!uri || !key || !file || !["backup", "restore"].includes(mode))
    throw new Error(
      "Set BACKUP_MONGO_URI and BACKUP_ENCRYPTION_KEY; use node scripts/backups.mjs backup|restore <archive>. Pause writes for a consistent logical backup.",
    );
  const db = await mongoose.createConnection(uri).asPromise();
  try {
    if (mode === "backup") {
      fs.writeFileSync(file, await archiveDatabase(db.db, key), {
        mode: 0o600,
        flag: "wx",
      });
      console.log("Encrypted archive created.");
    } else {
      if (!/_restore_[a-z0-9_]+$/.test(db.name))
        throw new Error(
          "Use a new database ending in _restore_<rehearsal-name>.",
        );
      const result = await restoreArchive(db.db, fs.readFileSync(file), key);
      console.log(JSON.stringify(result));
    }
  } finally {
    await db.close();
  }
}
