import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyBuildFiles } from "./copy-build.mjs";

const banner =
`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
Author: Eric Rhys Taylor
*/
`;

const prod = (process.argv[2] === "production");

const context = await esbuild.context({
	banner: {
		js: banner,
	},
	entryPoints: ["main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtins],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: "main.js",
}).catch(() => process.exit(1));

if (prod) {
	// For production builds
	await context.rebuild();
	
	// After building, copy files to Obsidian vaults
	copyBuildFiles();
	
	process.exit(0);
} else {
	// For development builds
	context.watch();

	// Set up a build hook to copy files after each successful rebuild
	context.onEnd(result => {
		if (result.errors.length === 0) {
			console.log("Build successful, copying files to Obsidian vaults...");
			copyBuildFiles();
		}
	});
}
