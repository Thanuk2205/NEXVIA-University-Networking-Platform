# Archived prototype

This directory retains the earlier monolithic backend for reference and the read-only legacy migration source. The active Nexvia application lives under `apps/`, `services/` and `frontend/src/features/` and is launched through the **repository root** `npm run dev` command.

The prototype uses obsolete role/approval/privacy rules and includes the earlier Socket.io design. It is excluded from root workspaces and container contexts and must not be used for the updated submission or deployment. New service database schemas differ from the prototype. Follow the root README and `docs/OPERATIONS.md`; use the explicit migration tool rather than connecting prototype code to the new owner databases.
