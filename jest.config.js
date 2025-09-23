module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    '*.js',
    '!jest.config.js',
    '!coverage/**',
    '!*.test.js'
  ],
  testMatch: [
    '**/*.test.js'
  ],
  verbose: true,
  maxWorkers: 1,
  testTimeout: 10000
};