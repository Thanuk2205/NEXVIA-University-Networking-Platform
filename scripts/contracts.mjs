import fs from "node:fs";
import { z, names, id, text, scopeSchema } from "@nexvia/platform-utils";
import { profileSchema } from "../services/profile-service/src/domain.js";
import {
  opportunitySchema,
  noticeSchema,
} from "../services/opportunity-service/src/domain.js";
import { documentSchema } from "../services/cv-service/src/domain.js";
import {
  postSchema,
  postApplicationSchema,
} from "../services/community-service/src/domain.js";
const catalog = {
  identity: {
    "/auth/csrf": ["get"],
    "/auth/jwks": ["get"],
    "/auth/register": ["post"],
    "/auth/login": ["post"],
    "/auth/me": ["get"],
    "/auth/refresh": ["post"],
    "/auth/logout": ["post"],
    "/auth/verify-email": ["post"],
    "/auth/resend-verification": ["post"],
    "/auth/forgot-password": ["post"],
    "/auth/reset-password": ["post"],
    "/auth/accept-invitation": ["post"],
    "/accounts/me": ["delete"],
    "/admin/accounts": ["get"],
    "/admin/accounts/{id}/verification": ["patch"],
    "/admin/accounts/{id}/status": ["patch"],
    "/admin/accounts/{id}/role": ["patch"],
    "/admin/staff-invitations": ["post"],
  },
  profile: {
    "/profiles/me": ["get", "patch"],
    "/profiles/me/completion": ["get"],
    "/profiles/{id}": ["get"],
    "/profiles/me/membership-requests": ["post"],
    "/admin/membership-requests": ["get"],
    "/admin/membership-requests/{id}/decision": ["patch"],
    "/profiles/me/graduation-requests": ["get", "post"],
    "/admin/graduation-requests": ["get", "post"],
    "/admin/graduation-requests/{id}/decision": ["patch"],
    "/faculty/graduation-requests": ["get"],
    "/faculty/graduation-requests/{id}/recommendations": ["post"],
    "/organizations": ["post"],
    "/organizations/me": ["get", "patch"],
    "/admin/organizations": ["get"],
    "/admin/organizations/{id}/approval": ["patch"],
    "/candidates/search": ["get"],
    "/candidates/{id}": ["get"],
    "/alumni": ["get"],
  },
  opportunity: {
    "/opportunities": ["get", "post"],
    "/opportunities/{id}": ["get", "patch"],
    "/opportunities/{id}/publish": ["post"],
    "/opportunities/{id}/close": ["post"],
    "/opportunities/{id}/applications": ["get", "post"],
    "/applications/me": ["get"],
    "/applications/{id}/status": ["patch"],
    "/applications/{id}/withdraw": ["post"],
    "/academic-notices": ["get", "post"],
    "/academic-notices/{id}": ["get", "patch"],
    "/academic-notices/{id}/publish": ["post"],
    "/academic-notices/{id}/archive": ["post"],
  },
  matching: {
    "/recommendations/me": ["get"],
    "/opportunities/{id}/candidates": ["get"],
    "/match-runs/{id}": ["get"],
    "/dispatches/preview": ["post"],
    "/dispatches": ["get", "post"],
    "/dispatches/{id}": ["get"],
    "/dispatches/{id}/cancel": ["post"],
  },
  community: {
    "/posts": ["get", "post"],
    "/posts/{id}": ["patch", "delete"],
    "/posts/{id}/close": ["post"],
    "/posts/{id}/applications": ["post"],
    "/post-cv-uploads": ["post"],
    "/post-applications": ["get"],
    "/post-applications/{id}/cv": ["get"],
    "/post-applications/{id}/status": ["patch"],
    "/post-applications/{id}/withdraw": ["post"],
    "/posts/{id}/reports": ["post"],
    "/admin/reports": ["get"],
    "/admin/moderation-actions": ["post"],
  },
  notification: {
    "/admin/delivery-jobs": ["get"],
    "/admin/delivery-jobs/{id}/reconcile": ["post"],
    "/notifications": ["get"],
    "/notifications/{id}/read": ["patch"],
    "/notifications/read-all": ["post"],
    "/notifications/delivery/me": ["get"],
    "/notification-preferences": ["get", "patch"],
  },
  cv: {
    "/cv/generations": ["post"],
    "/cv/generations/{id}": ["get"],
    "/cv/documents": ["get"],
    "/cv/documents/{id}": ["get", "patch"],
    "/cv/documents/{id}/pdf": ["get"],
    "/cv/documents/{id}/revisions": ["get"],
  },
};
for (const kind of [
  "faculties",
  "departments",
  "degrees",
  "batches",
  "skills",
]) {
  catalog.profile[`/academic/${kind}`] = ["get"];
  catalog.profile[`/admin/academic/${kind}`] = ["post"];
  catalog.profile[`/admin/academic/${kind}/{id}`] = ["patch"];
}
const schemas = {
  PostInput: z.toJSONSchema(postSchema),
  PostApplicationInput: z.toJSONSchema(postApplicationSchema),
  PostApplicationStatusInput: z.toJSONSchema(
    z
      .object({
        status: z.enum(["reviewing", "forwarded", "declined"]),
        reason: text(1000, 3),
      })
      .strict(),
  ),
  LoginInput: z.toJSONSchema(
    z
      .object({
        email: z.email().max(254),
        password: z.string().min(1).max(128),
      })
      .strict(),
  ),
  RegistrationInput: z.toJSONSchema(
    z
      .object({
        email: z.email().max(254),
        password: z.string().min(12).max(128),
        fullName: text(120, 2),
        role: z.enum(["student", "alumni", "employer"]),
      })
      .strict(),
  ),
  TokenInput: z.toJSONSchema(
    z.object({ token: z.string().regex(/^[a-f\d]{64}$/) }).strict(),
  ),
  ResetPasswordInput: z.toJSONSchema(
    z
      .object({
        token: z.string().regex(/^[a-f\d]{64}$/),
        password: z.string().min(12).max(128),
      })
      .strict(),
  ),
  CvGenerationInput: z.toJSONSchema(
    z
      .object({
        aiConsent: z.boolean(),
        includeContactEmail: z.boolean(),
      })
      .strict(),
  ),
  CvReviewInput: z.toJSONSchema(
    z.object({ content: documentSchema, reviewed: z.literal(true) }).strict(),
  ),
  ApplicationInput: z.toJSONSchema(
    z
      .object({
        consent: z.literal(true),
        opportunityRevision: z.number().int().min(1),
        cvDocumentId: id.optional(),
      })
      .strict(),
  ),
  DispatchPreviewInput: z.toJSONSchema(
    z
      .object({
        contentType: z.enum(["academic_notice", "opportunity"]),
        contentId: id,
        criteria: scopeSchema,
        universityWide: z.boolean().default(false),
      })
      .strict(),
  ),
  DispatchConfirmInput: z.toJSONSchema(z.object({ previewId: id }).strict()),
  OpportunityInput: z.toJSONSchema(opportunitySchema),
  AcademicNoticeInput: z.toJSONSchema(noticeSchema),
  CvDocument: z.toJSONSchema(documentSchema),
  ...Object.fromEntries(
    ["student", "alumni", "employer", "faculty", "admin"].map((role) => [
      `${role}ProfileInput`,
      z.toJSONSchema(profileSchema(role)),
    ]),
  ),
};
const all = {};
fs.mkdirSync("packages/contracts/openapi", { recursive: true });
for (const name of names) {
  const paths = {};
  for (const [route, methods] of Object.entries({
    ...catalog[name],
    [`/operations/${name}/outbox`]: ["get"],
    [`/operations/${name}/outbox/{id}/retry`]: ["post"],
    [`/operations/${name}/audit`]: ["get"],
  })) {
    const path = `/api/v1${route}`;
    paths[path] = {};
    for (const method of methods) {
      const publicAuth =
        route.startsWith("/auth/") &&
        !["/auth/me", "/auth/logout", "/auth/resend-verification"].includes(
          route,
        );
      const operation = {
        operationId: `${name}_${method}_${route.replaceAll(/[^a-z0-9]/gi, "_")}`,
        tags: [name],
        summary: `${method.toUpperCase()} ${route}`,
        description:
          "Permissions, field visibility, readiness and lifecycle rules are enforced by the owning service. See the implementation plan and domain schemas.",
        security: publicAuth ? [] : [{ cookieAuth: [] }],
        parameters: [
          ...(route.match(/\{\w+\}/g) || []).map((p) => ({
            name: p.slice(1, -1),
            in: "path",
            required: true,
            schema: { type: "string", pattern: "^[a-f0-9]{24}$" },
          })),
          ...(method === "get"
            ? [
                {
                  name: "limit",
                  in: "query",
                  schema: {
                    type: "integer",
                    minimum: 1,
                    maximum: route.startsWith("/candidates") ? 50 : 100,
                    default: 20,
                  },
                },
                { name: "cursor", in: "query", schema: { type: "string" } },
              ]
            : [
                {
                  name: "X-CSRF-Token",
                  in: "header",
                  required: true,
                  schema: { type: "string" },
                },
                {
                  name: "Idempotency-Key",
                  in: "header",
                  required:
                    ["publish", "/dispatches", "/cv/generations"].some((v) =>
                      route.endsWith(v),
                    ) || route.endsWith("/applications"),
                  schema: { type: "string", minLength: 8, maxLength: 128 },
                },
                {
                  name: "If-Match",
                  in: "header",
                  required:
                    method === "patch" &&
                    [
                      "/posts/{id}",
                      "/opportunities/{id}",
                      "/academic-notices/{id}",
                      "/cv/documents/{id}",
                      "/profiles/me",
                    ].includes(route),
                  schema: { type: "string" },
                },
              ]),
        ],
        responses: {
          200: {
            description:
              "Successful owner-authorized result; JSON uses { data, meta }.",
          },
          201: { description: "Resource created." },
          202: {
            description:
              "Durable job queued; stable ID and status URL returned.",
          },
          400: { description: "Invalid input." },
          401: { description: "Authentication required or session revoked." },
          403: { description: "Role, scope, verification or consent denied." },
          404: { description: "Resource unavailable to this actor." },
          409: { description: "Lifecycle, duplicate or idempotency conflict." },
          412: { description: "Stale revision." },
          429: { description: "Rate limit exceeded." },
          503: { description: "Required dependency unavailable." },
        },
      };
      if (["post", "patch"].includes(method)) {
        let ref = ["/opportunities", "/opportunities/{id}"].includes(route)
          ? "OpportunityInput"
          : ["/academic-notices", "/academic-notices/{id}"].includes(route)
            ? "AcademicNoticeInput"
            : null;
        ref ||= {
          "/posts": "PostInput",
          "/posts/{id}": "PostInput",
          "/posts/{id}/applications": "PostApplicationInput",
          "/post-applications/{id}/status": "PostApplicationStatusInput",
          "/auth/login": "LoginInput",
          "/auth/register": "RegistrationInput",
          "/auth/verify-email": "TokenInput",
          "/auth/reset-password": "ResetPasswordInput",
          "/cv/generations": "CvGenerationInput",
          "/cv/documents/{id}": "CvReviewInput",
          "/opportunities/{id}/applications": "ApplicationInput",
          "/dispatches/preview": "DispatchPreviewInput",
          "/dispatches": "DispatchConfirmInput",
        }[route];
        operation.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: ref
                ? { $ref: `#/components/schemas/${ref}` }
                : {
                    type: "object",
                    description:
                      "See the owner route validation and role-specific schema. Unknown writable fields are rejected.",
                  },
            },
          },
        };
      }
      paths[path][method] = operation;
      if (route === "/profiles/me" && method === "patch")
        operation.requestBody.content["application/json"].schema = {
          anyOf: ["student", "alumni", "employer", "faculty", "admin"].map(
            (role) => ({ $ref: `#/components/schemas/${role}ProfileInput` }),
          ),
        };
      if (
        route === "/cv/documents/{id}/pdf" ||
        route === "/post-applications/{id}/cv"
      )
        operation.responses[200].content = {
          "application/pdf": { schema: { type: "string", format: "binary" } },
        };
      if (route === "/post-cv-uploads") {
        operation.description =
          "Upload an existing PDF CV, up to 2 MiB, owned by the student/alumni. Unsubmitted files expire after one hour; at most five unused uploads are allowed. Use a stable Idempotency-Key for retries.";
        operation.parameters.push({
          name: "X-CV-Filename",
          in: "header",
          required: false,
          schema: { type: "string" },
          description:
            "URI-encoded PDF filename without folder paths. Defaults to CV.pdf.",
        });
        operation.requestBody = {
          required: true,
          content: {
            "application/pdf": { schema: { type: "string", format: "binary" } },
          },
        };
        operation.responses[413] = {
          description: "PDF upload exceeds the 2 MiB limit.",
        };
      }
      if (route === "/posts" && method === "get")
        operation.parameters.push({
          name: "type",
          in: "query",
          schema: {
            type: "string",
            enum: ["all", "job", "update"],
            default: "all",
          },
        });
      if (route === "/post-applications")
        operation.parameters.push({
          name: "view",
          in: "query",
          schema: {
            type: "string",
            enum: ["sent", "received"],
            default: "sent",
          },
        });
      if (
        ["/posts/{id}/close", "/post-applications/{id}/withdraw"].includes(
          route,
        )
      ) {
        delete operation.responses[201];
        operation.responses[200] = { description: "Updated owned resource." };
      }
    }
    all[path] = { ...all[path], ...paths[path] };
  }
  const spec = {
    openapi: "3.1.0",
    info: { title: `Nexvia ${name}`, version: "1.0.0" },
    servers: [{ url: "http://localhost:5000" }],
    paths,
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "nx_access" },
      },
      schemas,
    },
  };
  fs.writeFileSync(
    `packages/contracts/openapi/${name}.json`,
    JSON.stringify(spec, null, 2) + "\n",
  );
}
fs.writeFileSync(
  "packages/contracts/openapi/gateway.json",
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: { title: "Nexvia API", version: "1.0.0" },
      paths: all,
      components: {
        securitySchemes: {
          cookieAuth: { type: "apiKey", in: "cookie", name: "nx_access" },
        },
        schemas,
      },
    },
    null,
    2,
  ) + "\n",
);
const eventTypes = [
  "AccountRegistered",
  "AccountEligibilityChanged",
  "VerificationEmailRequested",
  "PasswordResetRequested",
  "AccountDeletionRequested",
  "GraduationVerified",
  "GraduationRoleChanged",
  "ProfileMatchingChanged",
  "OrganizationApprovalChanged",
  "OpportunityPublished",
  "OpportunityUpdated",
  "OpportunityClosed",
  "AcademicNoticePublished",
  "AcademicNoticeUpdated",
  "AcademicNoticeArchived",
  "DispatchNotificationRequested",
  "ApplicationStatusChanged",
  "CvGenerationCompleted",
  "PostApplicationSubmitted",
  "PostApplicationStatusChanged",
];
fs.writeFileSync(
  "packages/contracts/events.json",
  JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: [
        "eventId",
        "source",
        "type",
        "aggregateId",
        "revision",
        "data",
      ],
      properties: {
        eventId: { type: "string", format: "uuid" },
        source: { enum: names },
        type: { enum: eventTypes.map((t) => `${t}.v1`) },
        aggregateId: { type: "string" },
        revision: { type: "integer", minimum: 1 },
        data: {
          type: "object",
          description:
            "Contract-specific minimal data; recovery/verification events carry only an opaque handle, never token material.",
        },
      },
    },
    null,
    2,
  ) + "\n",
);
console.log("Per-service and assembled OpenAPI contracts generated.");
