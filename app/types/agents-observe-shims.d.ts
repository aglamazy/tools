/**
 * Ambient module shims for agents-observe's package.json "exports" subpaths
 * (aglamazo#240).
 *
 * This project's tsconfig uses `moduleResolution: "node"` (classic Node10
 * resolution), which does not consult a package's "exports" field — only
 * "main"/"types" at the package root. That resolves the bare `agents-observe`
 * root import fine, but subpath imports like `agents-observe/next` and
 * `agents-observe/react` need an explicit bridge to their real dist location
 * (Node10 resolution DOES resolve a literal `<pkg>/<subpath>` file path, it
 * just doesn't know about the "exports" map that points `./next` at
 * `dist/next/index.js`).
 *
 * This shim only affects `tsc`/editor type lookup. Actual runtime resolution
 * (webpack/Next.js bundler) honors "exports" correctly on its own — nothing
 * here changes what code actually runs.
 */
declare module 'agents-observe/next' {
  export * from 'agents-observe/dist/next/index'
}
declare module 'agents-observe/react' {
  export * from 'agents-observe/dist/react/index'
}
