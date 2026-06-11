export default {
  testEnvironment: 'node',
  coverageProvider: 'v8',
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
  testTimeout: 10000,
  testResultsProcessor: 'jest-teamcity-reporter'
};
