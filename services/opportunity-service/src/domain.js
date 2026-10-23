import { z, id, text, url, scopeSchema, fail } from "@nexvia/platform-utils";
export const opportunitySchema = z
  .object({
    title: text(200, 5),
    description: text(5000, 1),
    kind: z.enum(["internship", "job", "academic", "career", "event"]),
    employmentType: z
      .enum(["internship", "full-time", "part-time", "contract"])
      .optional(),
    location: text(200).optional(),
    applicationMethod: z.enum(["internal", "external", "none"]),
    applicationUrl: url.optional(),
    deadline: z.iso.datetime({ offset: true }).optional(),
    scope: scopeSchema.default({}),
    eligibleRoles: z
      .array(z.enum(["student", "alumni"]))
      .min(1)
      .max(2)
      .default(["student"]),
    mandatorySkills: z.array(id).max(20).default([]),
    skillMode: z.enum(["all", "any"]).default("all"),
    preferredSkills: z.array(id).max(20).default([]),
    preferredDegrees: z.array(id).max(20).default([]),
    preferredAchievementKinds: z
      .array(z.enum(["academic_award", "competition", "publication", "other"]))
      .max(4)
      .default([]),
  })
  .strict()
  .refine(
    (v) => v.applicationMethod !== "external" || !!v.applicationUrl,
    "External applications require a URL.",
  );
export const noticeSchema = z
  .object({
    title: text(200, 5),
    body: text(5000, 1),
    category: z.enum(["academic", "career", "event", "deadline", "general"]),
    scope: scopeSchema,
    relatedOpportunityId: id.optional(),
    referenceUrl: url.optional(),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export const transitions = {
  submitted: ["shortlisted", "rejected", "withdrawn"],
  shortlisted: ["hired", "rejected", "withdrawn"],
  hired: [],
  rejected: [],
  withdrawn: [],
};
export function checkTransition(from, to) {
  if (!transitions[from]?.includes(to))
    fail(409, "APPLICATION_TRANSITION", `Cannot change ${from} to ${to}.`);
}
export function actionable(o) {
  return (
    o.status === "published" &&
    (!o.deadline || new Date(o.deadline) > new Date())
  );
}
