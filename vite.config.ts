import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // The 25 MB single-file host cap is enforced by verify/size-audit.mjs, not by
    // Vite's warning threshold. Keep the warning off so a real regression is visible.
    chunkSizeWarningLimit: 25000,
    sourcemap: false,
  },
  test: {
    // Unit tests cover pure modules (geometry factories, store shape, metric maths).
    // Browser behaviour belongs to the Playwright metric harness in verify/specs.
    environment: 'node',
    include: ['src/**/*.test.ts', 'verify/**/*.test.ts'],
  },
});
