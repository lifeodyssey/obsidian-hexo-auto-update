module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!**/node_modules/**',
    '!**/vendor/**',
    '!**/__tests__/**'
  ],
  coverageReporters: ['text', 'lcov'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
}; 
