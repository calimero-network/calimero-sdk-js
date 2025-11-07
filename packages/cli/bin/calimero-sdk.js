#!/usr/bin/env node

// Entry point for the calimero-sdk CLI
import('../lib/cli.js').catch(err => {
  console.error('Failed to load CLI:', err);
  process.exit(1);
});

