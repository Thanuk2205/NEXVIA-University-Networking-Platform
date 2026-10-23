import fs from "node:fs";
import mongoose from "mongoose";
import { createService, configFor } from "@nexvia/platform-utils";
import { install as identity } from "../../services/identity-service/src/app.js";
import { install as profile } from "../../services/profile-service/src/app.js";
import { install as opportunity } from "../../services/opportunity-service/src/app.js";
import { install as community } from "../../services/community-service/src/app.js";
if (!process.env.LEGACY_MONGO_URI)
  throw new Error(
    "Set the source LEGACY_MONGO_URI explicitly. The source is read-only to this tool.",
  );
const source = await mongoose
  .createConnection(process.env.LEGACY_MONGO_URI)
  .asPromise();
const services = {};
const apply = process.argv.includes("--apply");
try {
  const users = await source.db.collection("users").find({}).toArray(),
    jobs = await source.db.collection("jobs").find({}).toArray(),
    applications = await source.db
      .collection("applications")
      .find({})
      .toArray(),
    posts = await source.db.collection("posts").find({}).toArray();
  const report = {
    mode: apply ? "apply" : "dry-run",
    users: users.length,
    opportunities: jobs.length,
    applications: applications.filter((a) => a.status !== "suggested").length,
    recommendationRowsArchived: applications.filter(
      (a) => a.status === "suggested",
    ).length,
    posts: posts.length,
    academicMembership:
      "University taxonomy/alias review required; legacy labels retained privately.",
    approval:
      "Legacy automatic verification is not trusted. All migrated accounts require ownership/institutional review.",
  };
  fs.mkdirSync(".local/migrations", { recursive: true });
  fs.writeFileSync(
    `.local/migrations/${Date.now()}-report.json`,
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  if (apply) {
    for (const [name, install] of Object.entries({
      identity,
      profile,
      opportunity,
      community,
    }))
      services[name] = await createService(
        { ...configFor(name), workerInterval: 1000000 },
        install,
      );
    for (const u of users) {
      if (
        ![
          "student",
          "alumni",
          "company",
          "employer",
          "faculty",
          "admin",
        ].includes(u.role) ||
        !u.password
      )
        throw new Error(
          "An unsupported account needs manual review before migration.",
        );
      const userId = String(u._id),
        role = u.role === "company" ? "employer" : u.role;
      await services.identity.Account.updateOne(
        { _id: u._id },
        {
          $setOnInsert: {
            email: u.email.toLowerCase(),
            passwordHash: u.password,
            role,
            emailVerified: false,
            approvalStatus: "pending",
            isActive: u.isActive !== false,
          },
        },
        { upsert: true },
      );
      await services.profile.Profile.updateOne(
        { userId },
        {
          $setOnInsert: {
            userId,
            fullName: u.name || "Legacy member",
            bio: u.studentProfile?.bio || "",
            education: [],
            skills: [],
            candidateDiscovery: { enabled: false },
            profileVisibility: "owner",
          },
        },
        { upsert: true },
      );
      await services.profile.db.collection("legacy_profile_review").updateOne(
        { _id: u._id },
        {
          $setOnInsert: {
            academicProfile: u.academicProfile,
            careerProfile: u.studentProfile,
            companyProfile: u.companyProfile,
            reviewStatus: "pending",
          },
        },
        { upsert: true },
      );
      if (role === "employer")
        await services.profile.Organization.updateOne(
          { primaryRecruiterUserId: userId },
          {
            $setOnInsert: {
              primaryRecruiterUserId: userId,
              organizationName: u.companyProfile?.companyName || u.name,
              organizationApprovalStatus: "pending",
            },
          },
          { upsert: true },
        );
    }
    for (const j of jobs) {
      const o = await services.profile.Organization.findOne({
        primaryRecruiterUserId: String(j.company),
      }).lean();
      await services.opportunity.Opportunity.updateOne(
        { _id: j._id },
        {
          $setOnInsert: {
            title: j.title,
            description: j.description,
            kind: j.type === "internship" ? "internship" : "job",
            employmentType: j.type,
            createdByUserId: String(j.company),
            organizationId: o?._id?.toString(),
            publisherType: "employer",
            applicationMethod: "internal",
            status: "draft",
            scope: {},
            eligibleRoles: ["student"],
            mandatorySkills: [],
            preferredSkills: [],
            deadline: j.applicationDeadline,
          },
        },
        { upsert: true },
      );
      await services.opportunity.db
        .collection("legacy_opportunity_review")
        .updateOne(
          { _id: j._id },
          { $setOnInsert: { legacy: j, reviewStatus: "pending" } },
          { upsert: true },
        );
    }
    for (const a of applications) {
      if (a.status === "suggested") {
        await services.opportunity.db
          .collection("legacy_suggested_applications")
          .updateOne(
            { _id: a._id },
            { $setOnInsert: { legacy: a } },
            { upsert: true },
          );
        continue;
      }
      const j = jobs.find((j) => String(j._id) === String(a.job)),
        org = await services.profile.Organization.findOne({
          primaryRecruiterUserId: String(j?.company),
        }).lean();
      await services.opportunity.Application.updateOne(
        { _id: a._id },
        {
          $setOnInsert: {
            opportunityId: String(a.job),
            opportunityTitle: j?.title || "Legacy vacancy",
            applicantId: String(a.applicant),
            organizationId: org?._id?.toString(),
            status: a.status === "applied" ? "submitted" : a.status,
            history: [
              {
                status: a.status === "applied" ? "submitted" : a.status,
                at: a.updatedAt || a.createdAt,
                legacy: true,
              },
            ],
            profileSnapshot: {
              migrationReview:
                "Original submitted snapshot unavailable; current profile is not substituted.",
            },
          },
        },
        { upsert: true },
      );
    }
    for (const p of posts) {
      await services.community.Post.updateOne(
        { _id: p._id },
        {
          $setOnInsert: {
            authorId: String(p.author),
            authorName:
              users.find((u) => String(u._id) === String(p.author))?.name ||
              "Legacy member",
            body: p.content || p.body || "",
            tags: p.tags || [],
            status: "published",
          },
        },
        { upsert: true },
      );
      await services.community.db.collection("legacy_interactions").updateOne(
        { _id: p._id },
        {
          $setOnInsert: {
            comments: p.comments || [],
            reactions: p.likes || p.reactions || [],
            reviewStatus: "preserved",
          },
        },
        { upsert: true },
      );
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await source.close();
  await Promise.all(Object.values(services).map((s) => s.close()));
}
