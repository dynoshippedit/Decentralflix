import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Vitest config for the frontend. Node environment by default (pure-logic unit tests);
// individual suites that need a DOM can opt in with a `// @vitest-environment jsdom` pragma.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', '.turbo'],
  },
});
