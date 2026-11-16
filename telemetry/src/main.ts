// bun src/main.ts [--fixture file.json] [--out dir]
//
// Without --fixture, collects the record from GitHub:
//   GH_LOGIN      whose telemetry (default: tomast1337)
//   GH_TOKEN      a token that may read it
//   TELEMETRY_TZ  IANA time zone for the hours card (default: UTC)
// Writes one SVG per card, and the record itself as telemetry.json.

import { mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { cssColor } from '@glyph-engine/core';
import { cards, COLS, ROWS, THEME } from './cards';
import { collect } from './github';
import { renderOnce, type Cell } from './headless';
import type { Telemetry } from './model';
import { frameToSvg, type Look } from './svg';

const CELL: Cell = {
    width: 8.4,
    height: 18,
    fontSize: 14,
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
};
const LOOK: Look = { cell: CELL, fg: cssColor(THEME.fg), bg: cssColor(THEME.bg), radius: 6 };

async function record(fixture: string | undefined): Promise<Telemetry> {
    if (fixture) return (await Bun.file(fixture).json()) as Telemetry;
    const token = process.env.GH_TOKEN;
    if (!token) throw new Error('GH_TOKEN is not set (or pass --fixture)');
    return collect(process.env.GH_LOGIN || 'tomast1337', token, process.env.TELEMETRY_TZ || 'UTC');
}

const { values } = parseArgs({ options: { fixture: { type: 'string' }, out: { type: 'string', default: 'out' } } });
const out = values.out!;
const t = await record(values.fixture);

await mkdir(out, { recursive: true });
await Bun.write(`${out}/telemetry.json`, JSON.stringify(t, null, 2) + '\n');
for (const card of cards(t)) {
    const svg = frameToSvg(renderOnce(card.program, COLS, ROWS, CELL), LOOK, card.title);
    await Bun.write(`${out}/${card.name}.svg`, svg + '\n');
    console.log(`${out}/${card.name}.svg`);
}
