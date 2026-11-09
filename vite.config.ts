import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  // Explicitly define the server and HMR ports
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
      host: "127.0.0.1",
    },
    host: "127.0.0.1"
  },
  plugins: [
    react(),
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      input: {
        manager: 'manager.html'
      }
    }
  }
});