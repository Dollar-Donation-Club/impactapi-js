import { defineConfig } from "tsup"

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
})
