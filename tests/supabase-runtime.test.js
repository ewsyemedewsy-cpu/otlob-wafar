import test from 'node:test';
import assert from 'node:assert/strict';

test('Supabase read-only adapter uses immutable platform secrets and preserves API guards', async () => {
  const originalEnv = process.env;
  const originalDeno = globalThis.Deno;
  let environmentWrites = 0;
  globalThis.Deno = { env: {
    toObject: () => ({ ...originalEnv, NODE_ENV: 'test', ADMIN_API_KEY:'runtime-test-admin', SUPABASE_URL: 'http://127.0.0.1:1',
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'server-only-fake-secret' }) }),
    set: () => { environmentWrites++; throw Error('platform_environment_is_read_only'); }
  } };
  let server;
  try {
    const {router} = await import('../services/api/supabase-edge/index.ts');
    server = router.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/store-api-preview`;
    const request = async (path, options={}) => { try { return await fetch(base + path, {...options, headers:{...options.headers,Connection:'close'}}); } catch(error) { throw new Error(`${options.method || 'GET'} ${path}: ${error.message}`, {cause:error}); } };
    const health = await request('/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
    const capabilities = await (await request('/capabilities')).json();
    assert.deepEqual(capabilities.deliveryGovernorates, ['FAYOUM']);
    assert.equal(capabilities.deliveryAreas.FAYOUM.length, 5);
    assert.equal(capabilities.onlinePayment, false);
    assert.equal(capabilities.checkoutEnabled, false);
    assert.ok(!JSON.stringify(capabilities).includes('server-only-fake-secret'));
    for (const method of ['POST','PUT','PATCH','DELETE']) {
      const response = await request('/orders', {method});
      assert.equal(response.status, 405);
      assert.deepEqual(await response.json(), {error:'read_only_preview'});
    }
    assert.equal((await request('/admin/orders')).status, 401);
    const deniedTracking=await request('/orders/not-an-id/status',{headers:{Authorization:'Bearer invoice:wrong'}});
    assert.equal(deniedTracking.status,403);
    assert.deepEqual(await deniedTracking.json(),{error:'forbidden'});
    assert.equal((await request('/admin/products',{method:'POST'})).status,401);
    const invalid=await request('/admin/products',{method:'POST',headers:{'x-admin-key':'runtime-test-admin','content-type':'application/json'},body:JSON.stringify({sku:'TEST',title_ar:'اختبار',supplier_cost:265,retail_price:279.99,specifications:{packaging_cost:.4}})});
    assert.equal(invalid.status,400);
    assert.equal((await invalid.json()).error,'price_below_normal_floor');
    assert.equal((await request('/admin/orders/test/dispatch',{method:'POST',headers:{'x-admin-key':'runtime-test-admin'}})).status,405);
    assert.equal((await request('/admin/orders/test/status',{method:'PATCH',headers:{'x-admin-key':'runtime-test-admin','content-type':'application/json'},body:'{}'})).status,400);
    const quote=await request('/admin/pricing/preview',{method:'POST',headers:{'x-admin-key':'runtime-test-admin','content-type':'application/json'},body:JSON.stringify({baseCost:265.4,marketMin:300})});
    assert.equal(quote.status,200);
    assert.ok((await quote.json()).finalPrice>=280);
    assert.equal(environmentWrites, 0);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    Object.defineProperty(process, 'env', {value:originalEnv});
    if (originalDeno === undefined) delete globalThis.Deno;
    else globalThis.Deno = originalDeno;
  }
});
