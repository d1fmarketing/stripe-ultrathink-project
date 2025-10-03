module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: [
    '<rootDir>/temp-autoRefreshTokens',
    '<rootDir>/lambda-deploy',
    '<rootDir>/.netlify'
  ]
};
