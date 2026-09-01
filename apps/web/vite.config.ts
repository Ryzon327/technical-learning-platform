import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    /*
     * WP-I — `public/` is a DEVELOPMENT-ONLY static root.
     *
     * It holds one thing: the architecture fixture's topology figure, which a
     * UAT reviewer must be able to load at http://localhost:5173 and which must
     * never reach a learner. A curriculum asset URI has to be an absolute http
     * or https URL (`isAllowedCurriculumAssetUri`), so the figure has to be
     * SERVED rather than imported — and Vite copies `public/` into `dist/` by
     * default, which would ship fixture content in the production bundle.
     *
     * Turning the copy off is the smallest way to keep the fixture out. It is
     * the same isolation the UAT harness itself has, reached differently:
     * `App.tsx` uses `import.meta.env.DEV`, this uses the build.
     *
     * CONSEQUENCE FOR LATER WORK: nothing in `public/` is emitted. A real
     * production asset must be imported through the bundler, or served by the
     * storage provider — not dropped in this directory. `verify-wpi.sh` asserts
     * both halves, so a file added here that a build then omits fails the gate
     * rather than going missing quietly in production.
     */
    copyPublicDir: false
  }
});
