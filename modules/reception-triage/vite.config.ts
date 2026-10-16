import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'reception_triage',
      filename: 'remoteEntry.js',
      exposes: {
        './WorkspaceTab': './src/WorkspaceTab.tsx',
      },
      shared: ['react', 'react-dom', '@organella/sdk'],
    }),
  ],
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  server: {
    port: 5003,
    cors: true,
  },
  preview: {
    port: 5003,
    cors: true,
  },
});
