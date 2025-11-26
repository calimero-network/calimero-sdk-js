# Calimero JS SDK Documentation

Use this index to navigate the individual guides in `docs/`.

## Quick Start

- **[Getting Started](getting-started.md)** – scaffold, build, deploy, and test a TypeScript service.
- **[API Reference](api-reference.md)** – generated list of decorators, env helpers, and collection methods.

## Architecture & Runtime

- **[Architecture](architecture.md)** – build pipeline (TS ➝ Rollup ➝ QuickJS ➝ WASI) and data flow diagrams for QuickJS ↔ host interactions.
- **[Collections](collections.md)** – CRDT behaviour, rehydration model, nested structures, best practices by type.
- **[Mergeable (Experimental)](mergeable-js.md)** – current status of merge metadata, prototype decorators, and remaining work required on the host side.

## Patterns & Troubleshooting

- **[Events](events.md)** – modelling event types, emit/handler conventions.
- **[Migration](migration.md)** – legacy JSON state ↔ Borsh migration notes (if upgrading from SDK ≤ 0.1).
- **[Troubleshooting](troubleshooting.md)** – build/runtime issues, common CLI/runtime errors, and diagnostics.

## Examples & Workflows

Each example under `examples/*` contains:

- `src/index.ts` – service logic
- `workflows/*.yml` – Merobox scenario that builds nodes, installs the service, and exercises key paths

Refer to the [repository README](../README.md#examples--workflows) for a curated list.
