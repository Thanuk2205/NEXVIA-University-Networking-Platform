# API Gateway

This is an independent Express process. Run `npm start --workspace @nexvia/api-gateway` from the repository root after configuring its environment. Root `npm run dev` starts the complete local stack. Build the image with `docker build -f apps/api-gateway/Dockerfile .`.

The gateway exposes only versioned public routes and strips client-supplied service and actor headers. It has no database.

Health: `/health/live` and `/health/ready`. See the generated OpenAPI contracts in `packages/contracts/openapi` and the operations guide in `docs/OPERATIONS.md`. Tests run through root `npm test`; browser journeys use `npm run test:e2e`.
