import { build } from "esbuild";
import { mkdir } from "fs/promises";
import path from "path";

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, "build");

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(projectRoot, "server.ts")],
  outfile: path.join(outDir, "server.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  packages: "external",
});

console.log("Server bundled in build/server.mjs");
