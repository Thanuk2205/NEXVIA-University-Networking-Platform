import { z, id, text, url, validate, fail } from "@nexvia/platform-utils";
const common = ["fullName", "headline", "bio", "location", "professionalLinks"];
export const careerFields = [
  ...common,
  "facultyId",
  "departmentId",
  "degreeProgramId",
  "batchId",
  "academicYear",
  "careerInterests",
  "skills",
  "education",
  "projects",
  "experience",
  "certifications",
  "achievements",
];
export function visibleFields(role) {
  return role === "student"
    ? careerFields
    : role === "alumni"
      ? [
          ...careerFields.filter((v) => v !== "academicYear"),
          "graduationYear",
          "currentJobTitle",
          "currentOrganization",
          "employmentStatus",
        ]
      : [
          ...common,
          ...(role === "employer"
            ? ["organizationDescription", "recruiterJobTitle"]
            : ["designation", "officeContactUrl"]),
        ];
}
const today = () => new Date().toISOString().slice(0, 10);
const actualDate = z.iso
  .date()
  .refine((v) => v <= today(), "Future dates are not allowed.");
const education = z
  .object({
    institution: text(200, 2),
    qualification: text(200, 2),
    startYear: z.number().int().min(1900).max(new Date().getUTCFullYear()),
    endYear: z
      .number()
      .int()
      .max(new Date().getUTCFullYear() + 10)
      .nullable()
      .optional(),
    isCurrent: z.boolean().optional(),
    description: text(1000).optional(),
  })
  .strict()
  .refine(
    (v) => v.endYear == null || v.endYear >= v.startYear,
    "End year must follow start year.",
  );
const experience = z
  .object({
    title: text(120, 2),
    organization: text(200, 2),
    startDate: actualDate,
    endDate: actualDate.nullable().optional(),
    isCurrent: z.boolean().optional(),
    description: text(2000).optional(),
  })
  .strict()
  .refine(
    (v) =>
      (!v.endDate || v.endDate >= v.startDate) && (!v.isCurrent || !v.endDate),
    "Check the experience dates.",
  );
const career = {
  registrationNumber: text(50, 3).optional(),
  facultyId: id.optional(),
  departmentId: id.optional(),
  degreeProgramId: id.optional(),
  batchId: id.optional(),
  academicYear: z.number().int().min(1).max(10).optional(),
  careerInterests: z.array(text(100, 1)).max(5).optional(),
  skills: z
    .array(id)
    .max(50)
    .refine((v) => new Set(v).size === v.length, "Remove duplicate skills.")
    .optional(),
  education: z.array(education).max(10).optional(),
  projects: z
    .array(
      z
        .object({
          title: text(200, 2),
          description: text(2000, 1),
          skillIds: z.array(id).max(20).optional(),
          url: url.optional(),
        })
        .strict(),
    )
    .max(20)
    .optional(),
  experience: z.array(experience).max(20).optional(),
  certifications: z
    .array(
      z
        .object({
          name: text(200, 2),
          issuer: text(200, 2),
          issuedDate: actualDate,
          expiresDate: z.iso.date().optional(),
          credentialUrl: url.optional(),
        })
        .strict()
        .refine(
          (v) => !v.expiresDate || v.expiresDate >= v.issuedDate,
          "Expiry must follow issue date.",
        ),
    )
    .max(25)
    .optional(),
  achievements: z
    .array(
      z
        .object({
          title: text(200, 2),
          kind: z.enum([
            "academic_award",
            "competition",
            "publication",
            "other",
          ]),
          issuer: text(200).optional(),
          date: actualDate.optional(),
          description: text(1000).optional(),
        })
        .strict(),
    )
    .max(25)
    .optional(),
  visibleCareerFields: z.array(z.string()).max(30).optional(),
  candidateDiscovery: z.object({ enabled: z.boolean() }).strict().optional(),
};
export function profileSchema(role) {
  return z
    .object({
      fullName: text(120, 2).optional(),
      headline: text(120).optional(),
      bio: text(1000).optional(),
      location: z
        .object({
          city: text(100).optional(),
          countryCode: z
            .string()
            .regex(/^[A-Z]{2}$/)
            .optional(),
        })
        .strict()
        .optional(),
      professionalLinks: z
        .array(z.object({ label: text(40, 1), url }).strict())
        .max(5)
        .optional(),
      profileVisibility: z.enum(["owner", "university"]).optional(),
      ...(["student", "alumni"].includes(role)
        ? career
        : { visibleProfileFields: z.array(z.string()).max(20).optional() }),
      ...(role === "alumni"
        ? {
            currentJobTitle: text(120).optional(),
            currentOrganization: text(200).optional(),
            employmentStatus: z
              .enum(["employed", "seeking_work", "further_study", "other"])
              .optional(),
            alumniDirectory: z
              .object({ enabled: z.boolean() })
              .strict()
              .optional(),
            mentoringOptIn: z.boolean().optional(),
          }
        : {}),
      ...(role === "employer"
        ? {
            recruiterJobTitle: text(120).optional(),
            organizationDescription: text(2000).optional(),
          }
        : {}),
      ...(["faculty", "admin"].includes(role)
        ? {
            staffReference: text(50, 3).optional(),
            designation: text(120, 2).optional(),
            officeContactUrl: url.optional(),
          }
        : {}),
    })
    .strict();
}
export function checkVisibility(profile, role) {
  const allowed = visibleFields(role),
    fields =
      (["student", "alumni"].includes(role)
        ? profile.visibleCareerFields
        : profile.visibleProfileFields) || [];
  if (
    fields.some((v) => !allowed.includes(v)) ||
    new Set(fields).size !== fields.length
  )
    fail(
      400,
      "VISIBILITY_FIELDS",
      "Select valid, unique fields for your role.",
    );
  if (
    profile.candidateDiscovery?.enabled &&
    ["fullName", "degreeProgramId", "skills"].some((k) => !fields.includes(k))
  )
    fail(
      400,
      "DISCOVERY_FIELDS",
      "Candidate discovery requires visible name, degree, and skills.",
    );
  if (
    profile.alumniDirectory?.enabled &&
    (profile.profileVisibility !== "university" ||
      ["fullName", "degreeProgramId", "graduationYear"].some(
        (k) => !fields.includes(k),
      ))
  )
    fail(
      400,
      "DIRECTORY_FIELDS",
      "The directory requires university visibility and visible name, degree, and graduation year.",
    );
}
export function completion(profile, actor) {
  const requirements = [];
  const add = (field, ok, message) => {
    requirements.push({
      field,
      state: ok ? "completed" : "missing",
      message,
      editTarget: "/profile",
    });
    return !!ok;
  };
  const active =
    actor.isActive &&
    actor.emailVerified &&
    actor.approvalStatus === "approved";
  const approved = add(
    "accountApproval",
    active,
    "Verify email and obtain institutional approval.",
  );
  const name = add(
    "fullName",
    profile.fullName?.length >= 2,
    "Add your full name.",
  );
  const learner = ["student", "alumni"].includes(actor.role);
  let academic = false,
    skills = false,
    edu = false;
  if (learner) {
    academic = add(
      "academicMembership",
      actor.role === "alumni"
        ? profile.graduationStatus === "verified" && profile.graduationYear
        : profile.membershipApproved &&
            profile.academicYear &&
            ["facultyId", "departmentId", "degreeProgramId", "batchId"].every(
              (k) => profile[k],
            ),
      "Submit your academic details for approval.",
    );
    skills = add(
      "skills",
      profile.skills?.length > 0,
      "Add at least one career skill.",
    );
    edu = add(
      "education",
      profile.education?.length > 0,
      "Add factual education details for a CV.",
    );
  }
  const matchingReady = !!(learner && approved && name && academic && skills);
  const cvExportReady = !!(learner && approved && name && edu);
  const fields = profile.visibleCareerFields || [];
  return {
    profileVersion: profile.profileVersion,
    matchingReady,
    candidateDiscoveryReady: !!(
      matchingReady &&
      profile.candidateDiscovery?.enabled &&
      ["fullName", "degreeProgramId", "skills"].every((k) => fields.includes(k))
    ),
    cvExportReady,
    aiAssistanceReady: cvExportReady,
    requirements,
  };
}
export function careerSummary(profile, actor, network = false) {
  const fields =
    (["student", "alumni"].includes(actor.role)
      ? profile.visibleCareerFields
      : profile.visibleProfileFields) || [];
  const out = {
    userId: profile.userId,
    role: actor.role,
    profileVersion: profile.profileVersion,
  };
  for (const field of fields)
    if (
      visibleFields(actor.role).includes(field) &&
      profile[field] !== undefined
    )
      out[field] = profile[field];
  if (network && actor.role === "alumni")
    out.mentoringOptIn = !!profile.mentoringOptIn;
  return out;
}
