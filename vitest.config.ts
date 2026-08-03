import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
      thresholds: {
        statements: 85,
        lines: 85,
        branches: 75,
        functions: 75,
      },
    },
  },
});
