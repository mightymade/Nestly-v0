import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single` makes one self-contained HTML file for sharing a preview.
export default defineConfig(({ mode }) => ({
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: mode === 'single' ? { outDir: 'dist-single' } : {},
  // The shared single-file preview always runs on demo data.
  define: mode === 'single' ? { 'import.meta.env.VITE_DATA': JSON.stringify('demo') } : {},
}));
