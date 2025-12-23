# Client Generation for JS SDK Apps

This guide explains how to generate TypeScript client code from ABI.json files for Calimero services built with `calimero-sdk-js`.

## Overview

When you build a Calimero service using `calimero-sdk build`, it generates an `abi.json` file that describes your service's API. You can use this ABI to generate a type-safe TypeScript client that other applications can use to interact with your service.

This SDK includes a helper script (`generate-client.js`) that automatically handles the conversion from the SDK's ABI format to the client code generator format. The script uses  `@calimero-network/abi-codegen` to generate the client code.

## Quick Start

### 1. Build Your Service

First, build your service to generate the ABI:

```bash
npx calimero-sdk build src/index.ts -o build/service.wasm
```

This creates `build/abi.json` alongside your `service.wasm` file.

### 2. Generate the Client

Use the helper script to generate the TypeScript client:

```bash
node scripts/generate-client.js build/abi.json src/generated [ClientName]
```

**Example:**

```bash
node scripts/generate-client.js build/abi.json src/generated CounterClient
```

This generates a single file:

- `src/generated/CounterClient.ts` - Contains type definitions and the client class with methods for all your service functions

### 3. Use the Generated Client

```typescript
import { CounterClient } from './generated/CounterClient';
import { CalimeroApp } from '@calimero-network/calimero-client';

const app = new CalimeroApp({
  // ... your configuration
});

const context = app.getContext('your-context-id');
const client = new CounterClient(app, context);

// Call methods with full type safety
await client.increment();
const count = await client.getcount();
```

## Helper Script Details

### Usage

```bash
node scripts/generate-client.js <abi-json-path> <output-dir> [client-name]
```

**Parameters:**

- `<abi-json-path>` - Path to your `abi.json` file (usually `build/abi.json`)
- `<output-dir>` - Directory where generated files will be written
- `[client-name]` - Optional name for the client class (defaults to `Client`)

**Examples:**

```bash
# Basic usage (creates Client.ts)
node scripts/generate-client.js build/abi.json src/generated

# With custom client name
node scripts/generate-client.js build/abi.json src/generated CounterClient

# Using the shell wrapper
./scripts/generate-client.sh build/abi.json src/generated CounterClient
```

## Generated Files

The script generates a TypeScript file:

### `{ClientName}.ts`

This file contains everything in one place:

- **Type definitions** - All custom types, interfaces, and type aliases from your service (e.g., `CounterApp` interface)
- **Utility classes** - Helper classes like `CalimeroBytes` for byte handling
- **Client class** - The main `{ClientName}` class with:
  - Constructor: `constructor(app: CalimeroApp, context: Context)`
  - Methods for all your service functions with properly typed parameters and return values
  - Integration with `CalimeroApp` and `Context`

**Example structure:**

```typescript
// Generated types
export interface CounterApp {
  count: number;
}

// Utility classes
export class CalimeroBytes { ... }

// Main client class
export class CounterClient {
  constructor(app: CalimeroApp, context: Context);
  public async increment(): Promise<void>;
  public async getcount(): Promise<number>;
  // ... other methods
}
```

## Integration with Build Process

You can integrate client generation into your build process:

### package.json Scripts

```json
{
  "scripts": {
    "build": "calimero-sdk build src/index.ts -o build/service.wasm",
    "generate:client": "node scripts/generate-client.js build/abi.json src/generated",
    "build:all": "npm run build && npm run generate:client"
  }
}
```

### TypeScript Configuration

Add the generated files to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    // ... your options
  },
  "include": ["src/**/*", "src/generated/**/*"]
}
```

## Troubleshooting

### "ABI file not found"

- Ensure you've built your service first: `npx calimero-sdk build src/index.ts -o build/service.wasm`
- Check that the path to `abi.json` is correct
- Verify the file exists: `ls build/abi.json`

### "Client generation failed"

- Check that `@calimero-network/abi-codegen` is available (the script uses `npx` to run it)
- Verify your ABI.json is valid JSON
- Try running with verbose output to see detailed error messages

### Type errors in generated code

- Ensure you're using compatible versions of `@calimero-network/calimero-client`
- Check that all types in your service are properly defined
- Verify the generated files are included in your TypeScript compilation

## Next Steps

- [Getting Started](./getting-started.md) - Build your first Calimero application
- [API Reference](./api-reference.md) - Learn about the Calimero SDK APIs
- [Architecture](./architecture.md) - Understand the build pipeline and runtime
