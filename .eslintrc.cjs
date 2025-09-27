// Minimal ESLint configuration for Node.js/TypeScript project
module.exports = {
    root: true,
    env: {
        node: true,
        es6: true,
    },
    extends: [
        'eslint:recommended',
    ],
    parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
    },
    ignorePatterns: [
        'node_modules/',
        'lib/',
        '*.d.ts',
        'coverage/',
        '.git/',
        'tsconfig.tsbuildinfo',
        '*.backup',
        '*.async-backup'
    ],
    rules: {
        // Basic JavaScript rules
        'no-console': 'warn',
        'no-warning-comments': 'warn',
        'no-unused-vars': ['error', {'args': 'none'}],
    },
    overrides: [
        {
            // TypeScript files
            files: ['**/*.ts', '**/*.tsx'],
            parser: '@typescript-eslint/parser',
            plugins: ['@typescript-eslint'],
            extends: [
                'eslint:recommended',
                'plugin:@typescript-eslint/recommended',
            ],
            parserOptions: {
                ecmaVersion: 2018,
                sourceType: 'module',
            },
            rules: {
                // TypeScript-specific rules
                '@typescript-eslint/no-explicit-any': 'warn',
                '@typescript-eslint/ban-ts-comment': 'warn',
                '@typescript-eslint/explicit-function-return-type': 'off',
                '@typescript-eslint/no-unused-vars': ['error', {
                    'argsIgnorePattern': '^_',
                    'varsIgnorePattern': '^_',
                }],
                // Turn off base rule that conflicts with @typescript-eslint
                'no-unused-vars': 'off',
            }
        },
        {
            // Test files - very relaxed
            files: ['**/*.test.ts', '**/*.test.tsx'],
            rules: {
                'no-console': 'off',
                '@typescript-eslint/no-explicit-any': 'off',
                '@typescript-eslint/no-unused-vars': 'off',
            }
        }
    ]
};