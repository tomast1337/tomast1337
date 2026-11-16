// A GlyphEngine frame as an SVG image.
//
// Fonts are not ours to choose: an SVG shown through <img> gets whatever
// monospace font the reader has. So nothing relies on glyph metrics:
//   block elements (█ ▀ ▁…▇ ▏…▉ ░▒▓) become rectangles,
//   box-drawing lines (─ │ ╭ ╮ ╰ ╯ ┌ ┐ └ ┘) become strokes,
//   every other glyph is text placed at its own cell's x.
// The grid then holds in any font; only the letters' shapes vary.

import { GRAPHEME, type Frame } from '@glyph-engine/core';
import type { Cell } from './headless';

export interface Look {
    cell: Cell;
    fg: number; // packed 0xRRGGBBAA, for cells left at the default colour
    bg: number;
    radius: number; // px, the card's corner and the round box corners
}

// -- glyph geometry, in cell units --------------------------------------------

type Unit = readonly [x: number, y: number, w: number, h: number, alpha: number];

const BLOCKS = new Map<string, readonly Unit[]>([
    ['█', [[0, 0, 1, 1, 1]]],
    ['▀', [[0, 0, 1, 0.5, 1]]],
    ['▐', [[0.5, 0, 0.5, 1, 1]]],
    ['░', [[0, 0, 1, 1, 0.25]]],
    ['▒', [[0, 0, 1, 1, 0.5]]],
    ['▓', [[0, 0, 1, 1, 0.75]]],
]);
[...'▁▂▃▄▅▆▇'].forEach((g, i) => BLOCKS.set(g, [[0, 1 - (i + 1) / 8, 1, (i + 1) / 8, 1]]));
[...'▏▎▍▌▋▊▉'].forEach((g, i) => BLOCKS.set(g, [[0, 0, (i + 1) / 8, 1, 1]]));

// Path for a line glyph in the cell at (x, y), size (w, h), corner radius r
type Line = (x: number, y: number, w: number, h: number, r: number) => string;
const LINES = new Map<string, Line>([
    ['─', (x, y, w, h) => `M${x} ${y + h / 2}h${w}`],
    ['│', (x, y, w, h) => `M${x + w / 2} ${y}v${h}`],
    ['╭', (x, y, w, h, r) => `M${x + w} ${y + h / 2}H${x + w / 2 + r}Q${x + w / 2} ${y + h / 2} ${x + w / 2} ${y + h / 2 + r}V${y + h}`],
    ['╮', (x, y, w, h, r) => `M${x} ${y + h / 2}H${x + w / 2 - r}Q${x + w / 2} ${y + h / 2} ${x + w / 2} ${y + h / 2 + r}V${y + h}`],
    ['╰', (x, y, w, h, r) => `M${x + w / 2} ${y}V${y + h / 2 - r}Q${x + w / 2} ${y + h / 2} ${x + w / 2 + r} ${y + h / 2}H${x + w}`],
    ['╯', (x, y, w, h, r) => `M${x + w / 2} ${y}V${y + h / 2 - r}Q${x + w / 2} ${y + h / 2} ${x + w / 2 - r} ${y + h / 2}H${x}`],
    ['┌', (x, y, w, h) => `M${x + w} ${y + h / 2}H${x + w / 2}V${y + h}`],
    ['┐', (x, y, w, h) => `M${x} ${y + h / 2}H${x + w / 2}V${y + h}`],
    ['└', (x, y, w, h) => `M${x + w / 2} ${y}V${y + h / 2}H${x + w}`],
    ['┘', (x, y, w, h) => `M${x + w / 2} ${y}V${y + h / 2}H${x}`],
]);

// -- small helpers --------------------------------------------------------------

const hex = (c: number) => '#' + (c >>> 8).toString(16).padStart(6, '0');
const alphaOf = (c: number) => (c & 255) / 255;
const n = (v: number) => +v.toFixed(2);
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

function glyphAt(f: Frame, k: number): string {
    const c = f.chars[k]!;
    if (c === 0) return '';
    return c >= GRAPHEME ? f.graphemes[c - GRAPHEME]! : String.fromCodePoint(c);
}

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
    color: number;
    alpha: number;
}

// Appends r, or widens the last rectangle when r continues it on the same band
function pushRect(list: Rect[], r: Rect) {
    const last = list[list.length - 1];
    if (last && last.y === r.y && last.h === r.h && last.color === r.color && last.alpha === r.alpha && Math.abs(last.x + last.w - r.x) < 1e-6) {
        last.w += r.w;
    } else list.push(r);
}

const rectSvg = (r: Rect) =>
    `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="${hex(r.color)}"${r.alpha < 1 ? ` fill-opacity="${n(r.alpha)}"` : ''}/>`;

// -- the frame ----------------------------------------------------------------

export function frameToSvg(f: Frame, look: Look, title: string): string {
    const { width: cw, height: lh, fontSize, fontFamily } = look.cell;
    const W = f.cols * cw;
    const H = f.rows * lh;
    const r = Math.min(look.radius, cw / 2, lh / 2);

    const backgrounds: Rect[] = [];
    const blocks: Rect[] = [];
    const lines = new Map<number, string[]>(); // colour -> path pieces
    const texts = new Map<string, { y: number; color: number; bold: boolean; xs: number[]; s: string }>();

    for (let row = 0, k = 0; row < f.rows; row++) {
        for (let col = 0; col < f.cols; col++, k++) {
            const x = col * cw;
            const y = row * lh;
            const fg = f.fg[k] || look.fg;
            const bg = f.bg[k] || look.bg;
            if (bg !== look.bg) pushRect(backgrounds, { x, y, w: cw, h: lh, color: bg, alpha: alphaOf(bg) });

            const g = glyphAt(f, k);
            if (g === '' || g === ' ') continue;

            const block = BLOCKS.get(g);
            if (block) {
                for (const [ux, uy, uw, uh, a] of block) {
                    pushRect(blocks, { x: x + ux * cw, y: y + uy * lh, w: uw * cw, h: uh * lh, color: fg, alpha: a * alphaOf(fg) });
                }
                continue;
            }
            const line = LINES.get(g);
            if (line) {
                const pieces = lines.get(fg) ?? [];
                pieces.push(line(n(x), n(y), n(cw), n(lh), n(r)));
                lines.set(fg, pieces);
                continue;
            }
            const bold = f.weight[k]! >= 6;
            const key = `${row}|${fg}|${bold}`;
            const run = texts.get(key) ?? { y: y + lh / 2, color: fg, bold, xs: [], s: '' };
            // one x per code point, each glyph centred on its cell: every positioned
            // character is its own text chunk, so text-anchor applies to each
            for (const _ of g) run.xs.push(n(x + cw / 2));
            run.s += g;
            texts.set(key, run);
        }
    }

    const out: string[] = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}" height="${n(H)}" viewBox="0 0 ${n(W)} ${n(H)}" role="img" aria-label="${esc(title)}">`);
    out.push(`<title>${esc(title)}</title>`);
    // The card covers the whole grid: words written on the box's edges stay on it
    out.push(`<rect width="${n(W)}" height="${n(H)}" rx="${n(look.radius)}" fill="${hex(look.bg)}"/>`);
    out.push(...backgrounds.map(rectSvg), ...blocks.map(rectSvg));
    for (const [color, pieces] of lines) {
        out.push(`<path d="${pieces.join('')}" fill="none" stroke="${hex(color)}" stroke-width="1"/>`);
    }
    out.push(`<g font-family="${esc(fontFamily)}" font-size="${fontSize}" dominant-baseline="central" text-anchor="middle">`);
    for (const t of texts.values()) {
        const weight = t.bold ? ' font-weight="700"' : '';
        const opacity = alphaOf(t.color) < 1 ? ` fill-opacity="${n(alphaOf(t.color))}"` : '';
        out.push(`<text x="${t.xs.join(' ')}" y="${n(t.y)}" fill="${hex(t.color)}"${opacity}${weight}>${esc(t.s)}</text>`);
    }
    out.push('</g></svg>');
    return out.join('\n');
}
