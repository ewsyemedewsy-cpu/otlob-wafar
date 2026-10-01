import { httpServerHandler } from 'cloudflare:node';
import { isIP } from 'node:net';
import { app } from './server.js';

// The original Node entry point remains available. Workers owns this listener.
app.listen(8080);
const handler = httpServerHandler({ port: 8080 });
export default {
  fetch(request, env, context) {
    // Only the Workers ingress supplies the client address. Never pass a
    // caller-provided proxy chain through to Express's trust-proxy logic.
    const headers = new Headers(request.headers);
    const clientAddress = headers.get('cf-connecting-ip') || '';
    headers.delete('x-forwarded-for');
    headers.delete('x-real-ip');
    headers.delete('forwarded');
    if (isIP(clientAddress)) headers.set('x-forwarded-for', clientAddress);
    return handler.fetch(new Request(request, { headers }), env, context);
  },
};
