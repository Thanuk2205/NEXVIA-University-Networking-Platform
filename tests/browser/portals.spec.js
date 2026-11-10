import { test, expect } from "@playwright/test";
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
const password = "SyntheticTestPassword123!";

test("Feed explains missing Apply controls without mislabelling an outdated backend as closed", async ({
  page,
}) => {
  await login(page, "student");
  const own = page.getByRole("article", {
    name: "Post by Demo student",
    exact: true,
  });
  await expect(
    own.getByText(
      "You shared this referral. Other students and alumni can apply to it.",
      { exact: true },
    ),
  ).toBeVisible();
  const referral = page
    .getByRole("article", { name: "Post by Demo alumni", exact: true })
    .filter({
      has: page.getByRole("heading", {
        name: "Junior developer referral",
        exact: true,
      }),
    });
  await expect(
    referral.getByText("Apply with a PDF CV", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/v1/posts?type=all", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    for (const post of json.data.items) delete post.acceptingApplications;
    await route.fulfill({ response, json });
  });
  await page.getByRole("button", { name: "Refresh feed", exact: true }).click();
  await expect(
    referral.getByText(
      "Application status is currently unavailable. Refresh the feed or try again shortly.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    referral.getByText("Applications closed", { exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/posts?type=all");
  await page.context().clearCookies();
  await login(page, "faculty");
  const studentPost = page.getByRole("article", {
    name: "Post by Demo student",
    exact: true,
  });
  await expect(
    studentPost.getByText(
      "Applications are available to student and alumni accounts.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("Alumni job post accepts a private PDF application, author review and withdrawal", async ({
  page,
  browser,
  baseURL,
}) => {
  const authorContext = await browser.newContext({ baseURL });
  const author = await authorContext.newPage();
  try {
    await login(author, "alumni");
    await author.getByLabel("Post type", { exact: true }).selectOption("job");
    const title = `Browser referral ${Date.now()}`;
    await author
      .getByLabel("Post", { exact: true })
      .fill("I can help with introductions for this synthetic opportunity.");
    await author.getByLabel("Job title", { exact: true }).fill(title);
    await author
      .getByLabel("Company", { exact: true })
      .fill("Synthetic Browser Company");
    await author
      .getByRole("button", { name: "Publish post", exact: true })
      .click();
    await expect(
      author.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await login(page, "student");
    const post = page
      .getByRole("article", { name: "Post by Demo alumni", exact: true })
      .filter({ hasText: title });
    await post.getByText("Apply with a PDF CV", { exact: true }).click();
    const buffer = await new Promise((resolve) => {
      const document = new PDFDocument(),
        chunks = [];
      document.on("data", (value) => chunks.push(value));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.text("Synthetic browser CV; no personal data.");
      document.end();
    });
    const cvPath = test.info().outputPath("browser-cv.pdf");
    fs.mkdirSync(path.dirname(cvPath), { recursive: true });
    fs.writeFileSync(cvPath, buffer);
    await post.getByLabel("PDF CV", { exact: true }).setInputFiles(cvPath);
    await post
      .getByLabel("Message to the post author (optional)", { exact: true })
      .fill("I would appreciate a referral for this role.");
    await post.getByRole("checkbox").check();
    await post
      .getByRole("button", { name: "Send application", exact: true })
      .click();
    await expect(post.getByText("submitted", { exact: true })).toBeVisible();
    await author
      .getByRole("link", { name: "Post applications", exact: true })
      .click();
    const received = author.getByRole("article").filter({
      has: author.getByRole("heading", { name: title, exact: true }),
    });
    await expect(
      received.getByText("I would appreciate a referral for this role.", {
        exact: true,
      }),
    ).toBeVisible();
    const download = author.waitForEvent("download");
    await received
      .getByRole("button", { name: "Download submitted CV", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe("browser-cv.pdf");
    await received
      .getByLabel("Next status for Demo student", { exact: true })
      .selectOption("reviewing");
    await received
      .getByLabel("Review note for Demo student", { exact: true })
      .fill("I am reviewing your details for an introduction.");
    await received
      .getByRole("button", { name: "Update application", exact: true })
      .click();
    await expect(received.locator(".badge")).toHaveText("reviewing");
    await page
      .getByRole("link", { name: "My applications", exact: true })
      .click();
    const sent = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(sent.locator(".badge")).toHaveText("reviewing");
    await sent
      .getByRole("button", {
        name: "Withdraw referral application",
        exact: true,
      })
      .click();
    await expect(sent.locator(".badge")).toHaveText("withdrawn");
    await author.reload();
    await expect(
      received.getByRole("button", {
        name: "Download submitted CV",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Network feed", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Junior developer referral",
        exact: true,
      }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/network-feed-mobile.png",
      fullPage: true,
    });
    await author.goto("/dashboard");
    await expect(
      author.getByRole("heading", {
        name: "Junior developer referral",
        exact: true,
      }),
    ).toBeVisible();
    await author.screenshot({
      path: "test-results/network-feed-desktop.png",
      fullPage: true,
    });
  } finally {
    await authorContext.close();
  }
});
async function login(page, role) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@demo.example`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Welcome, Demo/ }),
  ).toBeVisible();
}
test("Student profile, factual CV review, PDF download and responsive navigation", async ({
  page,
}) => {
  await login(page, "student");
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your profile", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Bio (optional)", { exact: true })
    .fill("Building my first factual professional profile.");
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved successfully." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Bio (optional)", { exact: true })).toHaveValue(
    "Building my first factual professional profile.",
  );
  let refreshes = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/auth/refresh")) refreshes++;
  });
  await page.context().clearCookies({ name: "nx_access" });
  await page.reload();
  await expect(page.getByLabel("Bio (optional)", { exact: true })).toHaveValue(
    "Building my first factual professional profile.",
  );
  expect(refreshes).toBe(1);
  await page.getByRole("link", { name: "CV studio", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate draft", exact: true })
    .click();
  await expect(
    page.getByText("CV generation queued.", { exact: true }),
  ).toBeVisible();
  await expect(async () => {
    await page
      .getByRole("button", { name: "Refresh generation status" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Edit & review" }),
    ).toBeVisible();
  }).toPass({ timeout: 15000 });
  await page
    .getByLabel("I reviewed this CV and confirm that its claims are factual.")
    .check();
  await page.getByRole("button", { name: "Save reviewed revision" }).click();
  await expect(page.getByText("Reviewed CV revision saved.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download saved PDF" }).click();
  expect((await download).suggestedFilename()).toBe("Nexvia-CV.pdf");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "My profile", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/student-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
test("Employer candidate search works independently of vacancies", async ({
  page,
}) => {
  await login(page, "employer");
  await page
    .getByRole("link", { name: "Find candidates", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Find suitable candidates" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Demo student", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Candidate role").selectOption("alumni");
  await expect(
    page.getByRole("heading", { name: "Demo alumni", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Demo student", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "View shared career profile", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Shared career profile", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/employer-candidates.png",
    fullPage: true,
  });
});
test("Faculty publishes an academic notice and confirms a scoped dispatch", async ({
  page,
}) => {
  await login(page, "faculty");
  await page
    .getByRole("link", { name: "Academic notices", exact: true })
    .click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Faculty browser guidance notice");
  await page
    .getByLabel("Notice body")
    .fill("A synthetic academic guidance session for verified students.");
  await page.getByRole("button", { name: "Save notice", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Faculty browser guidance notice" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByText("Notice published.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Dispatch guidance", exact: true })
    .click();
  await page
    .getByLabel("Published content")
    .selectOption({ label: "Faculty browser guidance notice" });
  await page.getByRole("button", { name: "Preview recipients" }).click();
  await expect(
    page.getByText("1 eligible recipients", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm dispatch to 1 recipients" })
    .click();
  await expect(
    page.getByText("Dispatch queued.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your dispatch history" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View delivery progress" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "3. Track delivery" }),
  ).toBeVisible();
});
test("Employer edits an owned vacancy with revision checks", async ({
  page,
}) => {
  await login(page, "employer");
  await page.getByRole("link", { name: "My vacancies", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit opportunity", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Updated synthetic internship details for the browser workflow.");
  await page
    .getByRole("button", { name: "Save opportunity revision", exact: true })
    .click();
  await expect(
    page.getByText("Opportunity revision saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      "Updated synthetic internship details for the browser workflow.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("Admin portal exposes reviewed approval queues and controlled taxonomy", async ({
  page,
}) => {
  await login(page, "admin");
  await page.getByRole("link", { name: "Administration", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "University administration" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Academic membership review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Academic taxonomy" }),
  ).toBeVisible();
});
