/**
 * Generates /llms.txt — a machine-readable index of the docs for LLM/AI tools
 * (the emerging llms.txt convention). Built from the docs content collection so
 * it never drifts from the pages.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const SITE = 'https://calimero-network.github.io';
const BASE = '/calimero-sdk-js';

const TRACKS: Record<string, string> = {
  'get-started': 'Get Started — build, deploy, and call your first JS service',
  guides: 'Guides — collections, events, mergeable, client generation, migration, troubleshooting',
  understand: 'Understand — the build pipeline and QuickJS runtime architecture',
  reference: 'Reference — decorators, env host functions, and collection APIs',
};

export const GET: APIRoute = async () => {
  const docs = await getCollection('docs');

  const url = (id: string) => {
    const slug = id.replace(/\.(md|mdx)$/, '').replace(/\/index$/, '');
    return `${SITE}${BASE}/${slug}/`.replace(/\/+$/, '/');
  };

  const byTrack: Record<string, typeof docs> = {};
  for (const entry of docs) {
    const track = entry.id.split('/')[0];
    if (!TRACKS[track]) continue;
    (byTrack[track] ??= []).push(entry);
  }

  const lines: string[] = [
    '# Calimero JS SDK',
    '',
    '> The JavaScript/TypeScript SDK for building Calimero P2P applications.',
    '> Write services with decorators (@State, @Logic, @Init, @Event, @View),',
    '> store data in CRDT collections that sync automatically, and compile to',
    '> WASM via the QuickJS build toolchain — interoperable with the Rust SDK.',
    '',
    `Docs site: ${SITE}${BASE}/`,
    '',
  ];

  for (const track of Object.keys(TRACKS)) {
    const entries = (byTrack[track] ?? []).sort(
      (a, b) => (a.data.sidebar?.order ?? 0) - (b.data.sidebar?.order ?? 0),
    );
    if (!entries.length) continue;
    lines.push(`## ${TRACKS[track]}`, '');
    for (const e of entries) {
      const desc = e.data.description ? `: ${e.data.description}` : '';
      lines.push(`- [${e.data.title}](${url(e.id)})${desc}`);
    }
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
