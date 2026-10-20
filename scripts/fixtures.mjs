import { hashPassword } from "../services/identity-service/src/passwords.js";
import crypto from "node:crypto";
export async function seedFixtures(services, password) {
  const { identity, profile, opportunity } = services;
  const passwordHash = await hashPassword(password);
  const users = {};
  const labels = [
    ["faculties", "Demo Faculty"],
    ["departments", "Demo Department"],
    ["degrees", "Demo IT Degree"],
    ["batches", "Demo 2026 Cohort"],
  ];
  const ids = {};
  let parentId;
  for (const [kind, label] of labels) {
    const row = await profile.Taxonomy.findOneAndUpdate(
      { kind, label },
      {
        $setOnInsert: {
          kind,
          label,
          parentId,
          yearCount: kind === "degrees" ? 4 : undefined,
        },
      },
      { new: true, upsert: true },
    );
    parentId = String(row._id);
    ids[
      {
        faculties: "facultyId",
        departments: "departmentId",
        degrees: "degreeProgramId",
        batches: "batchId",
      }[kind]
    ] = parentId;
  }
  const skills = [];
  for (const label of ["Python", "React", "Node.js"]) {
    const skill = await profile.Taxonomy.findOneAndUpdate(
      { kind: "skills", label },
      { $setOnInsert: { kind: "skills", label } },
      { new: true, upsert: true },
    );
    skills.push(String(skill._id));
  }
  for (const role of ["admin", "faculty", "student", "alumni", "employer"]) {
    let a = await identity.Account.findOne({ email: `${role}@demo.example` });
    if (!a)
      a = await identity.Account.create({
        email: `${role}@demo.example`,
        passwordHash,
        role,
        emailVerified: true,
        approvalStatus: "approved",
        approvedAcademicScope:
          role === "faculty" ? { departmentId: ids.departmentId } : undefined,
      });
    users[role] = a;
    await profile.Profile.updateOne(
      { userId: String(a._id) },
      {
        $setOnInsert: {
          userId: String(a._id),
          fullName: `Demo ${role}`,
          profileVisibility: "university",
          visibleCareerFields: [
            "fullName",
            "degreeProgramId",
            "skills",
            "graduationYear",
            "academicYear",
          ].filter((f) =>
            role === "student" ? f !== "graduationYear" : f !== "academicYear",
          ),
          candidateDiscovery: { enabled: ["student", "alumni"].includes(role) },
          ...(["student", "alumni"].includes(role)
            ? {
                ...ids,
                registrationNumber: `DEMO-${role}`,
                academicYear: 2,
                membershipApproved: true,
                skills,
                education: [
                  {
                    institution: "Demo University",
                    qualification: "BSc Information Technology",
                    startYear: 2024,
                    isCurrent: role === "student",
                  },
                ],
                ...(role === "alumni"
                  ? {
                      graduationYear: 2026,
                      graduationStatus: "verified",
                      alumniDirectory: { enabled: true },
                      mentoringOptIn: true,
                      academicStatus: "graduated",
                    }
                  : {}),
              }
            : { staffReference: `DEMO-${role}`, designation: `Demo ${role}` }),
        },
      },
      { upsert: true },
    );
  }
  const organization = await profile.Organization.findOneAndUpdate(
    { primaryRecruiterUserId: String(users.employer._id) },
    {
      $setOnInsert: {
        primaryRecruiterUserId: String(users.employer._id),
        organizationName: "Demo Technology Company",
        organizationApprovalStatus: "approved",
      },
    },
    { upsert: true, new: true },
  );
  const vacancy = await opportunity.Opportunity.findOneAndUpdate(
    { title: "Demo software internship" },
    {
      $setOnInsert: {
        title: "Demo software internship",
        description:
          "A synthetic internship for demonstrating Nexvia workflows.",
        kind: "internship",
        applicationMethod: "internal",
        scope: { degreeProgramId: ids.degreeProgramId },
        eligibleRoles: ["student", "alumni"],
        mandatorySkills: [skills[0]],
        skillMode: "all",
        preferredSkills: [skills[1]],
        publisherType: "employer",
        organizationId: String(organization._id),
        organizationName: organization.organizationName,
        createdByUserId: String(users.employer._id),
        status: "published",
        publishedAt: new Date(),
        deadline: new Date(Date.now() + 30 * 86400000),
      },
    },
    { upsert: true, new: true },
  );
  if (
    !(await services.opportunity.Outbox.exists({
      aggregateId: String(vacancy._id),
      type: "OpportunityPublished.v1",
    }))
  )
    await services.opportunity.transaction((session) =>
      services.opportunity.emit(
        session,
        "matching",
        "OpportunityPublished.v1",
        vacancy._id,
        vacancy.revision,
        { opportunityId: String(vacancy._id) },
      ),
    );
  if (services.community) {
    for (const role of ["student", "alumni", "employer", "faculty", "admin"]) {
      const referral = role !== "admin";
      await services.community.Post.updateOne(
        {
          _id: crypto
            .createHash("sha256")
            .update(`nexvia-demo-feed-${role}`)
            .digest("hex")
            .slice(0, 24),
        },
        {
          $setOnInsert: {
            authorId: String(users[role]._id),
            authorName: `Demo ${role}`,
            authorRole: role,
            body: {
              student:
                "I found a software internship that could be useful to our batch. Share your CV if you would like help with a referral.",
              alumni:
                "Our alumni network is a good place to start your career. I know of a junior developer opening and can help introduce suitable applicants.",
              employer:
                "We are meeting early-career developers. Share your CV here to express interest, or explore our official vacancies in Opportunities.",
              faculty:
                "Sharing a graduate trainee opportunity with our university community. I can help forward suitable CVs to the contact.",
              admin:
                "Welcome to your Nexvia network. Students, alumni, employers and faculty can share updates and job referrals here. Be thoughtful about the information you choose to share.",
            }[role],
            tags: ["demo", referral ? "careers" : "community"],
            postType: referral ? "job" : "update",
            ...(referral
              ? {
                  jobStatus: "open",
                  job: {
                    title: {
                      student: "Software engineering internship",
                      alumni: "Junior developer referral",
                      employer: "Early-career developer opportunity",
                      faculty: "Graduate trainee referral",
                    }[role],
                    company: "Demo Technology Company",
                    location: "Colombo / Hybrid",
                    employmentType:
                      role === "student" ? "internship" : "full-time",
                  },
                }
              : {}),
          },
        },
        { upsert: true },
      );
    }
  }
  return { users, ids, skills, organization, vacancy };
}
