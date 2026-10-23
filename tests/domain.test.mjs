import test from "node:test";
import assert from "node:assert/strict";
import { match } from "../services/matching-dispatch-service/src/domain.js";
import {
  completion,
  checkVisibility,
  careerSummary,
} from "../services/profile-service/src/domain.js";
import { checkTransition } from "../services/opportunity-service/src/domain.js";
import { template, assist } from "../services/cv-service/src/domain.js";
import { GmailProvider } from "../services/notification-service/src/gmail.js";
test("Mandatory eligibility cannot be outweighed by preferred skills", () => {
  const result = match(
    { role: "student", degreeProgramId: "other", skills: ["Python", "React"] },
    {
      status: "published",
      eligibleRoles: ["student"],
      scope: { degreeProgramId: "required" },
      mandatorySkills: ["Python"],
      preferredSkills: ["React"],
    },
  );
  assert.equal(result.eligibilityStatus, "ineligible");
  assert.equal(result.score, null);
});
test("No preferred criteria means eligible and unranked", () => {
  const result = match(
    { role: "student", skills: [] },
    { status: "published", eligibleRoles: ["student"], scope: {} },
  );
  assert.equal(result.eligibilityStatus, "eligible");
  assert.equal(result.score, null);
});
test("Missing private facts cannot establish employer eligibility", () => {
  const result = match(
    { role: "student", skills: ["Python"] },
    {
      status: "published",
      eligibleRoles: ["student"],
      scope: { academicYear: 2 },
    },
  );
  assert.equal(result.eligibilityStatus, "needs_profile_completion");
  assert.equal(result.mandatoryCriteria.at(-1).state, "unknown");
});
test("Discovery refusal does not prevent own matching or factual CV export", () => {
  const r = completion(
    {
      fullName: "A Student",
      membershipApproved: true,
      academicYear: 2,
      facultyId: "a",
      departmentId: "b",
      degreeProgramId: "c",
      batchId: "d",
      skills: ["Python"],
      education: [{}],
      candidateDiscovery: { enabled: false },
    },
    {
      role: "student",
      isActive: true,
      emailVerified: true,
      approvalStatus: "approved",
    },
  );
  assert.equal(r.matchingReady, true);
  assert.equal(r.cvExportReady, true);
  assert.equal(r.candidateDiscoveryReady, false);
});
test("Discovery requires the minimum explicitly visible fields", () =>
  assert.throws(
    () =>
      checkVisibility(
        {
          candidateDiscovery: { enabled: true },
          visibleCareerFields: ["fullName"],
        },
        "student",
      ),
    /name, degree, and skills/,
  ));
test("Staff visibility never uses student career fields", () => {
  const s = careerSummary(
    {
      userId: "staff",
      visibleCareerFields: [],
      visibleProfileFields: ["fullName", "designation"],
      fullName: "Lecturer",
      designation: "Lecturer",
      staffReference: "PRIVATE",
    },
    { role: "faculty" },
  );
  assert.equal(s.designation, "Lecturer");
  assert.equal(s.staffReference, undefined);
});
test("Terminal application transitions are rejected", () =>
  assert.throws(() => checkTransition("hired", "submitted"), /Cannot change/));
test("Factual CV does not infer work from skills or include private student IDs", () => {
  const document = template(
    {
      fullName: "Student",
      registrationNumber: "PRIVATE",
      education: [
        { institution: "University", qualification: "BSc", startYear: 2024 },
      ],
      skills: ["skill"],
    },
    [{ _id: "skill", label: "Python" }],
  );
  assert.deepEqual(document.experience, []);
  assert.equal(document.registrationNumber, undefined);
  assert.deepEqual(document.skills, ["Python"]);
});
test("Gemini can select only supplied career facts and never receives private contact data", async () => {
  const original = globalThis.fetch;
  const document = template(
    {
      fullName: "Synthetic learner",
      education: [
        {
          institution: "Demo University",
          qualification: "BSc",
          startYear: 2024,
        },
      ],
      skills: [],
      contactEmail: "private@demo.example",
      registrationNumber: "PRIVATE-IDENTIFIER",
    },
    [],
  );
  document.contactEmail = "private@demo.example";
  let captured;
  try {
    globalThis.fetch = async (url, options) => {
      captured = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ sentenceIndices: [0] }) }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    };
    const result = await assist(document, {
      GEMINI_API_KEY: "synthetic-test-key",
      GEMINI_MODEL: "synthetic-test-model",
    });
    assert.equal(result.mode, "gemini-assisted");
    assert.equal(result.document.summary, "BSc at Demo University.");
    assert.equal(
      JSON.stringify(captured).includes("private@demo.example"),
      false,
    );
    assert.equal(
      JSON.stringify(captured).includes("PRIVATE-IDENTIFIER"),
      false,
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ sentenceIndices: [99999] }) }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    await assert.rejects(() =>
      assist(document, {
        GEMINI_API_KEY: "synthetic-test-key",
        GEMINI_MODEL: "synthetic-test-model",
      }),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("Gmail sends one MIME recipient and treats malformed acceptance as unknown", async () => {
  const original = globalThis.fetch;
  let raw;
  try {
    globalThis.fetch = async (url, options) =>
      url.includes("oauth2")
        ? new Response(
            JSON.stringify({
              access_token: "synthetic-access-token",
              expires_in: 3600,
            }),
            { status: 200 },
          )
        : ((raw = JSON.parse(options.body).raw),
          new Response(JSON.stringify({ id: "synthetic-provider-id" }), {
            status: 200,
          }));
    const provider = new GmailProvider({
      GMAIL_SENDER: "sender@demo.example",
      GMAIL_CLIENT_ID: "synthetic-client",
      GMAIL_CLIENT_SECRET: "synthetic-secret",
      GMAIL_REFRESH_TOKEN: "synthetic-refresh",
      GMAIL_MIN_INTERVAL_MS: "0",
    });
    const sent = await provider.send({
      email: "recipient@demo.example",
      subject: "University guidance",
      body: "Synthetic notice",
      messageId: "synthetic-message",
    });
    assert.equal(sent.status, "provider_accepted");
    const mime = Buffer.from(raw, "base64url").toString();
    assert.match(mime, /To: recipient@demo\.example\r\n/);
    assert.equal((mime.match(/To:/g) || []).length, 1);
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    await assert.rejects(
      () =>
        provider.send({
          email: "recipient@demo.example",
          subject: "Demo",
          body: "Demo",
          messageId: "second",
        }),
      (error) => error.unknown === true,
    );
  } finally {
    globalThis.fetch = original;
  }
});
