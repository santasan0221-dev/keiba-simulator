import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..');
export default defineConfig({root,plugins:[react(),tailwindcss()],resolve:{alias:{'@':path.join(root,'client/src')}},server:{host:'127.0.0.1',port:8797},build:{outDir:'/tmp/paid-beta-landing-fixture',rollupOptions:{input:path.join(import.meta.dirname,'preview.html')}}});
