import { httpServerHandler } from 'cloudflare:node';
import { app } from './server.js';

// The original Node entry point remains available. Workers owns this listener.
app.listen(8080);
export default httpServerHandler({ port: 8080 });
