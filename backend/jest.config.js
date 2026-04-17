module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/config/**'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  testTimeout: 10000,
  verbose: true
};
