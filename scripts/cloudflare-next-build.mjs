import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Workers Builds may run `next build` before Wrangler. Do not mix that
// Turbopack output with the adapter's Webpack standalone output.
rmSync(".next", { recursive: true, force: true });
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
