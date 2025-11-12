# Private Data Example (TypeScript)

Store node-local secrets alongside replicated contract state using the Calimero JS SDK.

## Features

- Public data persisted via CRDTs (`UnorderedMap`)
- Private note stored with `createPrivateEntry`, scoped to the executing node
- Simple setters/getters for testing private storage behaviour

## Commands

```bash
pnpm install
pnpm run build:manual
```

`build:manual` outputs the contract WASM to `build/contract.wasm`.

### Sample Calls

```bash
# set replicated public note
meroctl call --method setPublicNote --args-json '{"title":"welcome","content":"hello world"}'

# set node-local private note
meroctl call --method setPrivateNote --args-json '{"note":"secret token"}'

# read back private note (returns null on other nodes)
meroctl call --method getPrivateNote
```

