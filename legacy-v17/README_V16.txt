Emad Store V16 — Full Order Lifecycle

Flow:
1. Checkout creates/uses an order.
2. Online payment calls payment-create.
3. Paymob Unified Checkout handles payment.
4. payment-webhook verifies Paymob HMAC and amount, then marks the order paid.
5. A fulfillment job is queued for the paid order.
6. fulfillment-dispatch creates the Bosta shipment server-side and stores the AWB.
7. Bosta webhook updates shipment/order status.
8. WhatsApp notifications are queued from payment and shipment events.
9. whatsapp-dispatch sends queued notifications with retry handling.
10. Admin API/connected admin console can inspect and manage the lifecycle.

IMPORTANT
- Apply V15_paymob_migration.sql first, then V16_fulfillment_migration.sql.
- Deploy Edge Functions; never put Paymob, Bosta, Supabase service-role, or WhatsApp secrets in browser code.
- Schedule fulfillment-dispatch and whatsapp-dispatch every minute (or trigger fulfillment-dispatch from your backend after a paid event).
- Configure Paymob notification_url and HMAC secret.
- Configure Bosta webhook URL and signature secret if enabled for the account.
- Run sandbox tests before production credentials.
