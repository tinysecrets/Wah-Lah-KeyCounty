# Deployment and environment contract

## Source of truth and hosting

This repository is a source snapshot of Wah-Lah KeyCounty v5. The production site remains hosted by Hatchable at https://wah-lah-keycounty.hatchable.site. GitHub commits do not automatically deploy the live site.

## Runtime requirements

The API handlers are written for Hatchable's managed serverless runtime. They import the platform SDK with `import { db } from "hatchable"` and export the platform's `access` and `methods` metadata. They are **not drop-in Node.js, Vercel Functions, or Cloudflare Workers handlers** without an explicit runtime adapter and database migration plan. Do not deploy these handlers to another provider unchanged.

The SQL migrations under `migrations/` define the application schema expected by the handlers. Apply them only in a fresh/test database or through the hosting platform's controlled migration workflow; do not replay them against the live database casually. The production database and its applicant records are not part of this repository.

## Required safeguards

- Keep application and admin APIs on the access policies declared in each handler.
- Do not commit API keys, environment files, credentials, applicant records, uploaded property photos, or production database dumps.
- Property submissions must remain pending until owner authorization and listing publication are reviewed.
- Online payment collection remains paused until a provider is approved and an end-to-end payment flow is verified.
- Email delivery is not considered configured until a real delivery test succeeds.

## Safe validation before deployment

1. Review the diff and scan for secrets or private records.
2. Run Hatchable's deploy dry-run and inspect all errors and warnings.
3. Test migrations against a disposable database matching the platform schema.
4. Exercise public listing, submission, application status, and admin authorization paths with test data.
5. Deploy through Hatchable only after the tests pass, then verify the live version and public endpoints.

## Portability

A future move to Vercel, Cloudflare, or another runtime needs a deliberate adapter for request/response handling, access control, and database access. Preserve the current production safeguards and verify schema compatibility before switching providers.
