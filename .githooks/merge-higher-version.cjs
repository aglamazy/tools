#!/usr/bin/env node
//
// Custom merge driver: keep the package file with the higher semver version.
//
// Git calls this as:  node .githooks/merge-higher-version.js %O %A %B
//   %O = ancestor (base)
//   %A = ours     (current branch) — this file is also the output target
//   %B = theirs   (branch being merged in)
//
// Exit 0 = merge resolved (result written to %A)
// Exit 1 = fall back to git's normal merge
//

const fs = require('fs')

const [,, ancestorPath, oursPath, theirsPath] = process.argv

const readVersion = filePath => {
  try {
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const compareSemver = (a, b) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

const oursVersion = readVersion(oursPath)
const theirsVersion = readVersion(theirsPath)

const cmp = compareSemver(oursVersion, theirsVersion)

if (cmp === 0) {
  // Same version — let git do its normal three-way merge
  process.exit(1)
}

if (cmp > 0) {
  // Ours is higher — keep ours (already in %A, nothing to do)
  console.log(`merge-higher-version: keeping ours (${oursVersion} > ${theirsVersion})`)
  process.exit(0)
}

// Theirs is higher — copy theirs into %A
console.log(`merge-higher-version: taking theirs (${theirsVersion} > ${oursVersion})`)
fs.copyFileSync(theirsPath, oursPath)
process.exit(0)
