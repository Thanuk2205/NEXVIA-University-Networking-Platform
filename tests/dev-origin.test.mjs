import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { canonicalLocalOrigin } from "../frontend/dev-origin.js";

test("Local page aliases redirect to the trusted origin without rewriting API requests", async () => {
  let middleware;
  canonicalLocalOrigin("http://localhost:5173").configureServer({
    config: { server: { port: 5173 } },
    middlewares: {
      use(handler) {
        middleware = handler;
      },
    },
  });
  const server = http.createServer((req, res) => {
    middleware(req, res, () => {
      res.writeHead(204);
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  async function check(path, host, accept = "text/html", method = "GET") {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path,
          method,
          headers: { host, accept },
        },
        (res) => {
          res.resume();
          res.once("end", () =>
            resolve({
              status: res.statusCode,
              headers: new Headers(res.headers),
            }),
          );
        },
      );
      req.once("error", reject);
      req.end();
    });
  }
  try {
    const alias = await check("/login?next=%2Fprofile", "127.0.0.1:5173");
    assert.equal(alias.status, 307);
    assert.equal(
      alias.headers.get("location"),
      "http://localhost:5173/login?next=%2Fprofile",
    );
    assert.equal(alias.headers.get("cache-control"), "no-store");
    const path = await check("//example.com/path", "127.0.0.1:5173");
    assert.equal(
      new URL(path.headers.get("location")).origin,
      "http://localhost:5173",
    );
    for (const args of [
      ["/login", "localhost:5173"],
      ["/login", "example.com:5173"],
      ["/login", "127.0.0.1:5174"],
      ["/api/v1/auth/csrf", "127.0.0.1:5173", "application/json"],
      ["/api/v1/auth/login", "127.0.0.1:5173", "text/html", "POST"],
    ])
      assert.equal((await check(...args)).status, 204);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Local origin redirects are disabled for other ports and hosted HTTPS origins", () => {
  for (const [origin, port] of [
    ["http://localhost:5173", 5301],
    ["https://portal.example.com", 5173],
    ["http://portal.example.com:5173", 5173],
  ]) {
    let installed = false;
    canonicalLocalOrigin(origin).configureServer({
      config: { server: { port } },
      middlewares: {
        use() {
          installed = true;
        },
      },
    });
    assert.equal(installed, false);
  }
});
