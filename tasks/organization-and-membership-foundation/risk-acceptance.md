# Risk Acceptance

## Accepted Risks

### Inline schema migration
The Postgres repository creates tables via `runMigrations()` on startup using `CREATE TABLE IF NOT EXISTS`. There is no versioned migration history. This is intentional for Phase 0 — a migration framework can be added later without changing the public API surface.

### One membership per user
The `memberships.user_id` UNIQUE constraint limits each user to one organization. This is a deliberate Phase 0 simplification; removing it later requires a schema change and service-layer updates.

### Name == slug
Organization names are stored as lowercase-hyphen slugs (the name and slug columns hold the same normalized value). The spec allows richer display names, but this simplification is intentional for Phase 0 and accepted by the task owner.
