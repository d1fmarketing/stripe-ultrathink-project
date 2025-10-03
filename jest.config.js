/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  clearMocks: true,
  modulePathIgnorePatterns: [
    '<rootDir>/temp-autoRefreshTokens',
    '<rootDir>/.netlify',
    '<rootDir>/landing-site/.netlify'
  ],
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest']
  }
};
