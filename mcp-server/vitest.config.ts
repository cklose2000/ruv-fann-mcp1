import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Use native ESM
    globals: false,
    
    // Environment for tests
    environment: 'node',
    
    // Test file patterns
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/types/**',
        'src/test/**',
      ],
    },
    
    // Setup files
    setupFiles: ['./tests/setup/vitest-setup.ts'],
    
    // Test timeout
    testTimeout: 30000,
    
    // Hook timeout
    hookTimeout: 30000,
    
    // Retry flaky tests
    retry: process.env.CI ? 2 : 0,
    
    // Reporter
    reporters: ['default', 'json'],
    
    // Output file for JSON reporter
    outputFile: 'test-results.json',
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
  
  // ESM support
  ssr: {
    noExternal: true,
  },
});