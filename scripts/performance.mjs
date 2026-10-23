import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { stack } from "../tests/harness.mjs";
// Isolated synthetic data only; never connects to the developer's project database.
const s = await stack();
const server = await new Promise((resolve) => {
  const gateway = s.gateway.listen(0, "127.0.0.1", () => resolve(gateway));
});
const gatewayUrl = `http://127.0.0.1:${server.address().port}`;
try {
  const count = 5000,
    ids = Array.from({ length: count }, () => new mongoose.Types.ObjectId()),
    academic = s.fixtures.ids;
  await s.services.identity.Account.insertMany(
    ids.map((_id) => ({
      _id,
      email: `load-${_id}@demo.example`,
      passwordHash: "disabled-synthetic-login",
      role: "student",
      emailVerified: true,
      approvalStatus: "approved",
      isActive: true,
      authVersion: 1,
    })),
    { ordered: false },
  );
  await s.services.profile.Profile.insertMany(
    ids.map((_id, i) => ({
      userId: String(_id),
      fullName: `Synthetic learner ${i}`,
      ...academic,
      academicYear: 2,
      membershipApproved: true,
      skills: s.fixtures.skills,
      education: [
        {
          institution: "Demo University",
          qualification: "BSc",
          startYear: 2024,
        },
      ],
      candidateDiscovery: { enabled: true },
      visibleCareerFields: ["fullName", "degreeProgramId", "skills"],
    })),
    { ordered: false },
  );
  const tokens = ids
    .slice(0, 100)
    .map((_id) =>
      jwt.sign(
        {
          authVersion: 1,
          role: "student",
          sid: String(new mongoose.Types.ObjectId()),
        },
        s.keys.user.privateKey,
        {
          algorithm: "RS256",
          keyid: "identity-1",
          issuer: "nexvia-identity",
          audience: "nexvia-api",
          subject: String(_id),
          expiresIn: "5m",
        },
      ),
    );
  await (
    await fetch(`${gatewayUrl}/api/v1/opportunities?limit=20`, {
      headers: { Cookie: `nx_access=${tokens[0]}` },
    })
  ).json();
  const durations = await Promise.all(
    tokens.map(async (token) => {
      const start = performance.now();
      const response = await fetch(
        `${gatewayUrl}/api/v1/opportunities?limit=20`,
        { headers: { Cookie: `nx_access=${token}` } },
      );
      if (response.status !== 200)
        throw new Error(`Unexpected response ${response.status}`);
      await response.json();
      return performance.now() - start;
    }),
  );
  durations.sort((a, b) => a - b);
  const matchingStart = performance.now();
  await s.services.matching.Run.updateOne(
    { opportunityId: String(s.fixtures.vacancy._id) },
    {
      $set: {
        status: "queued",
        opportunityRevision: s.fixtures.vacancy.revision,
      },
    },
    { upsert: true },
  );
  await s.services.matching.tick();
  const matched = await s.services.matching.Run.findOne({
    opportunityId: String(s.fixtures.vacancy._id),
  }).lean();
  if (matched.status !== "completed")
    throw new Error("Matching did not complete.");
  const matchingMs = performance.now() - matchingStart;
  const notice = await s.services.opportunity.Notice.create({
    title: "Synthetic performance dispatch",
    body: "Test guidance",
    scope: academic,
    category: "academic",
    createdByUserId: String(s.fixtures.users.faculty._id),
    status: "published",
    revision: 1,
  });
  const d = await s.services.matching.Dispatch.create({
    senderId: String(s.fixtures.users.faculty._id),
    contentType: "academic_notice",
    contentId: String(notice._id),
    contentRevision: 1,
    criteria: academic,
    title: notice.title,
    body: notice.body,
    total: 1000,
  });
  await s.services.matching.Recipient.insertMany(
    ids
      .slice(0, 1000)
      .map((id) => ({ dispatchId: String(d._id), userId: String(id) })),
  );
  const dispatchStart = performance.now();
  // Keep large dispatch work independent of the manual harness's slow global pump.
  for (let i = 0; i < 45; i++) {
    await s.services.matching.tick();
    await s.services.notification.tick();
  }
  const persisted = await s.services.notification.Notification.countDocuments({
    dispatchId: String(d._id),
  });
  if (persisted !== 1000)
    throw new Error(`Only ${persisted} of 1000 records persisted.`);
  const report = {
    at: new Date().toISOString(),
    node: process.version,
    platform: os.platform(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    ramGiB: Math.round(os.totalmem() / 2 ** 30),
    dataset: {
      syntheticProfiles: count,
      concurrentAuthenticatedReads: 100,
      dispatchRecipients: 1000,
    },
    ordinaryApi: {
      route: "GET /api/v1/opportunities?limit=20",
      p50Ms: Math.round(durations[49]),
      p95Ms: Math.round(durations[94]),
      maxMs: Math.round(durations[99]),
      targetP95Ms: 500,
    },
    matching: {
      ms: Math.round(matchingMs),
      returned: matched.results.length,
      targetMs: 30000,
    },
    dispatch: {
      ms: Math.round(performance.now() - dispatchStart),
      persisted,
      targetMs: 120000,
    },
    providerCalls:
      "Excluded; Gmail delivery is suppressed by default preferences.",
    limits:
      "Local single-host synthetic run; not a production availability or broad API performance guarantee.",
  };
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync(
    "docs/PERFORMANCE_RESULTS.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await new Promise((resolve) => server.close(resolve));
  await s.close();
}
