export function canonicalLocalOrigin(origin) {
  const canonical = new URL(origin);
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  return {
    name: "nexvia-local-origin",
    apply: "serve",
    configureServer(server) {
      if (
        canonical.protocol !== "http:" ||
        !loopbackHosts.has(canonical.hostname) ||
        Number(canonical.port || 80) !== server.config.server.port
      )
        return;
      server.middlewares.use((req, res, next) => {
        if (
          !["GET", "HEAD"].includes(req.method) ||
          !req.headers.accept?.includes("text/html") ||
          !req.headers.host
        )
          return next();
        let requested;
        try {
          requested = new URL(`http://${req.headers.host}`);
        } catch {
          return next();
        }
        if (
          !loopbackHosts.has(requested.hostname) ||
          requested.port !== canonical.port ||
          requested.origin === canonical.origin
        )
          return next();
        // Concatenate with the fixed origin so a //path cannot change the host.
        res.writeHead(307, {
          Location: `${canonical.origin}${req.url}`,
          "Cache-Control": "no-store",
        });
        res.end();
      });
    },
  };
}
