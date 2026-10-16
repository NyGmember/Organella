import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'pharmacy_dispense',
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
    port: 5002,
    cors: true,
  },
  preview: {
    port: 5002,
    cors: true,
  },
});
