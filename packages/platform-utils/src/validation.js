import { z } from "zod";
export { z };
export const id = z.string().regex(/^[a-f\d]{24}$/i, "Invalid resource ID");
export const text = (max, min = 0) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
      "Control characters are not allowed",
    );
export const url = text(2000).refine((v) => {
  try {
    const u = new URL(v);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  } catch {
    return false;
  }
}, "Use an HTTP(S) URL");
export const scopeSchema = z
  .object({
    facultyId: id.optional(),
    departmentId: id.optional(),
    degreeProgramId: id.optional(),
    batchId: id.optional(),
    academicYear: z.number().int().min(1).max(10).optional(),
  })
  .strict();
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new HttpError(
      400,
      "VALIDATION",
      "Please check the supplied fields.",
      result.error.issues.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    );
  return result.data;
}
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}
export const fail = (status, code, message) => {
  throw new HttpError(status, code, message);
};
export function assertScope(actor, requested = {}) {
  if (actor.role === "admin") return requested;
  if (
    actor.role !== "faculty" ||
    !Object.keys(actor.approvedAcademicScope || {}).length
  )
    fail(403, "SCOPE", "An approved academic scope is required.");
  for (const [key, value] of Object.entries(actor.approvedAcademicScope))
    if (requested[key] !== undefined && requested[key] !== value)
      fail(403, "SCOPE", "The requested audience exceeds your academic scope.");
  return { ...requested, ...actor.approvedAcademicScope };
}
export const withinScope = (scope, profile) =>
  Object.entries(scope || {}).every(
    ([k, v]) => String(profile[k]) === String(v),
  );
