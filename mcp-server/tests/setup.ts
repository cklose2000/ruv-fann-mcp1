// Test setup file - runs before all tests
import { jest } from '@jest/globals';
import winston from 'winston';

// Suppress logs during tests unless explicitly needed
winston.configure({
  level: process.env.LOG_LEVEL || 'error',
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Global test timeout
jest.setTimeout(10000);

// Mock environment variables
process.env.RUV_FANN_CORE_URL = 'http://127.0.0.1:8090';
process.env.RUV_FANN_SWARM_URL = 'http://127.0.0.1:8081';
process.env.RUV_FANN_MODEL_URL = 'http://127.0.0.1:8082';
process.env.GCP_MCP_BACKEND_URL = 'http://127.0.0.1:8080';
process.env.GCP_MCP_SECRET = 'test-secret';

// Clean up test databases after each test suite
afterAll(async () => {
  // Cleanup will be handled by individual test suites
});