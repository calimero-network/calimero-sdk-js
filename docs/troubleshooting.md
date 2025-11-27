# Troubleshooting

Common issues and solutions when working with Calimero JavaScript SDK.

## Build Issues

### QuickJS Not Found

**Error**: `QuickJS compiler not found`

**Solution**:

```bash
pnpm install  # Downloads QuickJS automatically
```

### WASI-SDK Not Found

**Error**: `WASI-SDK not found`

**Solution**:

```bash
cd packages/cli
pnpm install  # Downloads WASI-SDK
```

### Unsupported Platform

**Error**: `Platform win32 is not supported`

**Supported**:

- macOS (darwin)
- Linux

**Workaround**: Use WSL on Windows

## Runtime Issues

### Method Not Found

**Error**: Contract method not exported

**Check**:

1. Method is in `@Logic` decorated class
2. Method is not `constructor`
3. `methods.h` was generated correctly

### Storage Errors

**Error**: `Storage operation failed`

**Solutions**:

- Check key serialization
- Verify storage access permissions
- Check for null values

### Event Handler Not Executing

**Possible Causes**:

1. Handler name doesn't match method
2. Author node trying to execute own handler
3. Delta not applied (parents missing)

**Debug**:

```typescript
env.log(`Emitting with handler: ${handlerName}`);
```

## Development Issues

### TypeScript Errors

**Error**: Cannot find module '@calimero-network/calimero-sdk-js'

**Solution**:

```bash
pnpm install
pnpm build  # Build SDK package first
```

### Hot Reload Not Working

Currently no hot reload support.

**Workaround**:

```bash
# Watch mode for development
pnpm build --watch
```

## Performance Issues

### Slow Build Times

**Optimize**:

1. Use `--no-optimize` for dev builds
2. Enable caching in Rollup
3. Exclude large dependencies

### Large WASM Size

**Expected**: ~500KB (QuickJS + service)

**Reduce**:

1. Enable optimization: `--optimize`
2. Remove unused imports
3. Use tree-shaking

## Getting Help

1. Check [documentation](./getting-started.md)
2. Search [GitHub issues](https://github.com/calimero-network/calimero-sdk-js/issues)
3. Ask on [Discord](https://discord.gg/calimero)
4. Review [examples](../examples/)

## Debug Mode

Enable verbose output:

```bash
calimero-sdk build src/index.ts --verbose
```

This shows:

- Rollup bundling details
- QuickJS compilation steps
- Clang compilation flags
- Optimization passes
