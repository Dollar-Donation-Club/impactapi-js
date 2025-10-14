import { defineConfig } from "tsup"
import { config } from "dotenv"

// Load environment variables from .env file
config()

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: {
		resolve: true, // Resolve and inline types from dependencies
	},
	sourcemap: true,
	clean: true,
	treeshake: true,
	// Bundle workspace dependencies (@ddc/shared) inline
	noExternal: ["@ddc/shared"],
	// Keep peer dependencies external
	external: ["preact"],
	// Inline environment variables at build time
	define: {
		"process.env.WIDGET_URL": JSON.stringify(
			process.env.WIDGET_URL || "http://localhost:5173"
		),
		"process.env.NODE_ENV": JSON.stringify(
			process.env.NODE_ENV || "development"
		),
	},
})
