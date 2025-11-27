/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    '../../packages/sdk/src/**/*.ts',
    '!../../packages/sdk/src/**/*.d.ts',
    '!../../packages/sdk/src/**/*.test.ts',
  ],
  moduleNameMapper: {
    '^@calimero-network/calimero-sdk-js$': '<rootDir>/../../packages/sdk/src/index.ts',
    '^@calimero-network/calimero-sdk-js/(.*)$': '<rootDir>/../../packages/sdk/src/$1',
  },
};
