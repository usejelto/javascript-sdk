/** Bundler guard: the server entry is server-only and must never reach a browser bundle. */
throw new TypeError('@jelto/analytics/server is server-only; it must not be imported into browser code (it carries a server-held jk_ key)')
