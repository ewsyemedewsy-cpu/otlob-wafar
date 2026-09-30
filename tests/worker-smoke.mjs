import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
// Miniflare is provided by the exactly pinned Wrangler development dependency.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const directory = await mkdtemp(join(tmpdir(), 'otlob-worker-test-'));
let runtime;
try {
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy',
    '--config', 'wrangler.testing.json', '--dry-run', '--outdir', directory], {
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: 'pipe',
  });
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, modulesRoot: directory, scriptPath: join(directory, 'cloudflare-worker.js'),
    compatibilityDate: '2026-09-30', compatibilityFlags: ['nodejs_compat'],
    bindings: { API_RUNTIME: 'worker', SUPABASE_URL: 'https://local-test.invalid',
      SUPABASE_SECRET_KEY: 'local-test-not-a-real-key', ADMIN_API_KEY: 'local-test-admin',
      PUBLIC_ORIGIN: 'https://store-test.invalid', PAYMOB_ONLINE_ENABLED: 'false',
      APPROVED_SOURCE_FEEDS: '[]' },
  }));
  const request = (path, options) => runtime.dispatchFetch('https://worker-test.invalid' + path, options);
  const health = await request('/health', { headers: { Origin: 'https://store-test.invalid' } });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  assert.equal(health.headers.get('access-control-allow-origin'), 'https://store-test.invalid');
  const foreign = await request('/health', { headers: { Origin: 'https://foreign.invalid' } });
  assert.notEqual(foreign.headers.get('access-control-allow-origin'), 'https://foreign.invalid');
  assert.equal((await (await request('/capabilities')).json()).onlinePayment, false);
  assert.equal((await request('/admin/orders')).status, 401);
  assert.equal((await request('/admin/orders/not-an-id/details', {
    headers: { 'x-admin-key': 'local-test-admin' },
  })).status, 400);
  assert.equal((await request('/orders', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: '{}' })).status, 400);
  assert.equal((await request('/webhooks/paymob', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: '{"obj":{"success":true}}' })).status, 401);
  assert.equal((await request('/catalog/search?q=phone')).status, 503);
  const quote = await request('/admin/pricing/preview', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-key': 'local-test-admin' },
    body: JSON.stringify({ baseCost: 1000, marketMin: 1100,
      paymentFees: { rate: .0275, fixed: 3, taxRate: 0 } }),
  });
  assert.equal(quote.status, 200);
  assert.ok((await quote.json()).profitRate >= .05);
  console.log('Workers runtime: health, CORS, administration guards, invalid checkout, payment signature and pricing passed.');
} finally {
  if (runtime) await runtime.dispose();
  await rm(directory, { recursive: true, force: true });
}
