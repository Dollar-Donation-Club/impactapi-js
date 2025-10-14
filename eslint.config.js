import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"

export default [
	{ ignores: ["dist"] },
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: 2020,
			globals: globals.browser,
			parser: tseslint.parser,
			parserOptions: {
				project: ["./tsconfig.json"],
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
		},
		rules: {
			...js.configs.recommended.rules,
			...tseslint.configs.recommended.rules,

			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "warn",

			"no-console": "warn",
			"no-debugger": "error",
			"prefer-const": "error",
			"no-var": "error",
		},
	},
]