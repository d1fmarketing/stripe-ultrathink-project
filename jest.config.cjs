module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  testMatch: ['**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: [
    '<rootDir>/temp-autoRefreshTokens',
    '<rootDir>/lambda-deploy/.netlify/plugins',
    '<rootDir>/.netlify/plugins'
  ]
};
