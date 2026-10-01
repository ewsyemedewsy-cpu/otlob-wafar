# Supabase Express compatibility probe

Reuses `../src/server.js`; does not replace Node or Cloudflare entry points.
Deploy **only to staging**, as `store-api-preview`, with gateway JWT verification disabled: public read routes are intentional;
admin routes retain API-key authentication and invoices retain HMAC-token checks.
All writes stay blocked independently of credentials.
All non-read methods return 405 before reaching the original API. Admin routes
retain their own `x-admin-key` guard. No keys are returned or embedded in source.

The function package must include this directory, `services/api/src/*.js` except
`cloudflare-worker.js`, and `shared/paymob-status.js`, retaining their relative
paths. Configure `deno.json` as the import map. Server npm versions match the
existing API lockfile. Supabase provides server credentials internally.

Check: `deno check --config services/api/supabase-edge/deno.json services/api/supabase-edge/index.ts`.

This probe is not a checkout deployment. Keep writes blocked until secure admin
provisioning, runtime ingress/shared limits, and hosted checkout have been tested.
