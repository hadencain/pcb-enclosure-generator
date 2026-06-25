import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000, // WASM load on first manifold test can be slow
    server: { deps: { inline: ['manifold-3d'] } },
  },
});
