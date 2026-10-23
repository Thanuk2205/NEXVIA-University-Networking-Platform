import { createService, configFor } from "@nexvia/platform-utils";
import { install as identity } from "../services/identity-service/src/app.js";
import { install as profile } from "../services/profile-service/src/app.js";
import { hashPassword } from "../services/identity-service/src/passwords.js";
const email = process.env.ADMIN_BOOTSTRAP_EMAIL,
  password = process.env.ADMIN_BOOTSTRAP_PASSWORD,
  name = process.env.ADMIN_BOOTSTRAP_NAME,
  staffReference = process.env.ADMIN_BOOTSTRAP_STAFF_REFERENCE,
  evidence = process.env.ADMIN_BOOTSTRAP_EVIDENCE;
if (!email || !password || !name || !staffReference || !evidence)
  throw new Error(
    "Supply administrator email, password, name, staff reference and institutional approval evidence through protected environment variables.",
  );
const services = {};
try {
  services.identity = await createService(
    { ...configFor("identity"), workerInterval: 1000000 },
    identity,
  );
  services.profile = await createService(
    { ...configFor("profile"), workerInterval: 1000000 },
    profile,
  );
  if (await services.identity.Account.exists({ email: email.toLowerCase() }))
    throw new Error(
      "The account already exists; this script never upgrades an existing account.",
    );
  const passwordHash = await hashPassword(password);
  let account;
  await services.identity.transaction(async (session) => {
    [account] = await services.identity.Account.create(
      [
        {
          email: email.toLowerCase(),
          passwordHash,
          role: "admin",
          approvalStatus: "approved",
          emailVerified: false,
        },
      ],
      { session },
    );
    await services.identity.audit(
      session,
      { userId: "authorized-provisioning" },
      "admin.provision",
      account._id,
      evidence,
    );
    await services.identity.requestEmail(session, account, "verify");
  });
  await services.profile.Profile.updateOne(
    { userId: String(account._id) },
    {
      $setOnInsert: {
        userId: String(account._id),
        fullName: name,
        staffReference,
        designation: "University administrator",
      },
    },
    { upsert: true },
  );
  console.log(
    "Administrator provisioned; email ownership verification is still required.",
  );
} finally {
  await Promise.all(Object.values(services).map((s) => s.close()));
}
