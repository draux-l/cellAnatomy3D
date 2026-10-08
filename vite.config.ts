import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Drops the Draco decoder assets three emits but the app never fetches.
 *
 * `three/examples/jsm/loaders/DRACOLoader.js` resolves five decoder files from module-level
 * `new URL('../libs/draco/...', import.meta.url)` expressions, so Vite must emit all of them — even
 * though `src/scene/models/useCellModel.ts` calls `setDecoderPath('/draco/')`, which **replaces every
 * one of those URLs** with the copies served from `public/draco/` (`DRACOLoader.js:102-121`). The five
 * emitted files are therefore dead weight: ~1.25 MB that no request ever touches, duplicated
 * byte-for-byte by the public copies. Removing them keeps the decoder path single-sourced and the
 * static payload inside its budget.
 *
 * Only the hashed, build-emitted assets match; the `public/draco/` copies (`draco/draco_decoder.js`,
 * no hash) are copied by the public directory and never enter this bundle.
 */
function dropDeadDracoAssets(): Plugin {
  const deadDraco = /(?:^|\/)draco_(?:decoder|wasm_wrapper)-[^/]+\.(?:js|wasm)$/;

  return {
    name: 'drop-dead-draco-assets',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (deadDraco.test(fileName)) {
          delete bundle[fileName];
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), dropDeadDracoAssets()],
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
