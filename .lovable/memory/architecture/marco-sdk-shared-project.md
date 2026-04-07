# Memory: architecture/marco-sdk-shared-project
Updated: 2026-03-23

The `marco.*` SDK is delivered as a **separate shared project** (`standalone-scripts/marco-sdk/`) that other projects declare as a dependency. It provides namespaced access to extension services: `marco.auth` (token resolution, JWT inspection), `marco.cookies` (raw `.get()` + detailed `.getDetail()`), `marco.config` (project settings), `marco.xpath` (named XPath with sync DOM resolution), `marco.kv` (project-scoped KV store), and `marco.files` (file BLOB storage). All methods use the `window.postMessage` → content script relay → background bridge. The SDK is injected first via topological dependency sort, and the `window.marco` namespace is frozen. Spec: `spec/12-devtools-and-injection/sdk-convention.md`.
