import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  z,
  text,
  id,
  scopeSchema,
  validate,
  fail,
  internal,
  respond,
  asyncRoute,
  userToken,
  userVerificationKey,
} from "@nexvia/platform-utils";
import { hashPassword, verifyPassword, passwordSchema } from "./passwords.js";
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const accountFields = [
  "_id",
  "email",
  "role",
  "isActive",
  "emailVerified",
  "approvalStatus",
  "authVersion",
  "approvedAcademicScope",
];
export function safeAccount(a) {
  return Object.fromEntries([
    ["userId", String(a._id)],
    [
      "administrativePermissions",
      a.role === "admin"
        ? [
            "accounts.review",
            "academics.manage",
            "organizations.review",
            "graduation.approve",
            "community.moderate",
            "operations.manage",
          ]
        : [],
    ],
    ...accountFields.slice(1).map((k) => [k, a[k]]),
  ]);
}
export function encryptLink(raw, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    iv,
  );
  return [
    iv.toString("hex"),
    cipher.update(raw, "utf8", "hex") + cipher.final("hex"),
    cipher.getAuthTag().toString("hex"),
  ].join(":");
}
export function decryptLink(value, key) {
  const [iv, raw, tag] = value.split(":");
  const cipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(iv, "hex"),
  );
  cipher.setAuthTag(Buffer.from(tag, "hex"));
  return cipher.update(raw, "hex", "utf8") + cipher.final("utf8");
}

export async function install(ctx) {
  const { app, model, auth, config, rpc } = ctx;
  const Account = model("accounts", {
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["student", "alumni", "employer", "faculty", "admin"],
    },
    emailVerified: { type: Boolean, default: false },
    approvalStatus: { type: String, default: "pending" },
    isActive: { type: Boolean, default: true },
    authVersion: { type: Number, default: 1 },
    approvedAcademicScope: Object,
    deletionRequestedAt: Date,
  });
  const Session = model(
    "sessions",
    {
      userId: String,
      tokenHash: { type: String, unique: true },
      family: String,
      expiresAt: Date,
      revoked: { type: Boolean, default: false },
      authVersion: Number,
    },
    [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
  );
  const Token = model(
    "verification_tokens",
    {
      userId: String,
      kind: String,
      hash: { type: String, unique: true },
      payload: String,
      expiresAt: Date,
      used: { type: Boolean, default: false },
      handle: { type: String, unique: true },
    },
    [[{ expiresAt: 1 }, { expireAfterSeconds: 0 }]],
  );
  const Invite = model("staff_invitations", {
    email: String,
    tokenHash: { type: String, unique: true },
    approvedAcademicScope: Object,
    expiresAt: Date,
    used: { type: Boolean, default: false },
  });
  ctx.Account = Account;
  ctx.Session = Session;
  ctx.Token = Token;
  ctx.accountStatus = async (userId) => {
    const a = await Account.findById(validate(id, userId)).lean();
    if (!a) fail(401, "UNAUTHENTICATED", "Account is unavailable.");
    return safeAccount(a);
  };
  const cookieOptions = {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    path: "/",
  };
  function csrf(res, subject = "guest", sid = crypto.randomUUID()) {
    const token = jwt.sign({ sid }, config.userPrivateKey, {
      algorithm: "RS256",
      issuer: "nexvia-identity",
      audience: "nexvia-csrf",
      subject,
      expiresIn: "1d",
      keyid: config.userKeyId || "identity-1",
    });
    res.cookie("nx_csrf", token, {
      ...cookieOptions,
      httpOnly: false,
      maxAge: 86400000,
    });
    return token;
  }
  async function issueSession(res, account, family) {
    const raw = crypto.randomBytes(32).toString("hex");
    const row = await Session.create({
      userId: String(account._id),
      tokenHash: sha(raw),
      family: family || crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 7 * 86400000),
      authVersion: account.authVersion,
    });
    const token = jwt.sign(
      {
        role: account.role,
        authVersion: account.authVersion,
        sid: String(row._id),
      },
      config.userPrivateKey,
      {
        algorithm: "RS256",
        issuer: "nexvia-identity",
        audience: "nexvia-api",
        subject: String(account._id),
        expiresIn: "5m",
        jwtid: crypto.randomUUID(),
        keyid: config.userKeyId || "identity-1",
      },
    );
    res.cookie("nx_access", token, { ...cookieOptions, maxAge: 300000 });
    res.cookie("nx_refresh", raw, {
      ...cookieOptions,
      path: "/api/v1/auth",
      maxAge: 7 * 86400000,
    });
    csrf(res, String(account._id), String(row._id));
  }
  async function emailRequest(session, account, kind) {
    await Token.updateMany(
      { userId: String(account._id), kind, used: false },
      { $set: { used: true } },
      { session },
    );
    const raw = crypto.randomBytes(32).toString("hex"),
      handle = crypto.randomUUID();
    await Token.create(
      [
        {
          userId: String(account._id),
          kind,
          hash: sha(raw),
          handle,
          expiresAt: new Date(
            Date.now() + (kind === "verify" ? 86400000 : 1800000),
          ),
          payload: encryptLink(raw, config.tokenKey),
        },
      ],
      { session },
    );
    await ctx.emit(
      session,
      "notification",
      kind === "verify"
        ? "VerificationEmailRequested.v1"
        : "PasswordResetRequested.v1",
      account._id,
      account.authVersion,
      { userId: String(account._id), handle, kind },
    );
  }
  ctx.requestEmail = emailRequest;
  app.get("/api/v1/auth/jwks", (req, res) => {
    const registry = config.userPublicKeys || {
      "identity-1": config.userPublicKey,
    };
    respond(res, {
      keys: Object.entries(registry).map(([kid, pem]) => ({
        ...crypto.createPublicKey(pem).export({ format: "jwk" }),
        kid,
        use: "sig",
        alg: "RS256",
      })),
    });
  });
  app.get("/api/v1/auth/csrf", (req, res) => {
    let claims;
    try {
      claims = jwt.verify(
        req.cookies.nx_access,
        userVerificationKey(config, req.cookies.nx_access),
        {
          algorithms: ["RS256"],
          issuer: "nexvia-identity",
          audience: "nexvia-api",
          ignoreExpiration: true,
        },
      );
    } catch {}
    respond(res, { csrfToken: csrf(res, claims?.sub || "guest", claims?.sid) });
  });
  app.post(
    "/api/v1/auth/register",
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            email: z
              .email()
              .max(254)
              .transform((v) => v.toLowerCase().trim()),
            password: passwordSchema,
            fullName: text(120, 2),
            role: z.enum(["student", "alumni", "employer"]),
            invitationToken: z.string().optional(),
          })
          .strict(),
        req.body,
      );
      const passwordHash = await hashPassword(b.password);
      let account;
      await ctx.transaction(async (session) => {
        [account] = await Account.create(
          [{ email: b.email, passwordHash, role: b.role }],
          { session },
        );
        await ctx.emit(
          session,
          "profile",
          "AccountRegistered.v1",
          account._id,
          1,
          { userId: String(account._id), fullName: b.fullName, role: b.role },
        );
        await emailRequest(session, account, "verify");
      });
      await issueSession(res, account);
      respond(res, safeAccount(account), 201);
    }),
  );
  app.post(
    "/api/v1/auth/login",
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({ email: z.email().max(254), password: z.string().max(512) })
          .strict(),
        req.body,
      );
      const a = await Account.findOne({ email: b.email.toLowerCase().trim() });
      if (
        !a ||
        !a.isActive ||
        !(await verifyPassword(b.password, a.passwordHash))
      )
        fail(401, "INVALID_LOGIN", "Email or password is incorrect.");
      if (a.passwordHash.startsWith("$2")) {
        a.passwordHash = await hashPassword(b.password, { legacy: true });
        await a.save();
      }
      await issueSession(res, a);
      respond(res, safeAccount(a));
    }),
  );
  app.get("/api/v1/auth/me", auth([], false), (req, res) =>
    respond(res, req.actor),
  );
  app.post(
    "/api/v1/auth/refresh",
    asyncRoute(async (req, res) => {
      const raw = req.cookies.nx_refresh || "";
      const old = await Session.findOne({ tokenHash: sha(raw) });
      if (!old || old.expiresAt < new Date())
        fail(401, "SESSION_EXPIRED", "Sign in again.");
      if (old.revoked) {
        await Session.updateMany(
          { userId: old.userId },
          { $set: { revoked: true } },
        );
        await Account.updateOne(
          { _id: old.userId },
          { $inc: { authVersion: 1 } },
        );
        fail(401, "TOKEN_REUSE", "Sign in again.");
      }
      const a = await Account.findById(old.userId);
      if (!a?.isActive || a.authVersion !== old.authVersion)
        fail(401, "SESSION_REVOKED", "Sign in again.");
      const claimed = await Session.updateOne(
        { _id: old._id, revoked: false },
        { $set: { revoked: true } },
      );
      if (!claimed.modifiedCount) fail(401, "TOKEN_REUSE", "Sign in again.");
      await issueSession(res, a, old.family);
      respond(res, safeAccount(a));
    }),
  );
  app.post(
    "/api/v1/auth/logout",
    auth([], false),
    asyncRoute(async (req, res) => {
      await Session.updateMany(
        { userId: req.actor.userId },
        { $set: { revoked: true } },
      );
      await Account.updateOne(
        { _id: req.actor.userId },
        { $inc: { authVersion: 1 } },
      );
      res.clearCookie("nx_access", cookieOptions);
      res.clearCookie("nx_refresh", { ...cookieOptions, path: "/api/v1/auth" });
      csrf(res);
      respond(res, { loggedOut: true });
    }),
  );
  app.post(
    "/api/v1/auth/resend-verification",
    auth([], false),
    asyncRoute(async (req, res) => {
      const a = await Account.findById(req.actor.userId);
      if (!a.emailVerified)
        await ctx.transaction((s) => emailRequest(s, a, "verify"));
      respond(res, { accepted: true }, 202);
    }),
  );
  app.post(
    "/api/v1/auth/forgot-password",
    asyncRoute(async (req, res) => {
      const b = validate(
        z.object({ email: z.email().max(254) }).strict(),
        req.body,
      );
      const a = await Account.findOne({
        email: b.email.toLowerCase().trim(),
        isActive: true,
      });
      if (a) await ctx.transaction((s) => emailRequest(s, a, "reset"));
      respond(
        res,
        {
          message:
            "If the account is eligible, a recovery email will be queued.",
        },
        202,
      );
    }),
  );
  for (const kind of ["verify", "reset"])
    app.post(
      `/api/v1/auth/${kind === "verify" ? "verify-email" : "reset-password"}`,
      asyncRoute(async (req, res) => {
        const b = validate(
          z
            .object({
              token: z.string().regex(/^[a-f\d]{64}$/),
              ...(kind === "reset" ? { password: passwordSchema } : {}),
            })
            .strict(),
          req.body,
        );
        const passwordHash =
          kind === "reset" ? await hashPassword(b.password) : undefined;
        await ctx.transaction(async (session) => {
          const t = await Token.findOneAndUpdate(
            {
              hash: sha(b.token),
              kind,
              used: false,
              expiresAt: { $gt: new Date() },
            },
            { $set: { used: true } },
            { new: true, session },
          );
          if (!t)
            fail(
              400,
              "TOKEN_INVALID",
              "This link is invalid or expired. Request another one.",
            );
          const a = await Account.findById(t.userId).session(session);
          if (!a?.isActive)
            fail(400, "TOKEN_INVALID", "This link is unavailable.");
          if (kind === "verify") a.emailVerified = true;
          else {
            a.passwordHash = passwordHash;
            a.authVersion += 1;
            await Session.updateMany(
              { userId: t.userId },
              { $set: { revoked: true } },
              { session },
            );
          }
          await a.save({ session });
        });
        respond(res, { completed: true });
      }),
    );
  app.get(
    "/api/v1/admin/accounts",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const { paginate, page } = await import("@nexvia/platform-utils");
      const { filter, limit } = paginate(req.query);
      const rows = await Account.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean();
      const result = page(rows, limit);
      result.items = result.items.map(safeAccount);
      respond(res, result);
    }),
  );
  for (const action of ["verification", "status", "role"])
    app.patch(
      `/api/v1/admin/accounts/:id/${action}`,
      auth(["admin"]),
      asyncRoute(async (req, res) => {
        const target = validate(id, req.params.id);
        const b = validate(
          z
            .object({
              reason: text(1000, 3),
              approvalStatus: z
                .enum(["approved", "rejected", "suspended"])
                .optional(),
              isActive: z.boolean().optional(),
              role: z
                .enum(["student", "alumni", "employer", "faculty"])
                .optional(),
              approvedAcademicScope: scopeSchema.optional(),
            })
            .strict(),
          req.body,
        );
        if (target === req.actor.userId)
          fail(
            409,
            "SELF_ADMIN",
            "Use a separate authorized administrator for this change.",
          );
        if (action === "role")
          fail(
            409,
            "ROLE_WORKFLOW",
            "Use graduation approval or an approved staff invitation; arbitrary role changes are disabled.",
          );
        if (action === "verification" && b.approvalStatus === "approved") {
          if (b.approvedAcademicScope)
            await rpc("profile", "/internal/validate-taxonomy", {
              method: "POST",
              body: { scope: b.approvedAcademicScope },
            });
          const summary = await rpc(
            "profile",
            `/internal/verification-summary/${target}`,
          );
          if (!summary.ready)
            fail(
              409,
              "PROFILE_NOT_READY",
              "Approve the required profile/membership/organization first.",
            );
        }
        const result = await ctx.command(req, async (session) => {
          const a = await Account.findById(target).session(session);
          if (!a) fail(404, "NOT_FOUND", "Account not found.");
          if (action === "verification") {
            if (!b.approvalStatus)
              fail(400, "VALIDATION", "An approval status is required.");
            if (b.approvalStatus === "approved" && !a.emailVerified)
              fail(
                409,
                "EMAIL_NOT_VERIFIED",
                "Email ownership must be verified.",
              );
            a.approvalStatus = b.approvalStatus;
            if (b.approvedAcademicScope) {
              if (a.role !== "faculty")
                fail(400, "ROLE", "Only faculty accounts have academic scope.");
              a.approvedAcademicScope = b.approvedAcademicScope;
            }
          } else {
            if (b.isActive === undefined)
              fail(400, "VALIDATION", "An account status is required.");
            if (b.isActive && a.deletionRequestedAt)
              fail(
                409,
                "DELETION_REVIEW",
                "Account deletion requires a dedicated institutional retention review.",
              );
            a.isActive = b.isActive;
          }
          a.authVersion += 1;
          await a.save({ session });
          await Session.updateMany(
            { userId: target },
            { $set: { revoked: true } },
            { session },
          );
          await ctx.audit(
            session,
            req.actor,
            `account.${action}`,
            target,
            b.reason,
          );
          await ctx.emit(
            session,
            "matching",
            "AccountEligibilityChanged.v1",
            target,
            a.authVersion,
            { userId: target },
          );
          return safeAccount(a);
        });
        respond(res, result);
      }),
    );
  app.post(
    "/api/v1/admin/staff-invitations",
    auth(["admin"]),
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            email: z.email().max(254),
            approvedAcademicScope: scopeSchema,
            reason: text(1000, 3),
          })
          .strict(),
        req.body,
      );
      if (!Object.keys(b.approvedAcademicScope).length)
        fail(400, "SCOPE", "Assign a faculty scope.");
      await rpc("profile", "/internal/validate-taxonomy", {
        method: "POST",
        body: { scope: b.approvedAcademicScope },
      });
      const token = crypto.randomBytes(32).toString("hex");
      const row = await ctx.command(req, async (session) => {
        const [v] = await Invite.create(
          [
            {
              email: b.email.toLowerCase(),
              tokenHash: sha(token),
              approvedAcademicScope: b.approvedAcademicScope,
              expiresAt: new Date(Date.now() + 7 * 86400000),
            },
          ],
          { session },
        );
        await ctx.audit(session, req.actor, "staff.invite", v._id, b.reason);
        return { id: String(v._id) };
      });
      respond(res, { ...row, invitationToken: token }, 201);
    }),
  );
  app.post(
    "/api/v1/auth/accept-invitation",
    asyncRoute(async (req, res) => {
      const b = validate(
        z
          .object({
            token: z.string().regex(/^[a-f\d]{64}$/),
            fullName: text(120, 2),
            password: passwordSchema,
          })
          .strict(),
        req.body,
      );
      const passwordHash = await hashPassword(b.password);
      let a;
      await ctx.transaction(async (session) => {
        const invitation = await Invite.findOneAndUpdate(
          {
            tokenHash: sha(b.token),
            used: false,
            expiresAt: { $gt: new Date() },
          },
          { $set: { used: true } },
          { new: true, session },
        );
        if (!invitation)
          fail(400, "INVITATION_INVALID", "Invitation is unavailable.");
        [a] = await Account.create(
          [
            {
              email: invitation.email,
              passwordHash,
              role: "faculty",
              approvedAcademicScope: invitation.approvedAcademicScope,
            },
          ],
          { session },
        );
        await ctx.emit(session, "profile", "AccountRegistered.v1", a._id, 1, {
          userId: String(a._id),
          fullName: b.fullName,
          role: "faculty",
        });
        await emailRequest(session, a, "verify");
      });
      await issueSession(res, a);
      respond(res, safeAccount(a), 201);
    }),
  );
  app.delete(
    "/api/v1/accounts/me",
    auth([], false),
    asyncRoute(async (req, res) => {
      const b = validate(
        z.object({ password: z.string().max(512) }).strict(),
        req.body,
      );
      const a = await Account.findById(req.actor.userId);
      if (!(await verifyPassword(b.password, a.passwordHash)))
        fail(401, "INVALID_LOGIN", "Password is incorrect.");
      await ctx.command(req, async (session) => {
        await Account.updateOne(
          { _id: a._id },
          {
            $set: { isActive: false, deletionRequestedAt: new Date() },
            $inc: { authVersion: 1 },
          },
          { session },
        );
        await Session.updateMany(
          { userId: req.actor.userId },
          { $set: { revoked: true } },
          { session },
        );
        for (const target of [
          "profile",
          "matching",
          "community",
          "notification",
          "cv",
        ])
          await ctx.emit(
            session,
            target,
            "AccountDeletionRequested.v1",
            a._id,
            a.authVersion + 1,
            { userId: req.actor.userId },
          );
        return { status: "deactivated", retentionReview: "pending" };
      });
      respond(res, { status: "deactivated", retentionReview: "pending" }, 202);
    }),
  );
  app.get(
    "/internal/accounts/:id",
    internal(config, [
      "gateway",
      "profile",
      "opportunity",
      "matching",
      "community",
      "notification",
      "cv",
    ]),
    asyncRoute(async (req, res) => {
      const a = await ctx.accountStatus(req.params.id);
      delete a.email;
      respond(res, a);
    }),
  );
  app.post(
    "/internal/accounts/status",
    internal(config, ["profile", "matching"]),
    asyncRoute(async (req, res) => {
      const ids = validate(z.array(id).max(200), req.body.userIds);
      const a = await Account.find({ _id: { $in: ids } }).lean();
      respond(
        res,
        a.map((v) => {
          const s = safeAccount(v);
          delete s.email;
          return s;
        }),
      );
    }),
  );
  app.get(
    "/internal/contacts/:id",
    internal(config, ["notification"]),
    asyncRoute(async (req, res) => {
      const a = await ctx.accountStatus(req.params.id);
      respond(res, {
        userId: a.userId,
        email: a.email,
        isActive: a.isActive,
        emailVerified: a.emailVerified,
        approvalStatus: a.approvalStatus,
      });
    }),
  );
  app.get(
    "/internal/cv-contact/:id",
    internal(config, ["cv"]),
    auth(["student", "alumni"]),
    asyncRoute(async (req, res) => {
      if (req.params.id !== req.actor.userId)
        fail(
          403,
          "OWNERSHIP",
          "Only your own contact details can be included.",
        );
      const a = await ctx.accountStatus(req.actor.userId);
      respond(res, { email: a.email });
    }),
  );
  app.get(
    "/internal/mail-requests/:handle",
    internal(config, ["notification"]),
    asyncRoute(async (req, res) => {
      const t = await Token.findOne({
        handle: req.params.handle,
        used: false,
        expiresAt: { $gt: new Date() },
      }).lean();
      if (!t) fail(410, "MAIL_EXPIRED", "This email request has expired.");
      respond(res, {
        userId: t.userId,
        kind: t.kind,
        token: decryptLink(t.payload, config.tokenKey),
      });
    }),
  );
  ctx.handlers.profile = {
    "GraduationVerified.v1": async (event, session) => {
      const a = await Account.findById(event.data.userId).session(session);
      if (!a || !["student", "alumni"].includes(a.role))
        fail(409, "GRADUATION_ROLE", "Invalid graduation transition.");
      if (a.role === "student") {
        a.role = "alumni";
        a.authVersion += 1;
        await a.save({ session });
        await Session.updateMany(
          { userId: String(a._id) },
          { $set: { revoked: true } },
          { session },
        );
      }
      await ctx.emit(
        session,
        "profile",
        "GraduationRoleChanged.v1",
        a._id,
        a.authVersion,
        { userId: String(a._id), requestId: event.data.requestId },
      );
      await ctx.emit(
        session,
        "matching",
        "AccountEligibilityChanged.v1",
        a._id,
        a.authVersion,
        { userId: String(a._id) },
      );
    },
  };
}
