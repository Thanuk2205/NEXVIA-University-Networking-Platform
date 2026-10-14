import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import crypto from "node:crypto";
import {
  asyncRoute,
  respond,
  verifyUser,
  client,
  fail,
  rateKey,
} from "@nexvia/platform-utils";
export const routeOwner = (route) => {
  const operation = route.match(
    /^\/operations\/(identity|profile|opportunity|matching|community|notification|cv)\/(outbox|audit)(\/|$)/,
  );
  if (operation) return operation[1];
  if (
    /^\/(auth|accounts)(\/|$)|^\/admin\/(accounts|staff-invitations)(\/|$)/.test(
      route,
    )
  )
    return "identity";
  if (
    /^\/(profiles|academic|organizations|candidates|alumni)(\/|$)|^\/admin\/(academic|membership-requests|graduation-requests|organizations)(\/|$)|^\/faculty\/graduation-requests(\/|$)/.test(
      route,
    )
  )
    return "profile";
  if (
    /^\/(recommendations|dispatches|match-runs)(\/|$)|^\/opportunities\/[^/]+\/candidates$/.test(
      route,
    )
  )
    return "matching";
  if (/^\/(opportunities|applications|academic-notices)(\/|$)/.test(route))
    return "opportunity";
  if (
    /^\/(posts|post-applications|post-cv-uploads)(\/|$)|^\/admin\/(reports|moderation-actions)(\/|$)/.test(
      route,
    )
  )
    return "community";
  if (
    /^\/(notifications|notification-preferences)(\/|$)|^\/admin\/delivery-jobs(\/|$)/.test(
      route,
    )
  )
    return "notification";
  if (/^\/cv(\/|$)/.test(route)) return "cv";
  return null;
};
export function createGateway(config) {
  const app = express();
  if (config.trustedProxies?.length)
    app.set("trust proxy", config.trustedProxies);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));
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
      limit: 180,
      keyGenerator: (req) => rateKey(config, req),
      handler: (req, res) =>
        res.status(429).json({
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
  app.use(
    "/api/v1/auth",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 60,
      handler: (req, res) =>
        res.status(429).json({
          error: {
            code: "AUTH_RATE_LIMIT",
            message:
              "Too many authentication requests. Please try again later.",
            requestId: res.locals.requestId,
          },
        }),
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/health/live", (req, res) =>
    respond(res, { status: "ok", service: "gateway" }),
  );
  app.post(
    "/api/v1/post-cv-uploads",
    express.raw({ type: "application/pdf", limit: "2mb" }),
    (req, res, next) => next(),
  );
  app.get(
    "/health/ready",
    asyncRoute(async (req, res) => {
      const checks = await Promise.all(
        Object.entries(config.urls).map(async ([name, url]) => {
          try {
            const r = await fetch(`${url}/health/ready`, {
              signal: AbortSignal.timeout(2000),
            });
            return [name, r.ok ? "ready" : "unavailable"];
          } catch {
            return [name, "unavailable"];
          }
        }),
      );
      respond(
        res,
        { services: Object.fromEntries(checks) },
        checks.every(([, s]) => s === "ready") ? 200 : 503,
      );
    }),
  );
  app.get(
    "/api/v1/dashboards/:role",
    asyncRoute(async (req, res) => {
      const cookie = String(req.headers.cookie || "")
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("nx_access="));
      const claims = verifyUser(config, cookie?.slice(10));
      const rpc = client(config);
      const a = await rpc("identity", `/internal/accounts/${claims.sub}`);
      if (
        a.authVersion !== claims.authVersion ||
        !a.isActive ||
        !a.emailVerified ||
        a.approvalStatus !== "approved"
      )
        fail(403, "VERIFICATION_REQUIRED", "Complete account approval first.");
      if (
        req.params.role !== a.role &&
        !(req.params.role === "student" && a.role === "alumni")
      )
        fail(403, "ROLE", "Dashboard role does not match your account.");
      const results = await Promise.allSettled(
        ["profile", "opportunity", "notification"].map((target) =>
          rpc(target, "/internal/summary", { actor: cookie.slice(10) }),
        ),
      );
      const sections = results.map((r, i) => ({
        service: ["profile", "opportunity", "notification"][i],
        status: r.status === "fulfilled" ? "available" : "unavailable",
        stats: r.status === "fulfilled" ? r.value.stats : [],
      }));
      respond(res, {
        role: a.role,
        stats: sections.flatMap((v) => v.stats),
        sections,
        generatedAt: new Date().toISOString(),
      });
    }),
  );
  app.use(
    "/api/v1",
    asyncRoute(async (req, res) => {
      const owner = routeOwner(req.path);
      if (!owner || !["GET", "POST", "PATCH", "DELETE"].includes(req.method))
        fail(404, "NOT_FOUND", "Route not found.");
      const headers = {};
      for (const name of [
        "cookie",
        "content-type",
        "x-csrf-token",
        "idempotency-key",
        "if-match",
        "x-change-reason",
        "x-cv-filename",
        "accept",
      ])
        if (req.headers[name]) headers[name] = req.headers[name];
      if (req.headers.origin) headers.origin = req.headers.origin;
      let upstream;
      try {
        upstream = await fetch(`${config.urls[owner]}${req.originalUrl}`, {
          method: req.method,
          headers,
          body: ["GET", "HEAD"].includes(req.method)
            ? undefined
            : Buffer.isBuffer(req.body)
              ? req.body
              : JSON.stringify(req.body || {}),
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        fail(
          503,
          "SERVICE_UNAVAILABLE",
          `${owner} is temporarily unavailable.`,
        );
      }
      for (const key of [
        "content-type",
        "content-disposition",
        "etag",
        "retry-after",
      ])
        if (upstream.headers.has(key)) res.set(key, upstream.headers.get(key));
      for (const cookie of upstream.headers.getSetCookie())
        res.append("Set-Cookie", cookie);
      res
        .status(upstream.status)
        .send(Buffer.from(await upstream.arrayBuffer()));
    }),
  );
  app.use((req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Route not found." } }),
  );
  app.use((err, req, res, next) =>
    res.status(err.status || 500).json({
      error: {
        code: err.code || "INTERNAL_ERROR",
        message: err.status ? err.message : "Unexpected gateway error.",
        requestId: res.locals.requestId,
      },
    }),
  );
  return app;
}
