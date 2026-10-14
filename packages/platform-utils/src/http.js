import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { ipKeyGenerator } from "express-rate-limit";
import { fail, HttpError } from "./validation.js";
export const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
export function respond(res, data, status = 200, meta = {}) {
  return res
    .status(status)
    .json({ data, meta: { requestId: res.locals.requestId, ...meta } });
}
export function userToken(req) {
  return req.cookies?.nx_access || req.headers["x-actor-token"];
}
const verificationKeys = new WeakMap();
function publicKey(config, pem) {
  let keys = verificationKeys.get(config);
  if (!keys) {
    keys = new Map();
    verificationKeys.set(config, keys);
  }
  if (!keys.has(pem)) keys.set(pem, crypto.createPublicKey(pem));
  return keys.get(pem);
}
export function userVerificationKey(config, token) {
  const kid = jwt.decode(token, { complete: true })?.header.kid;
  const registry = config.userPublicKeys || {
    "identity-1": config.userPublicKey,
  };
  if (typeof kid !== "string" || !Object.hasOwn(registry, kid))
    fail(401, "UNKNOWN_KEY", "Sign in to continue.");
  return publicKey(config, registry[kid]);
}
export function verifyUser(config, token) {
  try {
    return jwt.verify(token, userVerificationKey(config, token), {
      algorithms: ["RS256"],
      issuer: "nexvia-identity",
      audience: "nexvia-api",
      clockTolerance: 5,
    });
  } catch {
    fail(401, "UNAUTHENTICATED", "Sign in to continue.");
  }
}
export function rateKey(config, req) {
  const cookie =
    req.cookies?.nx_access ||
    String(req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("nx_access="))
      ?.slice(10);
  try {
    return `user:${verifyUser(config, cookie).sub}`;
  } catch {
    return `ip:${ipKeyGenerator(req.ip)}`;
  }
}
export function internal(config, allowed) {
  return (req, res, next) => {
    try {
      const token = String(req.headers.authorization || "").replace(
        /^Bearer /,
        "",
      );
      const decoded = jwt.decode(token, { complete: true });
      const keyId = decoded?.header.kid;
      const caller =
        typeof keyId === "string" ? keyId.split(":")[0] : undefined;
      if (
        !allowed.includes(caller) ||
        !Object.hasOwn(config.servicePublicKeys, keyId)
      )
        fail(403, "SERVICE_FORBIDDEN", "Service permission denied.");
      const claims = jwt.verify(
        token,
        publicKey(config, config.servicePublicKeys[keyId]),
        {
          algorithms: ["RS256"],
          issuer: "nexvia-services",
          audience: config.name,
          maxAge: "60s",
        },
      );
      if (claims.sub !== caller)
        fail(403, "SERVICE_FORBIDDEN", "Service identity mismatch.");
      req.serviceCaller = caller;
      next();
    } catch (e) {
      next(
        e instanceof HttpError
          ? e
          : new HttpError(
              401,
              "SERVICE_AUTH",
              "Service authentication required.",
            ),
      );
    }
  };
}
export function client(config) {
  const signingKey = crypto.createPrivateKey(config.servicePrivateKey);
  return async (
    target,
    route,
    { method = "GET", body, actor, timeout = 4000 } = {},
  ) => {
    const token = jwt.sign({}, signingKey, {
      algorithm: "RS256",
      issuer: "nexvia-services",
      audience: target,
      subject: config.name,
      expiresIn: 45,
      jwtid: crypto.randomUUID(),
      keyid: config.serviceKeyId || config.name,
    });
    let response;
    try {
      response = await fetch(`${config.urls[target]}${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(actor ? { "X-Actor-Token": actor } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new HttpError(
        503,
        "DEPENDENCY_UNAVAILABLE",
        `${target} is temporarily unavailable.`,
      );
    }
    const payload = await response.json();
    if (!response.ok)
      throw new HttpError(
        response.status,
        payload.error?.code || "DEPENDENCY_ERROR",
        payload.error?.message || "The requested operation is unavailable.",
      );
    return payload.data;
  };
}
export function paginate(query, max = 100) {
  const limit = Number(query.limit || 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > max)
    fail(400, "PAGINATION", `Limit must be between 1 and ${max}.`);
  let filter = {};
  if (query.cursor) {
    try {
      const [at, id] = JSON.parse(
        Buffer.from(query.cursor, "base64url").toString(),
      );
      if (!/^[a-f\d]{24}$/i.test(id) || !Number.isFinite(Date.parse(at)))
        throw new Error();
      filter = {
        $or: [
          { createdAt: { $lt: new Date(at) } },
          { createdAt: new Date(at), _id: { $lt: id } },
        ],
      };
    } catch {
      fail(400, "CURSOR", "Invalid pagination cursor.");
    }
  }
  return { filter, limit };
}
export function page(rows, limit) {
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: more
      ? Buffer.from(
          JSON.stringify([last.createdAt, String(last._id)]),
        ).toString("base64url")
      : null,
  };
}
