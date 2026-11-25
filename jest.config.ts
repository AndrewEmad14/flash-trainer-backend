import type { Config } from 'jest';

/**
 * Unit-test config (constitution §II). Spec files sit next to the code they test.
 * Coverage gate: 90% lines / 85% branches; CI fails below it.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  // The generated Prisma client imports its own .ts files with .js extensions (nodenext).
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testEnvironment: 'node',
  collectCoverageFrom: [
    '**/*.ts',
    // Wiring and declarations only. Exercised by e2e tests, they contain no logic to unit-test.
    '!main.ts',
    '!app.setup.ts',
    '!swagger.setup.ts',
    '!openapi.ts',
    '!**/*.module.ts',
    '!**/dto/**',
    '!**/index.ts',
    '!generated/**',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { lines: 90, branches: 85 },
  },
};

export default config;
