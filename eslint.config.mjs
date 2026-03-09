import tsParser from "@typescript-eslint/parser";
import noInlineTableLists from "./eslint-rules/no-inline-table-lists.js";

const localPlugin = {
  rules: {
    "no-inline-table-lists": noInlineTableLists,
  },
};

export default [
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "dist/**", ".turbo/**"]
  },
  {
    files: ["app/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      local: localPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      // Prevent native browser dialogs
      "no-alert": "error",
      "no-restricted-globals": [
        "error",
        {
          name: "confirm",
          message: "Use YesNoModal component from @/app/components/YesNoModal instead of native confirm(). If you really need native confirm (e.g., in development/debugging), add: // eslint-disable-next-line no-restricted-globals"
        },
        {
          name: "alert",
          message: "Use custom Modal component from @/app/components/Modal instead of native alert(). If you really need native alert (e.g., in development/debugging), add: // eslint-disable-next-line no-restricted-globals"
        },
        {
          name: "prompt",
          message: "Use custom Modal component from @/app/components/Modal instead of native prompt(). If you really need native prompt (e.g., in development/debugging), add: // eslint-disable-next-line no-restricted-globals"
        }
      ],
      // Prevent inline arrays of synced DB table names — use SYNCED_DB_TABLES from syncedTables.ts
      "local/no-inline-table-lists": "error",
      // Limit file length
      "max-lines": ["error", { max: 850, skipBlankLines: true, skipComments: true }],
      // Enforce localStorage access only through store classes
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='localStorage'][property.name='getItem']",
          message: "Direct localStorage.getItem() should only be used in store files (app/stores/). Use store classes (transactionStore, subjectStore) instead to maintain the repository pattern. Store files: app/stores/transactionStore.ts, app/stores/subjectStore.ts"
        },
        {
          selector: "MemberExpression[object.name='localStorage'][property.name='setItem']",
          message: "Direct localStorage.setItem() should only be used in store files (app/stores/). Use store classes (transactionStore, subjectStore) instead to maintain the repository pattern. Store files: app/stores/transactionStore.ts, app/stores/subjectStore.ts"
        },
        {
          selector: "MemberExpression[object.name='localStorage'][property.name='removeItem']",
          message: "Direct localStorage.removeItem() should only be used in store files (app/stores/). Use store classes (transactionStore, subjectStore) instead to maintain the repository pattern. Store files: app/stores/transactionStore.ts, app/stores/subjectStore.ts"
        },
        {
          selector: "MemberExpression[object.name='localStorage'][property.name='clear']",
          message: "Direct localStorage.clear() should only be used in store files (app/stores/). Use store classes (transactionStore, subjectStore) instead to maintain the repository pattern. Store files: app/stores/transactionStore.ts, app/stores/subjectStore.ts"
        }
      ]
    }
  },
  // Allow localStorage in store files and Settings component
  {
    files: ["app/stores/**/*.{ts,tsx}", "app/components/Settings.tsx", "app/utils/directoryStorage.ts"],
    rules: {
      "no-restricted-syntax": "off"
    }
  },
  // Allow inline table lists in DB migrations (frozen historical lists)
  {
    files: ["app/db/**/*.ts"],
    rules: {
      "local/no-inline-table-lists": "off"
    }
  }
];
