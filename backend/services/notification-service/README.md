# Notification Service

This is an independent Express process. Run `npm start --workspace @nexvia/notification-service` from the repository root after configuring its environment. Root `npm run dev` starts the complete local stack. Build the image with `docker build -f services/notification-service/Dockerfile .`.

Owns `nexvia_notification` only. Its MongoDB user must have readWrite privileges on that database and no access to other service databases. Internal calls require signed service tokens and route-specific caller permissions.

Health: `/health/live` and `/health/ready`. See the generated OpenAPI contracts in `packages/contracts/openapi` and the operations guide in `docs/OPERATIONS.md`. Tests run through root `npm test`; browser journeys use `npm run test:e2e`.
