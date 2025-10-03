module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^(.*)\\.js$': '$1'
  },
  modulePathIgnorePatterns: [
    '<rootDir>/temp-autoRefreshTokens',
    '<rootDir>/.netlify',
    '<rootDir>/landing-site/.netlify'
  ]
};
