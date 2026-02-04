# Contributing with Cursor

This guide helps contributors get the best experience when working on the Calimero JavaScript SDK using Cursor.

## Getting Started

### 1. Clone and Open in Cursor

```bash
git clone https://github.com/calimero-network/calimero-sdk-js.git
cd calimero-sdk-js
```

Open the folder in Cursor: `File > Open Folder` or `cursor .` from terminal.

### 2. Environment Setup

**Prerequisites:**
- Node.js 18+ (check with `node --version`)
- pnpm 8+ (install with `npm install -g pnpm` if needed)
- Git

**Windows users:** Use WSL (Windows Subsystem for Linux). The build toolchain doesn't support native Windows.

**Install dependencies:**
```bash
pnpm install
```

This runs the postinstall hook that downloads:
- QuickJS compiler (qjsc)
- WASI-SDK (for WASM compilation)
- Binaryen (WASM optimizer)

If postinstall fails, manually run:
```bash
pnpm --filter @calimero-network/calimero-cli-js run install-deps
```

### 3. Build the SDK

```bash
# Build both SDK and CLI packages
pnpm build

# Or build individually
pnpm --filter @calimero-network/calimero-sdk-js build
pnpm --filter @calimero-network/calimero-cli-js build
```

### 4. Run Tests

```bash
# All tests
pnpm test

# Unit tests only
pnpm test:unit

# Integration tests
pnpm test:integration

# SDK package tests with Jest
pnpm --filter @calimero-network/calimero-sdk-js exec jest --runInBand
```

## Repository Structure

Understanding the layout helps Cursor (and you) navigate effectively:

```
calimero-sdk-js/
├── packages/
│   ├── sdk/                    # Core SDK
│   │   ├── src/
│   │   │   ├── decorators/     # @State, @Logic, @Init, @View, @Event
│   │   │   ├── collections/    # CRDT: UnorderedMap, Vector, Counter, etc.
│   │   │   ├── runtime/        # Method dispatch, state management
│   │   │   ├── env/            # Host function bindings
│   │   │   ├── borsh/          # Binary serialization
│   │   │   ├── abi/            # ABI types and helpers
│   │   │   └── utils/          # Serialization utilities
│   │   └── jest.config.js
│   └── cli/                    # Build toolchain
│       ├── src/
│       │   ├── commands/       # build, validate commands
│       │   ├── compiler/       # rollup, quickjs, wasm compilation
│       │   └── abi/            # ABI generation
│       └── builder/
│           └── builder.c       # C wrapper for QuickJS WASM
├── examples/                   # Example services
│   ├── counter/               # Basic Counter CRDT
│   ├── kv-store/              # Key-Value with nested CRDTs
│   └── ...
├── tests/
│   ├── unit/                  # Unit tests
│   └── integration/           # Integration tests
├── docs/                      # Documentation
└── bounties.json              # Contributor bounties
```

### Key Entry Points

- **SDK exports:** `packages/sdk/src/index.ts`
- **Method dispatch:** `packages/sdk/src/runtime/dispatcher.ts`
- **State persistence:** `packages/sdk/src/runtime/root.ts`
- **Host bindings:** `packages/sdk/src/env/api.ts`
- **Build command:** `packages/cli/src/commands/build.ts`

## Cursor Best Practices

### Using Cursor Rules

Create a `.cursorrules` file in the project root for project-specific guidance:

```
# Project conventions
- Use TypeScript strict mode patterns
- Prefer explicit types over inference for public APIs
- Use Borsh serialization for binary data
- Collections are CRDT-backed via host functions
- Decorators are the primary API for service definitions

# Testing
- Add tests for any new functionality
- Unit tests go in packages/sdk/src/__tests__/
- Integration tests go in tests/integration/

# Commits
- Use conventional commit format: feat:, fix:, docs:, refactor:
```

### Composer vs Agent Mode

- **Composer (Ctrl+I):** Best for focused edits - fixing a bug in a single file, adding a test case, updating documentation.
- **Agent (Ctrl+Shift+I):** Best for larger tasks - implementing a new feature across multiple files, refactoring a module, investigating an issue.

### Effective Prompting

When asking Cursor to help with this codebase:

1. **Reference specific files:** "In `packages/sdk/src/collections/UnorderedMap.ts`, the `set` method..."
2. **Mention the architecture:** "This is a TypeScript SDK that compiles to WASM via QuickJS..."
3. **Include context:** "The CRDT collections call host functions through `storage-wasm.ts`..."

## Working on Bounties

### 1. Choose a Bounty

Browse `bounties.json` in the repo root. Each bounty includes:
- **title:** What needs to be done
- **description:** Context and specific locations
- **pathHint:** Where to start looking
- **estimatedMinutes:** Expected effort
- **severity:** Priority level (critical > high > medium > low)

### 2. Understand the Context

Use Cursor to explore the pathHint location:
```
Ctrl+P -> type the file path
```

Or ask Cursor Agent to explain:
```
Explain how the dispatcher.ts file works, focusing on method parameter handling
```

### 3. Make Minimal Changes

- Fix only what the bounty describes
- Don't refactor unrelated code
- Add tests for any new functionality
- Update docs if behavior changes

### 4. Test Your Changes

```bash
# Run specific tests
pnpm --filter @calimero-network/calimero-sdk-js exec jest <test-file>

# Run all tests
pnpm test

# Build and verify
pnpm build
```

### 5. Format and Lint

```bash
# Auto-fix lint issues
pnpm lint:fix

# Format code
pnpm format

# Check formatting (CI will fail if this fails)
pnpm format:check
```

### 6. Commit with Conventional Format

Use conventional commit messages for clear history:

```bash
# Features
git commit -m "feat(collections): add batch operations to UnorderedMap"

# Bug fixes
git commit -m "fix(dispatcher): validate bigint range during conversion"

# Documentation
git commit -m "docs: add JSDoc for View decorator semantics"

# Refactoring
git commit -m "refactor(utils): extract bytesToHex to shared module"
```

## Common Tasks

### Adding a New Collection Method

1. Add the method to the collection class (e.g., `Vector.ts`)
2. Add host function wrapper in `storage-wasm.ts` if needed
3. Add C binding in `builder.c` if it's a new host function
4. Add tests in `packages/sdk/src/__tests__/collections/`
5. Update JSDoc documentation

### Fixing Serialization Issues

The serialization stack has multiple layers:
1. `utils/serialize.ts` - High-level serialize/deserialize
2. `utils/abi-serialize.ts` - ABI-aware Borsh serialization
3. `utils/borsh-value.ts` - Generic JS value serialization
4. `borsh/encoder.ts`, `borsh/decoder.ts` - Low-level Borsh

When fixing serialization:
- Check which layer the issue occurs in
- Add property-based tests for round-trip verification
- Test with edge cases (empty values, max values, null)

### Debugging WASM Build Issues

The build pipeline: TypeScript → Rollup → QuickJS → WASM

```bash
# Verbose build to see all steps
npx calimero-sdk build src/index.ts --verbose

# Check intermediate outputs in build/
ls -la build/
# code.h - QuickJS bytecode
# methods.h - Extracted method names
# abi.h - Embedded ABI
# service.wasm - Final output
```

### Running Examples

```bash
cd examples/counter
pnpm build:manual  # Builds the WASM

# Run with merobox (if installed)
merobox bootstrap run workflows/counter-js.yml
```

## Troubleshooting

### "QuickJS compiler not found"
```bash
pnpm --filter @calimero-network/calimero-cli-js run install-deps
```

### "ABI manifest is required but not available"
The ABI must be embedded during build. Rebuild the example:
```bash
npx calimero-sdk build src/index.ts -o build/service.wasm
```

### Tests failing with "env is not defined"
Tests that require the runtime environment (host functions) can't run in Jest directly. These should be integration tests run with merobox.

### TypeScript errors after pulling
```bash
pnpm clean
pnpm install
pnpm build
```

## Getting Help

- **Issues:** https://github.com/calimero-network/calimero-sdk-js/issues
- **Discord:** https://discord.gg/calimero
- **Docs:** https://docs.calimero.network

## Code of Conduct

Be respectful, constructive, and collaborative. Focus on the code, not the person.
