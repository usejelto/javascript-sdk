// ESLint for the package source and its tests. `make lint` runs it; `tsc`
// (`npm run check`) owns type errors, so this config adds the recommended
// JavaScript and TypeScript rules on top.
import js from '@eslint/js'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  // Build output, release staging and vendored snapshots (their producers lint them).
  { ignores: ['dist/', 'vendor/', 'release-artifacts/'] },
  js.configs.recommended,
  ts.configs.recommended,
  {
    // Configuration that runs in Node.js, and the opengrep rule test cases,
    // written as Node modules.
    files: ['.opengrep/**', '*.config.js', '*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // dependency-cruiser reads its configuration as CommonJS.
    files: ['.dependency-cruiser.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
)
