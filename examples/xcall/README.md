# Cross-Context Call Example (TypeScript)

JavaScript port of the Rust `apps/xcall-example` contract. It showcases:

- Scheduling cross-context calls through `xcall`
- Emitting events when pings are sent and pongs are received
- Keeping simple state (a pong counter) across invocations

## Commands

```bash
pnpm install
pnpm build
```

The compiled WASM artifact is written to `build/contract.wasm`.

Run the automated Merobox scenario:

```bash
merobox workflows run examples/xcall/workflows/xcall-js.yml
```

