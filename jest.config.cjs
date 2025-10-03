/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(test).ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  clearMocks: true,
  modulePathIgnorePatterns: [
    '<rootDir>/temp-autoRefreshTokens',
    '<rootDir>/lambda-deploy',
    '<rootDir>/.netlify'
  ]
};
