// bun src/main.ts [--fixture file.json] [--out dir]
//
// Without --fixture, collects the record from GitHub:
//   GH_LOGIN      whose telemetry (default: tomast1337)
//   GH_TOKEN      a token that may read it
//   TELEMETRY_TZ  IANA time zone for the hours card (default: UTC)
// and, when both are set, the albums collage from Last.fm:
//   LASTFM_USER, LASTFM_API_KEY
// Writes one SVG per card, albums.jpg, and the record itself as telemetry.json.

import { mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { cssColor } from '@glyph-engine/core';
import { cards, COLS, ROWS, THEME } from './cards';
import { collage } from './collage';
import { collect } from './github';
import { topAlbums } from './lastfm';
import { renderOnce, type Cell } from './headless';
import type { Telemetry } from './model';
import { frameToSvg, type Look } from './svg';

const CELL: Cell = {
    width: 8.4,
    height: 18,
    fontSize: 14,
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
};
const GRID = { cols: 6, rows: 2 }; // the albums collage
const PERIOD = '1month';
const LOOK: Look = { cell: CELL, fg: cssColor(THEME.fg), bg: cssColor(THEME.bg), radius: 6 };

async function record(fixture: string | undefined): Promise<Telemetry> {
    if (fixture) return (await Bun.file(fixture).json()) as Telemetry;
    const token = process.env.GH_TOKEN;
    if (!token) throw new Error('GH_TOKEN is not set (or pass --fixture)');
    const t = await collect(process.env.GH_LOGIN || 'tomast1337', token, process.env.TELEMETRY_TZ || 'UTC');
    const { LASTFM_USER: user, LASTFM_API_KEY: key } = process.env;
    if (user && key) t.music = await topAlbums(user, key, PERIOD, GRID.cols * GRID.rows);
    return t;
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
if (t.music) {
    await Bun.write(`${out}/albums.jpg`, await collage(t.music.albums, GRID.cols, GRID.rows));
    console.log(`${out}/albums.jpg`);
}
