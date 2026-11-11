// Knip: files nothing imports, unused exports and dependencies, and
// dependencies used but not declared. `make deadcode` runs it. Tests count as
// users. Everything a tool loads without an import is named here, with why.
//
// Knip already reads every entry from package.json: `exports` (`.` and
// `./browser` are src/browser.ts, `./server` is src/server.ts and, for the
// `browser` condition, the src/server.browser.ts guard, mapped back from dist/
// through tsconfig.json) and the test files the `node --test` scripts name,
// which import the package by its own name. The entries' exports, the types
// src/server.ts re-exports from src/types.ts among them, are the public API,
// so they are never reported unused.
import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  // The Makefile runs dependency-cruiser (`make boundaries`) and Prettier
  // (`make format-check`); Knip reads package.json scripts, not the Makefile.
  ignoreDependencies: ['dependency-cruiser', 'prettier'],
}

export default config
