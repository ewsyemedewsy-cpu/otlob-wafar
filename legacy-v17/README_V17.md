# Emad Store V17 — Hardening & Production Readiness

V17 keeps the V16 flow and hardens the highest-risk runtime edges.

## Changes
- Payment initiation now requires the authenticated user to own the order.
- Paymob callbacks can be restricted to configured Integration IDs.
- Payment event insertion is race-tolerant for duplicate callbacks.
- Fulfillment jobs are atomically claimed with `FOR UPDATE SKIP LOCKED`.
- Stale `processing` fulfillment jobs are recovered after 15 minutes.
- Bosta webhook authentication supports the exact custom header name configured in Bosta.
- Bosta shipment creation can include `webhookUrl` + `webhookCustomHeaders` when configured.
- WhatsApp can use an approved template when `WHATSAPP_TEMPLATE_NAME` is set; otherwise it falls back to text sending.
- Paymob item lines are loaded from `order_items` when the parent order does not contain embedded items.

## Apply migrations
1. V15_paymob_migration.sql
2. V16_fulfillment_migration.sql
3. V17_hardening_migration.sql

## Production checklist
1. Set Paymob live secret/public keys and the exact live Integration ID(s).
2. Set Paymob transaction callback URL to the deployed `payment-webhook` function and configure HMAC.
3. Set the redirection URL to the customer-facing payment-result page. Do not use it as the payment source of truth.
4. Set Bosta API key, pickup address, and webhook URL. If using custom webhook auth, set the same header name/value in Bosta and the environment.
5. Set WhatsApp Cloud API credentials. For business-initiated notifications outside the customer-service window, configure an approved WhatsApp template and set its name/language.
6. Deploy all Edge Functions and keep all provider secrets server-side.
7. Schedule `fulfillment-dispatch` and `whatsapp-dispatch` every minute, or trigger them from a trusted backend.
8. Run sandbox tests for success, failure, duplicate callbacks, amount mismatch, abandoned checkout, Bosta status changes, and notification retries.

## Important
This package does not contain real merchant credentials and is not itself proof that your external Paymob/Bosta/Meta accounts are configured. Live activation requires those account-side settings.
