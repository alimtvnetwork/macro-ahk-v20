/**
 * Marco Extension — Service Worker Bootstrap
 *
 * Installs global shims first (line 8), then the main runtime
 * module loads. ES module ordering guarantees shims execute before
 * service-worker-main.ts runs any top-level code.
 */

import "./sw-shims";
import "./service-worker-main";
