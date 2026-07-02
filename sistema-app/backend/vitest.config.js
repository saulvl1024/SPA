import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Las pruebas de integración requieren una BD de prueba; se omiten si no hay TEST_DATABASE_URL.
    testTimeout: 15000,
  },
});
