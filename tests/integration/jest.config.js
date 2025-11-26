/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  testTimeout: 30000, // Integration tests may take longer
  moduleNameMapper: {
    '^@calimero/sdk$': '<rootDir>/../../packages/sdk/src/index.ts',
    '^@calimero/sdk/(.*)$': '<rootDir>/../../packages/sdk/src/$1',
    '^@calimero/cli$': '<rootDir>/../../packages/cli/src/cli.ts',
  },
};
