import { z, text, id } from "@nexvia/platform-utils";

export const jobSchema = z
  .object({
    title: text(160, 3),
    company: text(160, 2),
    location: text(160).optional(),
    employmentType: z.enum([
      "internship",
      "full-time",
      "part-time",
      "contract",
    ]),
    deadline: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export const postSchema = z
  .object({
    body: text(5000, 1),
    tags: z.array(text(30, 1)).max(5).default([]),
    opportunityId: id.optional(),
    postType: z.enum(["update", "job"]).default("update"),
    job: jobSchema.optional(),
  })
  .strict()
  .refine(
    (v) => (v.postType === "job" ? !!v.job : !v.job),
    "Job referrals require job details; updates must not include job details.",
  );

export const postApplicationSchema = z
  .object({
    postRevision: z.number().int().min(1),
    cvUploadId: id,
    consent: z.literal(true),
    message: text(2000).default(""),
    contactEmail: z.email().max(254).optional(),
  })
  .strict();

export const referralTransitions = {
  submitted: ["reviewing", "forwarded", "declined"],
  reviewing: ["forwarded", "declined"],
  forwarded: [],
  declined: [],
  withdrawn: [],
};

export function acceptsApplications(post) {
  return (
    post.status === "published" &&
    post.postType === "job" &&
    post.jobStatus === "open" &&
    (!post.job?.deadline || new Date(post.job.deadline) > new Date())
  );
}
