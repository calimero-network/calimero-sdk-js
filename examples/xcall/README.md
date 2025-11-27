# Cross-Context Call Example (TypeScript)

JavaScript port of the Rust `apps/xcall-example` service. It showcases:

- Scheduling cross-context calls through `xcall`
- Emitting events when pings are sent and pongs are received
- Keeping simple state (a pong counter) across invocations

The `getCounter` method in `src/index.ts` is decorated with `@View()`. The dispatcher skips persistence when serving these read-only calls, so repeated status checks do not emit storage deltas or gossip redundant updates.

## Commands

```bash
pnpm install
pnpm build
```

The compiled WASM artifact is written to `build/service.wasm`.

Run the automated Merobox scenario:

```bash
merobox workflows run examples/xcall/workflows/xcall-js.yml
```
