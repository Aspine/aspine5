import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import preact from "@astrojs/preact";

export default defineConfig({
	output: "static",
	adapter: node({ mode: "standalone" }),
	integrations: [preact()],
	trailingSlash: "never",
	build: {
		format: "file",
		inlineStylesheets: "auto"
	},
	prefetch: {
		prefetchAll: true,
		defaultStrategy: "hover"
	},
	server: {
		host: true
	},
	devToolbar: {
		enabled: false
	},
	security: {
		checkOrigin: true
	},
	vite: {
		ssr: {
			external: [
				"puppeteer",
				"puppeteer-extra",
				"puppeteer-extra-plugin-stealth"
			]
		}
	}
});
