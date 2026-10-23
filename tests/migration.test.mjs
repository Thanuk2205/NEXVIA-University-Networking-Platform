import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { stack } from "./harness.mjs";
test("Legacy migration is read-only by default, preserves IDs and hashes, and can be rerun", async () => {
  const s = await stack();
  try {
    const student = new mongoose.Types.ObjectId(),
      employer = new mongoose.Types.ObjectId(),
      job = new mongoose.Types.ObjectId(),
      application = new mongoose.Types.ObjectId(),
      suggestion = new mongoose.Types.ObjectId(),
      post = new mongoose.Types.ObjectId(),
      hash = await bcrypt.hash("legacy12", 10),
      source = s.services.cv.db.db;
    const users = [
      {
        _id: student,
        email: "legacy-student@demo.example",
        name: "Legacy student",
        role: "student",
        password: hash,
        isVerified: true,
        studentProfile: {
          skills: ["Old skill"],
          bio: "Retained career history",
        },
      },
      {
        _id: employer,
        email: "legacy-employer@demo.example",
        name: "Legacy recruiter",
        role: "company",
        password: hash,
        companyProfile: { companyName: "Legacy Demo Company" },
      },
    ];
    await source.collection("users").insertMany(users);
    await source
      .collection("jobs")
      .insertOne({
        _id: job,
        company: employer,
        title: "Legacy demo vacancy",
        description: "Preserved legacy history",
        type: "internship",
      });
    await source.collection("applications").insertMany([
      {
        _id: application,
        job,
        applicant: student,
        status: "applied",
        createdAt: new Date(),
      },
      { _id: suggestion, job, applicant: employer, status: "suggested" },
    ]);
    await source
      .collection("posts")
      .insertOne({
        _id: post,
        author: student,
        content: "Legacy post",
        comments: [{ text: "Old guidance" }],
        likes: [employer],
      });
    const env = {
      ...process.env,
      NODE_ENV: "development",
      LEGACY_MONGO_URI: s.services.cv.config.mongoUri,
      USER_JWT_PUBLIC_KEY: s.keys.user.publicKey,
      USER_JWT_PRIVATE_KEY: s.keys.user.privateKey,
      SERVICE_PRIVATE_KEY: s.keys.identity.privateKey,
      SERVICE_PUBLIC_KEYS_JSON: JSON.stringify(
        s.services.identity.config.servicePublicKeys,
      ),
      TOKEN_ENCRYPTION_KEY: s.services.identity.config.tokenKey,
    };
    for (const [name, service] of Object.entries(s.services))
      env[`${name.toUpperCase()}_MONGO_URI`] = service.config.mongoUri;
    async function run(apply = false) {
      return new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["scripts/migrations/legacy.mjs", ...(apply ? ["--apply"] : [])],
          { env, windowsHide: true },
        );
        let output = "",
          error = "";
        child.stdout.on("data", (c) => (output += c));
        child.stderr.on("data", (c) => (error += c));
        child.on("error", reject);
        child.on("exit", (code) =>
          code
            ? reject(new Error(`Migration failed: ${error}`))
            : resolve(JSON.parse(output)),
        );
      });
    }
    const dry = await run();
    assert.equal(dry.mode, "dry-run");
    assert.equal(
      await s.services.identity.Account.countDocuments({ _id: student }),
      0,
    );
    await run(true);
    await run(true);
    const migrated = await s.services.identity.Account.findById(student);
    assert.equal(migrated.passwordHash, hash);
    assert.equal(migrated.approvalStatus, "pending");
    assert.equal(migrated.emailVerified, false);
    assert.equal(
      (await s.services.identity.Account.findById(employer)).role,
      "employer",
    );
    assert.equal(
      await s.services.opportunity.Application.countDocuments({
        _id: application,
      }),
      1,
    );
    assert.equal(
      (await s.services.opportunity.Application.findById(application))
        .applicantId,
      String(student),
    );
    assert.equal(
      await s.services.opportunity.Application.countDocuments({
        _id: suggestion,
      }),
      0,
    );
    assert.equal(
      await s.services.community.Post.countDocuments({ _id: post }),
      1,
    );
    assert.equal(
      await s.services.community.db.db
        .collection("legacy_interactions")
        .countDocuments({ _id: post }),
      1,
    );
    assert.equal(
      await s.services.opportunity.db.db
        .collection("legacy_suggested_applications")
        .countDocuments({ _id: suggestion }),
      1,
    );
    assert.equal(
      (await source.collection("users").findOne({ _id: student })).password,
      hash,
    );
  } finally {
    await s.close();
  }
});
