# Emad Store V18

نسخة تطوير مراجعة قبل الإطلاق. اقرأ README_V18_AR.md للنتائج وحدود الاختبار وخطوات الدمج. توجد معاينة خاصة متصلة بقاعدة تجربة منفصلة؛ فتح طلبات العملاء والإطلاق العام لم يتمّا بعد.

### Admin credential digest

The API supports `ADMIN_API_KEY_SHA256`, the hexadecimal SHA-256 digest of a
random admin token (at least 32 random bytes). Keep the original token private;
the administrator sends it using the existing `x-admin-key` header over HTTPS.
This is a random token mechanism, not a password storage scheme. Never put the
token in frontend build variables, URLs, source control, or public files.

When configured, the digest takes precedence over `ADMIN_API_KEY`. Invalid
configuration fails closed; rotating the configured digest invalidates the old
token on subsequent requests. Existing deployments using `ADMIN_API_KEY` remain
compatible. Admin middleware responses disable caching. The staging deployment now configures a server-only digest for owner review.
The owner token is delivered separately and never committed to the public repository.
Authenticated product, supplier and support edits, pricing previews and manual order status updates are permitted in staging.
Checkout, order dispatch, payments and other writes remain closed.

### Launch configuration checks

Run `node scripts/check-launch-config.mjs` for the full supplier-search deployment,
or `node scripts/check-launch-config.mjs --local-cod` for the initial owned-stock
launch with manual delivery in Fayoum cities. The local mode requires public contact
details and the confirmed delivery scope; external provider configuration remains
visible but optional. Both modes support the server-only admin digest and report
configuration presence only. A passing report does not verify stock, delivery,
provider connections, public access, policies, or customer checkout.
