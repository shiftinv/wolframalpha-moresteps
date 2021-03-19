module.exports = {
    env: {
        'browser': true,
        'es6': true,
        'node': true
    },
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'airbnb-typescript/base'
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        'project': 'tsconfig.json',
        'sourceType': 'module'
    },
    plugins: [
        '@typescript-eslint'
    ],
    ignorePatterns: [
        'node_modules/**',
        // 'src/static/**'
    ],
    rules: {
        'max-classes-per-file': 'off',
        // 'no-await-in-loop': 'off',
        'no-console': 'off',
        'no-continue': 'off',
        'no-multi-spaces': ['error', {'ignoreEOLComments': true}],
        'no-multiple-empty-lines': ['error', {'max': 2, 'maxEOF': 1}],
        'no-param-reassign': ['error', {'props': false}],
        'no-restricted-syntax': ['error', 'LabeledStatement', 'WithStatement'],
        'no-void': ['error', {'allowAsStatement': true}],
        'object-shorthand': ['error', 'methods'],
        'quote-props': ['error', 'consistent-as-needed'],
        '@typescript-eslint/comma-dangle': 'off',
        '@typescript-eslint/indent': ['error', 4, {
            'SwitchCase': 0,
            'ignoredNodes': ['TSTypeParameterInstantiation']
        }],
        '@typescript-eslint/lines-between-class-members': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-use-before-define': ['error', {'classes': false}],
        '@typescript-eslint/restrict-template-expressions': 'off',
        '@typescript-eslint/return-await': 'off',
    }
};
