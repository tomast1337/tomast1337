// The three cards, each a GlyphEngine program over one Telemetry record.
// main() draws the data, cell by cell, like a fragment shader;
// post() draws the frame and the words on top.

import { buffer as B, type Buffer, type Coord, type CellOut, type Program } from '@glyph-engine/core';
import { levels, streaks, total, type Telemetry } from './model';

export const COLS = 58;
export const ROWS = 12;

export const THEME = {
    bg: '#0d1117',
    fg: '#c9d1d9',
    dim: '#8b949e',
    faint: '#30363d',
    accent: '#fdb913',
    heat: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
} as const;

export interface Card {
    name: string; // file name, without extension
    title: string; // accessible name of the image
    program: Program;
}

const settings = { backgroundColor: THEME.bg, color: THEME.fg };

// -- drawing helpers for post() ---------------------------------------------------

const EIGHTHS_UP = ' ▁▂▃▄▅▆▇█';
const EIGHTHS_RIGHT = ' ▏▎▍▌▋▊▉█';

function write(buf: Buffer, x: number, y: number, text: string, color: string, bold = false) {
    B.mergeText({ text, color, fontWeight: bold ? 'bold' : undefined }, x, y, buf, COLS, ROWS);
}

// A rounded frame on the outer cells, a title on its top edge, a note on its bottom edge
function frame(buf: Buffer, title: string, note: string) {
    const c = { color: THEME.faint };
    const [r, b] = [COLS - 1, ROWS - 1];
    B.mergeRect({ char: '─', ...c }, 1, 0, COLS - 2, 1, buf, COLS, ROWS);
    B.mergeRect({ char: '─', ...c }, 1, b, COLS - 2, 1, buf, COLS, ROWS);
    B.mergeRect({ char: '│', ...c }, 0, 1, 1, ROWS - 2, buf, COLS, ROWS);
    B.mergeRect({ char: '│', ...c }, r, 1, 1, ROWS - 2, buf, COLS, ROWS);
    B.merge({ char: '╭', ...c }, 0, 0, buf, COLS, ROWS);
    B.merge({ char: '╮', ...c }, r, 0, buf, COLS, ROWS);
    B.merge({ char: '╰', ...c }, 0, b, buf, COLS, ROWS);
    B.merge({ char: '╯', ...c }, r, b, buf, COLS, ROWS);
    write(buf, 2, 0, ` ${title} `, THEME.accent, true);
    write(buf, COLS - 3 - note.length, b, ` ${note} `, THEME.dim);
}

const fmt = (v: number) => v.toLocaleString('en-US');
const pad = (label: string, value: string, width: number) => label + value.padStart(width - label.length);

// Linear mix of two "#rrggbb" colours, t in 0..1
function mix(a: string, b: string, t: number): string {
    const p = (s: string, i: number) => parseInt(s.slice(1 + 2 * i, 3 + 2 * i), 16);
    const ch = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t);
    return '#' + [0, 1, 2].map((i) => ch(i).toString(16).padStart(2, '0')).join('');
}

// -- 1. stats: totals, streaks and the contribution calendar ------------------------

export function statsCard(t: Telemetry): Card {
    // The calendar as weeks (columns) of seven days, Sunday on top, like GitHub's.
    // Two days per cell: '▀' takes the upper day as its colour, the lower as background.
    const lv = levels(t.calendar);
    const offset = t.calendar.length ? new Date(t.calendar[0]!.date + 'T00:00:00Z').getUTCDay() : 0;
    const weeks = Math.ceil((lv.length + offset) / 7);
    const level = (week: number, day: number) => lv[week * 7 + day - offset]; // undefined: no such day
    const [x0, y0] = [Math.floor((COLS - weeks) / 2), 6];

    const s = streaks(t.calendar);
    const columns = [
        [['commits', fmt(t.totals.commits)], ['PRs', fmt(t.totals.pullRequests)], ['issues', fmt(t.totals.issues)]],
        [['stars', fmt(t.totals.stars)], ['followers', fmt(t.totals.followers)], ['repos', fmt(t.totals.repos)]],
        [['streak', `${s.current}d`], ['best', `${s.longest}d`], ['total', fmt(total(t.calendar))]],
    ];

    return {
        name: 'stats',
        title: `${t.login}: GitHub stats and contribution calendar`,
        program: {
            settings,
            main(p: Coord, _c, _k, out: CellOut) {
                const [w, r] = [p.x - x0, p.y - y0];
                if (w < 0 || w >= weeks || r < 0 || r > 3) return;
                const [top, bottom] = [level(w, 2 * r), r < 3 ? level(w, 2 * r + 1) : undefined];
                if (top === undefined && bottom === undefined) return;
                out.char = '▀';
                out.color = top === undefined ? THEME.bg : THEME.heat[top]!;
                out.background = bottom === undefined ? THEME.bg : THEME.heat[bottom]!;
            },
            post(_c, _k, buf: Buffer) {
                frame(buf, t.login, `updated ${t.generatedAt.slice(0, 10)}`);
                columns.forEach((col, i) =>
                    col.forEach(([label, value], j) => {
                        const x = 3 + 18 * i;
                        write(buf, x, 2 + j, label!, THEME.dim);
                        write(buf, x + label!.length, 2 + j, pad('', value!, 16 - label!.length), THEME.fg, true);
                    }),
                );
                write(buf, x0, 10, 'last 12 months', THEME.dim);
                const legend = 'less █████ more';
                const lx = x0 + weeks - legend.length;
                write(buf, lx, 10, legend, THEME.dim);
                THEME.heat.forEach((color, i) => write(buf, lx + 5 + i, 10, '█', color));
            },
        },
    };
}

// -- 2. languages: commits per primary language, as horizontal bars ---------------

export function languagesCard(t: Telemetry): Card {
    const MAX = 8;
    const all = t.languages;
    const shown = all.length > MAX ? [...all.slice(0, MAX - 1), { name: 'other', color: null, commits: all.slice(MAX - 1).reduce((s, l) => s + l.commits, 0) }] : all;
    const sum = shown.reduce((s, l) => s + l.commits, 0) || 1;
    const top = Math.max(1, ...shown.map((l) => l.commits));
    const [bx, bw, y0] = [16, 30, 2]; // bar column, bar width, first row

    return {
        name: 'languages',
        title: `${t.login}: commits by language`,
        program: {
            settings,
            main(p: Coord, _c, _k, out: CellOut) {
                const lang = shown[p.y - y0];
                const i = p.x - bx;
                if (!lang || i < 0 || i >= bw) return;
                // Length in eighths of a cell, the longest bar filling the width
                const fill = Math.round(((lang.commits / top) * bw - i) * 8);
                if (fill <= 0) {
                    out.char = '─';
                    out.color = THEME.faint;
                } else {
                    out.char = EIGHTHS_RIGHT[Math.min(8, fill)]!;
                    out.color = lang.color ?? THEME.dim;
                }
            },
            post(_c, _k, buf: Buffer) {
                frame(buf, 'languages', 'by commits · last 12 months');
                shown.forEach((l, j) => {
                    const name = l.name.length > 12 ? l.name.slice(0, 11) + '…' : l.name;
                    write(buf, 3, y0 + j, name, THEME.fg);
                    write(buf, bx + bw + 2, y0 + j, `${((100 * l.commits) / sum).toFixed(1)}%`.padStart(6), THEME.dim);
                });
                if (!shown.length) write(buf, 3, y0, 'no commits yet', THEME.dim);
            },
        },
    };
}

// -- 3. hours: commits by local hour, as vertical bars ----------------------------

export function hoursCard(t: Telemetry): Card {
    const H = 7; // bar height in rows
    const [x0, base] = [Math.floor((COLS - 47) / 2), 2 + H - 1]; // first bar column, bottom bar row
    const top = Math.max(1, ...t.hours);
    const peak = t.hours.indexOf(Math.max(...t.hours));
    const hh = (h: number) => String(h).padStart(2, '0');

    return {
        name: 'hours',
        title: `${t.login}: commits by hour of day`,
        program: {
            settings,
            main(p: Coord, _c, _k, out: CellOut) {
                const d = p.x - x0;
                const r = base - p.y; // row counted from the bottom
                if (d < 0 || d > 46 || d % 2 || r < 0 || r >= H) return;
                const v = t.hours[d / 2]! / top; // 0..1
                const fill = Math.round((v * H - r) * 8); // eighths of this cell
                if (fill > 0) {
                    out.char = EIGHTHS_UP[Math.min(8, fill)]!;
                    out.color = mix(THEME.faint, THEME.accent, 0.25 + 0.75 * v);
                } else if (r === 0) {
                    out.char = '▁';
                    out.color = THEME.faint;
                }
            },
            post(_c, _k, buf: Buffer) {
                frame(buf, 'commits by hour', `peak ${hh(peak)}:00 · ${t.timeZone}`);
                for (const h of [0, 6, 12, 18, 23]) write(buf, x0 + 2 * h - (h === 23 ? 1 : 0), base + 1, hh(h), THEME.dim);
            },
        },
    };
}

export const cards = (t: Telemetry): Card[] => [statsCard(t), languagesCard(t), hoursCard(t)];
