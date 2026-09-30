import {defineConfig} from 'vite';
export default defineConfig({base:process.env.WEB_BASE_PATH||'/',build:{sourcemap:false}});
