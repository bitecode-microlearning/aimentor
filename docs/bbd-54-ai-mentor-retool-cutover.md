# BBD-54 AI Mentor Retool Cutover

Date: 2026-07-13

## Scope

Removed the AI Mentor Worker runtime dependency on the Retool
`AIMentor-UsageHandler` workflow.

## Runtime Change

- `/agent` now validates AI Mentor daily usage directly against the site D1
  database before requesting an ElevenLabs signed session URL.
- `/usage` now updates `users.lastaimentorusage` directly in the site D1
  database.
- The Worker no longer requires `RETOOL_WORKFLOW_URL_AIMENTORHANDLER` or
  `RETOOL_WORKFLOW_SECRET_AIMENTORHANDLER`.

## Cloudflare Bindings

- Default environment: `DB` -> `bitecode-sitedb-dev`
- Production environment: `DB` -> `bitecode-sitedb-prod`

## Validation

- `node -e "import('file:///C:/BiteCode/aimentor/worker/worker.js')..."`
  passed.
- `npx.cmd wrangler deploy --dry-run` passed with `env.DB`
  bound to `bitecode-sitedb-dev`.
- `npx.cmd wrangler deploy --env production --dry-run` passed with `env.DB`
  bound to `bitecode-sitedb-prod`.
- `rg -n "Retool|retool|RETOOL|RETOOL_WORKFLOW|callAIMentorUsageWorkflow|getRetool" -S C:\BiteCode\aimentor`
  returned no live AI Mentor Worker references after the patch.

## Deploy Evidence

- Default Worker: `bitecode-aimentor-worker`
  - URL: `https://bitecode-aimentor-worker.cserenyecztibor.workers.dev`
  - Version ID: `be4058f7-718a-41f8-b0dc-12501a7981e3`
- Production Worker: `bitecode-aimentor-worker-production`
  - URL: `https://bitecode-aimentor-worker-production.cserenyecztibor.workers.dev`
  - Version ID: `47d20c6f-1ecc-4425-b503-8dff35f89fec`

## Remaining BBD-54 Notes

This cutover removes the AI Mentor Retool usage workflow from the runtime path.
BBD-54 should still verify any other Retool workflow disable/archive steps in
Retool itself before final closure.
