import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();
// Use Webpack for the adapter's standalone output. The normal Next.js build
// keeps its default bundler for Vercel and the local Windows worker.
config.buildCommand = "node scripts/cloudflare-next-build.mjs";
export default config;
