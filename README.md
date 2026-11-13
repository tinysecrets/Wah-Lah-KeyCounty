# Wah-Lah KeyCounty

This repository is the reviewed source mirror for the live Hatchable application.

- Production application: https://wah-lah-keycounty.hatchable.site
- Production platform: Hatchable
- Production version mirrored: 48 (source inventory checked 2026-11-13)
- Source of truth for the running site: Hatchable
- GitHub-to-Hatchable deployment: **not automatic**

## Synchronization

Hatchable source is mirrored into GitHub by an explicit, reviewed sync. A commit or merge in this repository does not deploy to Hatchable. Keep production changes and GitHub source aligned through a deliberate review and sync process.

The `sync/hatchable-v48-2026-11-13` branch contains the source snapshot prepared from Hatchable version 48. Review and merge that branch before treating GitHub `main` as the current mirror.

## Repository contents

The mirror includes the Hatchable application API routes, page modules, public HTML/CSS and site files, SQL migrations, database source contract, growth-pulse library, seed script, and `hatchable.toml` schedule/secret-name declarations.

## Exclusions and security

The sync intentionally excludes:

- Runtime secrets, credentials, and production environment values. Secret *names* and descriptions in `hatchable.toml` are configuration metadata only.
- Production database contents, application records, customer information, and runtime state.
- Binary property/listing photos, which remain managed by the hosted Hatchable project.
- Hatchable-generated `AGENTS.md`, which is virtual platform output and must not be edited or committed.
- `public/.env.example`, because environment templates do not belong inside a publicly served directory.

Never commit `.env` files containing real values, API keys, webhook secrets, payment credentials, or production data.

## Important operating notes

- Review SQL migrations before applying them to any database. Mirroring migrations does not execute them.
- Payment provider code and secret declarations in source do not prove that live checkout is enabled or approved.
- Verify payment credentials, merchant authorization, webhook delivery, and end-to-end transactions separately before accepting payments.
- Hatchable remains the live production system unless a separate, explicitly approved deployment process is performed.
