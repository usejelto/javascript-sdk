// dependency-cruiser: the import rules the package layout relies on. `make
// boundaries` runs it over src/ and test/. Every rule says why it exists; an
// exception narrows the rule to the one path it concerns, with the reason.
//
// The package has two entry points that must stay apart: src/browser.ts (the
// `.` and `./browser` exports) runs in a browser, and src/server.ts (the
// `./server` export) holds the server-held API key client.

// A Node.js built-in module, with or without the node: prefix (the list
// names every subpath module, such as fs/promises, itself).
const builtins = `^(node:.+|${process.getBuiltinModule('node:module').builtinModules.join('|')})$`

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A cycle makes module initialization order matter.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Every import resolves; a typo or a removed file fails here rather than in a customer build.',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      comment: 'A package used directly is declared in package.json, not borrowed from another package.',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'shipped-code-uses-runtime-dependencies',
      severity: 'error',
      comment: 'src/ is what the package ships, and an install of it has no devDependencies; the tests in test/ may use them.',
      from: { path: '^src/' },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'browser-entry-not-server',
      severity: 'error',
      comment: 'The browser entry never reaches the server client, which handles a server-held API key, or the server guard, which throws on import.',
      from: { path: '^src/browser\\.ts$' },
      to: { path: '^src/server(\\.browser)?\\.ts$', reachable: true },
    },
    {
      name: 'browser-entry-no-node-builtins',
      severity: 'error',
      comment: 'The browser entry runs in a browser, where no Node.js built-in module exists.',
      from: { path: '^src/browser\\.ts$' },
      to: { path: builtins, reachable: true },
    },
    {
      name: 'server-entry-not-browser',
      severity: 'error',
      comment: 'The server entry never reaches the browser tracker; the two entry points stay separate.',
      from: { path: '^src/server\\.ts$' },
      to: { path: '^src/browser\\.ts$', reachable: true },
    },
  ],
  options: {
    // Tests import the package by its own name, which resolves to the build in
    // dist/ (make boundaries builds first); the build is not crawled.
    doNotFollow: { path: ['node_modules', '^dist/'] },
    exclude: { path: '^(vendor|release-artifacts)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      // Node.js's own conditions: the ones the tests run under.
      conditionNames: ['import', 'node', 'default'],
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.json'],
    },
  },
}
