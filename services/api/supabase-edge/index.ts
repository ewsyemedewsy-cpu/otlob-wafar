// Read-only staging preview. Admin/invoice routes retain custom authentication.
// Gateway JWT verification is disabled to allow the public catalog reads.
import process from 'node:process';
import express from 'express';
// Edge Runtime exposes environment variables read-only. Configure the Node shim
// with a separate object; never call Deno.env.set or mutate platform secrets.
const platformEnv = Deno.env.toObject();
const keys = platformEnv.SUPABASE_SECRET_KEYS;
Object.defineProperty(process, 'env', { value: {
  ...platformEnv,
  API_RUNTIME: 'worker',
  ORDER_GOVERNORATES: 'FAYOUM',
  ORDER_DELIVERY_SCOPE: 'fayoum_cities',
  PAYMOB_ONLINE_ENABLED: 'false',
  CHECKOUT_ENABLED: 'false',
  PUBLIC_ORIGIN: 'https://otlob-wafar-fayoum-preview.ewsyemedewsy.chatgpt.site',
  ...(keys ? { SUPABASE_SECRET_KEY: JSON.parse(keys).default } : {})
} });
const { app } = await import('../src/server.js');
const router = express();
router.use((req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return res.status(405).json({ error: 'read_only_preview' });
  }
  next();
});
router.use('/store-api-preview', app);
export { router };
if (platformEnv.NODE_ENV !== 'test') router.listen(8000);
