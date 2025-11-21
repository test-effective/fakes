import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.unit.ts'],
          exclude: ['**/*.test.ts', '**/node_modules/**', '**/dist/**'],
          testTimeout: 5000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['**/*.test.ts'],
          exclude: ['**/*.unit.ts', '**/node_modules/**', '**/dist/**'],
          testTimeout: 30000, // Integration tests may take longer
        },
      },
    ],
  },
});
