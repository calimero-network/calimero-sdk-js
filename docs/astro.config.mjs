// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Calimero JS SDK documentation — Astro Starlight with the shared Calimero
// theme (Zinc + #a5ff11 lime), ported from calimero-network/core.
export default defineConfig({
  site: 'https://calimero-network.github.io',
  // GitHub project Pages serve under /<repo>/. Change if a custom domain is used.
  base: '/calimero-sdk-js',
  // Keep the SeqDiagram engine (diagrams.client.ts) as an external script asset
  // instead of inlining it — inlining breaks the animated diagram islands.
  vite: { build: { assetsInlineLimit: 0 } },
  integrations: [
    starlight({
      title: 'Calimero JS SDK',
      description:
        'The JavaScript/TypeScript SDK for building Calimero P2P applications — decorators, CRDT collections, and the QuickJS→WASM build toolchain, with automatic conflict-free sync.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        alt: 'Calimero JS SDK',
      },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/theme.css'],
      expressiveCode: {
        themes: ['github-dark', 'github-light'],
        styleOverrides: {
          borderRadius: '0.5rem',
          borderColor: 'var(--sl-color-gray-6)',
          codeBackground: 'var(--sl-color-gray-7)',
          codeFontFamily: 'var(--sl-font-mono)',
          frames: {
            editorTabBarBackground: 'var(--sl-color-gray-6)',
            terminalTitlebarBackground: 'var(--sl-color-gray-6)',
          },
        },
      },
      lastUpdated: true,
      editLink: {
        baseUrl: 'https://github.com/calimero-network/calimero-sdk-js/edit/master/docs/',
      },
      head: [
        { tag: 'meta', attrs: { name: 'theme-color', content: '#09090b' } },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/calimero-network/calimero-sdk-js',
        },
      ],
      // Explicit, grouped navigation: Get Started → Guides → Understand → Reference.
      sidebar: [
        { label: 'Home', link: '/' },
        {
          label: 'Get Started',
          items: ['get-started/getting-started'],
        },
        {
          label: 'Guides',
          items: [
            'guides/collections',
            'guides/events',
            'guides/mergeable-js',
            'guides/client-generation',
            'guides/migration',
            'guides/troubleshooting',
          ],
        },
        {
          label: 'Understand',
          items: ['understand/architecture'],
        },
        {
          label: 'Reference',
          items: ['reference/api'],
        },
      ],
    }),
  ],
});
