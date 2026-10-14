import express from "express";
import mongoose from "mongoose";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  asyncRoute,
  client,
  internal,
  respond,
  userToken,
  verifyUser,
  userVerificationKey,
  rateKey,
} from "./http.js";
import { fail, validate, z, id, text } from "./validation.js";

export async function createService(config, install) {
  const db = await mongoose
    .createConnection(config.mongoUri, { serverSelectionTimeoutMS: 5000 })
    .asPromise();
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    res.locals.requestId = crypto.randomUUID();
    res.set("X-Request-Id", res.locals.requestId);
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 150,
      keyGenerator: (req) => rateKey(config, req),
      handler: (req, res) =>
        res
          .status(429)
          .json({
            error: {
              code: "RATE_LIMIT",
              message: "Please wait before making more requests.",
              requestId: res.locals.requestId,
            },
          }),
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin !== config.origin)
        return next(
          Object.assign(new Error("Untrusted request origin."), {
            status: 403,
            code: "ORIGIN",
          }),
        );
      const csrf = req.cookies?.nx_csrf;
      if (!csrf || csrf !== req.headers["x-csrf-token"])
        return next(
          Object.assign(new Error("Reload the page and try again."), {
            status: 403,
            code: "CSRF",
          }),
        );
      try {
        const proof = jwt.verify(csrf, userVerificationKey(config, csrf), {
          algorithms: ["RS256"],
          issuer: "nexvia-identity",
          audience: "nexvia-csrf",
        });
        const claims = req.cookies.nx_access
          ? jwt.verify(
              req.cookies.nx_access,
              userVerificationKey(config, req.cookies.nx_access),
              {
                algorithms: ["RS256"],
                issuer: "nexvia-identity",
                audience: "nexvia-api",
                ignoreExpiration: true,
              },
            )
          : null;
        if (
          claims &&
          proof.sub !== "guest" &&
          (proof.sub !== claims.sub || proof.sid !== claims.sid)
        )
          throw new Error("CSRF session mismatch");
        if (
          proof.sub === "guest" &&
          claims &&
          !/^\/api\/v1\/auth\/(login|register|accept-invitation|forgot-password|verify-email|reset-password)$/.test(
            req.path,
          )
        )
          throw new Error("CSRF session required");
      } catch {
        return next(
          Object.assign(new Error("Reload the page and try again."), {
            status: 403,
            code: "CSRF",
          }),
        );
      }
    }
    next();
  });
  const model = (name, fields, indexes = []) => {
    const schema = new mongoose.Schema(fields, {
      timestamps: true,
      strict: "throw",
      versionKey: false,
    });
    schema.index({ createdAt: -1, _id: -1 });
    indexes.forEach(([keys, opts]) => schema.index(keys, opts));
    return db.model(name, schema, name);
  };
  const Outbox = model("outbox_events", {
    eventId: { type: String, unique: true },
    type: String,
    source: String,
    target: String,
    aggregateId: String,
    revision: Number,
    data: mongoose.Schema.Types.Mixed,
    status: { type: String, default: "queued" },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    leaseUntil: Date,
    lastError: String,
  });
  const Inbox = model("inbox_events", {
    eventId: { type: String, unique: true },
    type: String,
  });
  const Keys = model("idempotency_keys", {
    key: { type: String, unique: true },
    hash: String,
    result: mongoose.Schema.Types.Mixed,
  });
  const Audit = model("audit", {
    actorId: String,
    action: String,
    resourceId: String,
    reason: String,
  });
  const rpc = client(config);
  const ctx = {
    app,
    db,
    model,
    rpc,
    config,
    Outbox,
    Inbox,
    Audit,
    handlers: {},
    workers: [],
    closing: false,
  };
  ctx.audit = (session, actor, action, resourceId, reason) =>
    Audit.create(
      [
        {
          actorId: actor.userId,
          action,
          resourceId: String(resourceId),
          reason,
        },
      ],
      { session },
    );
  ctx.emit = (session, target, type, aggregateId, revision, data) =>
    Outbox.create(
      [
        {
          eventId: crypto.randomUUID(),
          type,
          source: config.name,
          target,
          aggregateId: String(aggregateId),
          revision,
          data,
        },
      ],
      { session },
    );
  ctx.transaction = (work) => db.transaction(work);
  ctx.command = async (req, work, required = false) => {
    const supplied = req.headers["idempotency-key"];
    if (required && (!supplied || !/^[\w-]{8,128}$/.test(supplied)))
      fail(
        400,
        "IDEMPOTENCY_KEY",
        "Supply a unique Idempotency-Key (8-128 characters).",
      );
    const key = `${req.actor.userId}:${req.method}:${req.path}:${supplied || crypto.randomUUID()}`;
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(req.body || {}))
      .digest("hex");
    const existing = await Keys.findOne({ key }).lean();
    if (existing) {
      if (existing.hash !== hash)
        fail(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This key was used for different content.",
        );
      return existing.result;
    }
    let result;
    try {
      await db.transaction(async (session) => {
        const old = await Keys.findOne({ key }).session(session).lean();
        if (old) {
          if (old.hash !== hash)
            fail(
              409,
              "IDEMPOTENCY_CONFLICT",
              "This key was used for different content.",
            );
          result = old.result;
          return;
        }
        result = await work(session);
        await Keys.create([{ key, hash, result }], { session });
      });
    } catch (e) {
      if (e.code !== 11000) throw e;
      const old = await Keys.findOne({ key }).lean();
      if (!old || old.hash !== hash)
        fail(409, "CONFLICT", "A conflicting record already exists.");
      result = old.result;
    }
    return result;
  };
  ctx.actor = async (req) => {
    const claims = verifyUser(config, userToken(req));
    const actor =
      config.name === "identity"
        ? await ctx.accountStatus(claims.sub)
        : await rpc("identity", `/internal/accounts/${claims.sub}`);
    if (!actor?.isActive || actor.authVersion !== claims.authVersion)
      fail(401, "SESSION_REVOKED", "Sign in again to continue.");
    return actor;
  };
  ctx.auth = (roles = [], approved = true) =>
    asyncRoute(async (req, res, next) => {
      req.actor = await ctx.actor(req);
      if (roles.length && !roles.includes(req.actor.role))
        fail(403, "ROLE", "This action is unavailable for your role.");
      if (
        approved &&
        (!req.actor.emailVerified || req.actor.approvalStatus !== "approved")
      )
        fail(
          403,
          "VERIFICATION_REQUIRED",
          "Complete email and institutional approval first.",
        );
      next();
    });
  app.get("/health/live", (req, res) =>
    respond(res, { service: config.name, status: "ok" }),
  );
  app.get("/health/ready", (req, res) =>
    respond(
      res,
      {
        service: config.name,
        status: db.readyState === 1 ? "ready" : "unavailable",
      },
      db.readyState === 1 ? 200 : 503,
    ),
  );
  await install(ctx);
  app.get(
    "/api/v1/operations/:service/outbox",
    ctx.auth(["admin"]),
    asyncRoute(async (req, res) => {
      if (req.params.service !== config.name)
        fail(404, "NOT_FOUND", "Service not found.");
      const { paginate, page } = await import("./http.js");
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Outbox.find(filter)
            .select("-data")
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.post(
    "/api/v1/operations/:service/outbox/:id/retry",
    ctx.auth(["admin"]),
    asyncRoute(async (req, res) => {
      if (req.params.service !== config.name)
        fail(404, "NOT_FOUND", "Service not found.");
      const b = validate(
        z.object({ reason: text(1000, 3) }).strict(),
        req.body,
      );
      respond(
        res,
        await ctx.command(req, async (session) => {
          const event = await Outbox.findOneAndUpdate(
            { _id: validate(id, req.params.id), status: "failed" },
            {
              $set: {
                status: "queued",
                attempts: 0,
                nextAttemptAt: new Date(),
              },
              $unset: { leaseUntil: 1 },
            },
            { new: true, session },
          );
          if (!event)
            fail(
              409,
              "EVENT_STATE",
              "Only failed events can be reviewed for retry.",
            );
          await ctx.audit(
            session,
            req.actor,
            "outbox.retry",
            event._id,
            b.reason,
          );
          return { eventId: event.eventId, status: "queued" };
        }),
      );
    }),
  );
  app.get(
    "/api/v1/operations/:service/audit",
    ctx.auth(["admin"]),
    asyncRoute(async (req, res) => {
      if (req.params.service !== config.name)
        fail(404, "NOT_FOUND", "Service not found.");
      const { paginate, page } = await import("./http.js");
      const { filter, limit } = paginate(req.query);
      respond(
        res,
        page(
          await Audit.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit + 1)
            .lean(),
          limit,
        ),
      );
    }),
  );
  app.post(
    "/internal/events",
    internal(config, Object.keys(ctx.handlers)),
    asyncRoute(async (req, res) => {
      const event = req.body;
      if (
        !event ||
        typeof event.eventId !== "string" ||
        event.source !== req.serviceCaller ||
        !ctx.handlers[event.source]?.[event.type]
      )
        fail(400, "EVENT_CONTRACT", "Unsupported event contract.");
      try {
        await db.transaction(async (session) => {
          if (await Inbox.exists({ eventId: event.eventId }).session(session))
            return;
          await ctx.handlers[event.source][event.type](event, session);
          await Inbox.create([{ eventId: event.eventId, type: event.type }], {
            session,
          });
        });
      } catch (e) {
        if (
          e.code !== 11000 ||
          !(await Inbox.exists({ eventId: event.eventId }))
        )
          throw e;
      }
      respond(res, { accepted: true });
    }),
  );
  app.use((req, res) => respond(res, { message: "Route not found" }, 404));
  app.use((err, req, res, next) => {
    // Only safe operational metadata is logged.
    const status =
      err.status ||
      (err.code === 11000
        ? 409
        : ["ValidationError", "StrictModeError", "CastError"].includes(err.name)
          ? 400
          : 500);
    if (status >= 500)
      process.stderr.write(
        JSON.stringify({
          service: config.name,
          requestId: res.locals.requestId,
          error: err.code || err.name,
        }) + "\n",
      );
    res.status(status).json({
      error: {
        code: status === 500 ? "INTERNAL_ERROR" : err.code || "VALIDATION",
        message: status === 500 ? "An unexpected error occurred." : err.message,
        details: err.details,
        requestId: res.locals.requestId,
      },
    });
  });
  await Promise.all(Object.values(db.models).map((m) => m.init()));
  let working = false;
  ctx.tick = async () => {
    if (working || ctx.closing) return;
    working = true;
    try {
      for (let i = 0; i < 25; i++) {
        const now = new Date();
        const event = await Outbox.findOneAndUpdate(
          {
            status: { $in: ["queued", "running"] },
            nextAttemptAt: { $lte: now },
            $or: [
              { leaseUntil: { $exists: false } },
              { leaseUntil: { $lt: now } },
            ],
          },
          {
            $set: {
              status: "running",
              leaseUntil: new Date(Date.now() + 15000),
            },
            $inc: { attempts: 1 },
          },
          { new: true },
        ).lean();
        if (!event) break;
        try {
          await rpc(event.target, "/internal/events", {
            method: "POST",
            body: event,
          });
          await Outbox.updateOne(
            { _id: event._id, status: "running", leaseUntil: event.leaseUntil },
            { $set: { status: "delivered" }, $unset: { leaseUntil: 1 } },
          );
        } catch (e) {
          await Outbox.updateOne(
            { _id: event._id, status: "running", leaseUntil: event.leaseUntil },
            {
              $set: {
                status:
                  event.attempts >= 8 || (e.status < 500 && e.status !== 429)
                    ? "failed"
                    : "queued",
                lastError: e.code || "UNAVAILABLE",
                nextAttemptAt: new Date(
                  Date.now() +
                    Math.min(300000, 1000 * 2 ** event.attempts) +
                    Math.random() * 500,
                ),
              },
              $unset: { leaseUntil: 1 },
            },
          );
        }
      }
      for (const worker of ctx.workers) await worker();
    } catch (e) {
      process.stderr.write(
        JSON.stringify({
          service: config.name,
          workerError: e.code || e.name,
        }) + "\n",
      );
    } finally {
      working = false;
    }
  };
  const timer = setInterval(ctx.tick, config.workerInterval || 750);
  timer.unref();
  ctx.close = async () => {
    ctx.closing = true;
    clearInterval(timer);
    while (working) await new Promise((r) => setTimeout(r, 20));
    await db.close();
  };
  return ctx;
}
export async function startService(config, install) {
  const ctx = await createService(config, install);
  const server = ctx.app.listen(config.port, "0.0.0.0", () =>
    console.log(JSON.stringify({ service: config.name, port: config.port })),
  );
  async function stop() {
    server.close();
    await ctx.close();
  }
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return { ...ctx, server };
}
