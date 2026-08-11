# Build Wave 0 — Batch 3 API Runtime Baseline

**Status:** Implementation baseline  
**Date:** 2026-08-11

## This batch establishes

- real Node.js API server entrypoint;
- `/health` endpoint;
- `/ready` endpoint;
- per-request correlation ID;
- per-request request ID;
- structured request completion logging;
- normalized 404 and internal error shape;
- graceful SIGINT/SIGTERM shutdown;
- API TypeScript build output;
- automated API runtime smoke testing;
- bootstrap command that uses the committed lockfile.

## Runtime convention

The API foundation intentionally uses Node's built-in HTTP server at this stage.

This keeps Build Wave 0 dependency-light while the core runtime contracts are established. A higher-level HTTP framework may be introduced later only when an implementation requirement justifies it.

## Security boundary

Health endpoints expose non-secret operational metadata only.

Correlation/request identifiers are diagnostic metadata and do not replace authentication or authorization.

## Build Wave 0 exit direction

With Batch 3 complete, Wave 0 should be evaluated against its exit criteria:

- repository/workspace structure;
- reproducible dependency installation;
- frontend shell;
- backend runtime;
- shared contracts;
- migrations baseline;
- tests;
- CI;
- secrets/security baseline;
- health/observability baseline;
- local bootstrap.

If all gates pass, the next implementation phase is:

**Build Wave 1 — Platform Kernel and Authentication**
