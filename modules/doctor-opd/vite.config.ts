import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'doctor_opd',
      filename: 'remoteEntry.js',
      exposes: {
        './ConsultationTab': './src/ConsultationTab.tsx',
        './DoctorQueueWidget': './src/DoctorQueueWidget.tsx',
      },
      shared: ['react', 'react-dom', '@organella/sdk'],
    }),
  ],
  server: {
    port: 5001,
    cors: true,
  },
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
});
