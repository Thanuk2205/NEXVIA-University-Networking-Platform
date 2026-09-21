# Nexvia

A university-focused student profile, internship, and career guidance platform.

## Current scope

Environment and folder scaffolding only. The existing React placeholder and
Express health endpoint remain unchanged. Authentication, database integration,
opportunities, AI CV generation, and notifications are not implemented.

Project requirements are in `../Nexvia_MEMORY_updated.md`.

See [the implementation roadmap](IMPLEMENTATION_PLAN.md) for the recommended
development order, milestones, and completion criteria.

## Development environment

- Node.js 24.13.1 (recorded in `.nvmrc`) and npm.
- React 18 with Vite; Node.js with Express.
- MongoDB for future database integration. The local MongoDB Windows service
  was running during setup; the starter does not connect to it yet.
- Gemini and Gmail credentials are only needed when those modules are developed.

Existing dependency versions are preserved in each package lockfile.

## Folder structure

```text
frontend/
  src/
    assets/         Images and other static assets
    components/     Reusable UI components
    context/        Shared React context
    hooks/          Reusable React hooks
    layouts/        Application layouts
    pages/          Page components
    routes/         Frontend route definitions
    services/       API communication
    styles/         Shared CSS
    utils/          Small reusable helpers
  .env.example
  package.json
backend/
  src/
    config/         Environment and database configuration
    controllers/    Request and response handling
    middleware/     Authentication, authorization, and errors
    models/         Database models
    routes/         API routes
    services/       Business logic and isolated external integrations
    tests/          Backend tests
    utils/          Small reusable helpers
    server.js       Existing starter entry point
  .env.example
  package.json
```

Empty directories contain `.gitkeep` so Git retains the structure.

## Setup on Windows

Run these commands in PowerShell from the repository root on a new checkout:

```powershell
npm.cmd --prefix frontend ci
npm.cmd --prefix backend ci
if (!(Test-Path frontend/.env)) { Copy-Item frontend/.env.example frontend/.env }
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
```

Local `.env` files were created during initial environment setup. Real credentials
must stay in these ignored files. Keep frontend variables public; never place
JWT, Gemini, Gmail, or database credentials in the frontend environment.
The starter currently uses only `PORT` and `FRONTEND_URL`; other variables are
reserved for later implementation. No external credentials are required now.

## Run the existing starter when ready

In one terminal:

```powershell
npm.cmd --prefix backend run dev
```

In another terminal:

```powershell
npm.cmd --prefix frontend run dev
```

Frontend: `http://localhost:5173`. API health: `http://localhost:5000/api/health`.
If port 5173 is busy, free it before starting so the configured frontend origin
matches. Stop each process with Ctrl+C.

Future modules should follow the project memory: backend-enforced JWT roles,
MongoDB profiles, isolated Gemini CV generation, and a dedicated Gmail
notification service. Add their libraries when implementation begins.
