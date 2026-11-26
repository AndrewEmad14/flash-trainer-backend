// @ts-check
// ESLint flat config: enforces constitution §VIII (no `any`, no console) and the CI rule that
// tests can never be skipped or focused (jest/no-disabled-tests, jest/no-focused-tests).
import eslint from '@eslint/js';
import jest from 'eslint-plugin-jest';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'src/generated/**',
      'prisma/migrations/**',
      'eslint.config.mjs',
      '.specify/**',
      '.claude/**',
      '.docs/**',
      'specs/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      // Nest modules/DTOs are classes with only decorators and static wiring.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Nest declares many option types as classes but expects plain object literals
      // (e.g. NestFactory.create(..., { bufferLogs: true })), so this rule only adds noise.
      '@typescript-eslint/no-unsafe-class-instance-assignment': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    ...jest.configs['flat/recommended'],
    rules: {
      ...jest.configs['flat/recommended'].rules,
      'jest/no-disabled-tests': 'error',
      'jest/no-focused-tests': 'error',
      // jest matchers like expect.any() return `any` by design.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // Test doubles: empty classes stand in for controller classes in fake contexts.
      '@typescript-eslint/no-extraneous-class': 'off',
      'jest/expect-expect': [
        'error',
        {
          assertFunctionNames: [
            'expect',
            'expectCode',
            'expectErrorEnvelope',
            'expectRejected',
            'request.**.expect',
          ],
        },
      ],
    },
  },
);
