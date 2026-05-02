# Organization and Membership Foundation API

## Overview

Build the Phase 0 backend surfaces for organizations, memberships, and invitations. Sits on top of Firebase identity (issue #16). All application tables, service logic, and Hono endpoints for the org/invite lifecycle are in scope.

## Goals

1. An authenticated user can create an organization and become its initial Admin.
2. Admins can issue an invite with a role and email target.
3. Invite lookup (`GET /api/invites/:token`) returns enough data to drive invite-acceptance UI.
4. Organization slug uniqueness is enforced (409 on duplicate).
5. Membership uniqueness prevents duplicate rows for the same user/org pair (409 on re-join).

## Constraints

- Firebase identity and base user sync are out of scope (owned by issue #16).
- Simplicity bias: change only what is required to satisfy the locked goals.
- All verification commands must pass before declaring any stage done.

## Success Criteria

- `bun run format:check` exits 0
- `bun run build` exits 0
- `bun run test` exits 0 with all tests passing

## Non-goals

- Frontend UI for org onboarding (issue #17 and subsequent)
- Organization members list endpoint (`GET /api/organizations/:slug/members`)
- Name availability check endpoint (`GET /api/organizations/availability`)
- Multi-org membership per user
- Production deployment infrastructure

## Technical design

### Application tables (created via `runMigrations()` on startup)

```
organizations  — id, name, slug (UNIQUE), created_at
users          — id, firebase_uid (UNIQUE), email (UNIQUE), display_name, created_at
memberships    — id, organization_id, user_id (UNIQUE), role, origin, joined_at, welcome_dismissed_at
invites        — id, token (UNIQUE), organization_id, email, role, invited_by_user_id, created_at, accepted_at
```

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/session` | Optional | Current user + membership snapshot |
| POST | `/api/organizations` | Required | Create org; caller becomes Admin |
| POST | `/api/invites` | Required | Admin creates invite |
| GET | `/api/invites/:token` | None | Invite details for acceptance UI |
| POST | `/api/invites/:token/accept` | Required | Join org via invite |
| GET | `/api/organizations/:slug` | Required | Org landing payload |
| POST | `/api/organizations/:slug/welcome/dismiss` | Required | Dismiss welcome banner |

### Key files

- `packages/common/src/organization.ts` — shared types, roles, validation
- `packages/backend/src/routes/api-router.ts` — Hono route definitions
- `packages/backend/src/services/organization-service.ts` — business logic
- `packages/backend/src/repo/organization-repository.ts` — interface
- `packages/backend/src/repo/postgres-organization-repository.ts` — Postgres impl
- `packages/backend/src/repo/in-memory-organization-repository.ts` — test impl
- `packages/backend/tests/organization-routes.test.ts` — integration tests
