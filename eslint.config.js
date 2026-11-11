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
    // Configuration that runs in Node.js.
    files: ['*.config.js', '*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
)
