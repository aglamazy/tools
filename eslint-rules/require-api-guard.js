// ESLint rule: require-api-guard
//
// Every API route file must either:
//   1. Import and call a guard from apiGuard.ts (requireAuth, requireTc, requireTier, requireTierAndTc)
//   2. Have a "// PUBLIC ROUTE" or "// CALLER-KEYED ROUTE" comment explaining why no guard is used
//
// See docs/SECURITY.md for the full policy.

const GUARD_NAMES = ['requireAuth', 'requireTc', 'requireTier', 'requireTierAndTc']
const EXEMPT_COMMENTS = ['PUBLIC ROUTE', 'CALLER-KEYED ROUTE']

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require API route files to use an apiGuard or document why they are public/caller-keyed',
    },
    messages: {
      missingGuard:
        'API route must use a guard from apiGuard.ts ({{ guards }}) or include a "// PUBLIC ROUTE" / "// CALLER-KEYED ROUTE" comment. See docs/SECURITY.md.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename()

    // Only apply to API route files
    if (!filename.includes('/api/') || !filename.endsWith('route.ts')) return {}

    let hasGuardImport = false
    let hasExemptComment = false

    return {
      // Check for import from apiGuard
      ImportDeclaration(node) {
        const source = node.source.value
        if (typeof source === 'string' && source.includes('apiGuard')) {
          const imported = node.specifiers.map(s => s.imported?.name || s.local?.name)
          if (imported.some(name => GUARD_NAMES.includes(name))) {
            hasGuardImport = true
          }
        }
      },

      // Check all comments in the file
      Program() {
        const sourceCode = context.getSourceCode()
        const comments = sourceCode.getAllComments()
        for (const comment of comments) {
          const text = comment.value.trim()
          if (EXEMPT_COMMENTS.some(exempt => text.includes(exempt))) {
            hasExemptComment = true
            break
          }
        }
      },

      'Program:exit'(node) {
        if (!hasGuardImport && !hasExemptComment) {
          context.report({
            node,
            messageId: 'missingGuard',
            data: { guards: GUARD_NAMES.join(', ') },
          })
        }
      },
    }
  },
}
