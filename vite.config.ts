/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/bus-game/',
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
