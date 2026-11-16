// The top albums as one image: covers in a cols × rows grid, most played first,
// read left to right. A missing cover becomes a dark tile with the names on it.

import sharp from 'sharp';
import type { Album } from './model';
import { THEME } from './cards';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function placeholder(a: Album | undefined, size: number): Buffer {
    const lines = a ? [clip(a.name, 22), clip(a.artist, 22)] : [];
    const text = lines
        .map((l, i) => `<text x="50%" y="${50 + (i - 0.5) * 9}%" fill="${i ? THEME.dim : THEME.fg}">${esc(l)}</text>`)
        .join('');
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${THEME.heat[0]}"/>` +
            `<g font-family="monospace" font-size="${size / 14}" text-anchor="middle" dominant-baseline="central">${text}</g></svg>`,
    );
}

async function tile(a: Album | undefined, size: number): Promise<Buffer> {
    if (a?.image) {
        try {
            const res = await fetch(a.image);
            if (res.ok) return await sharp(Buffer.from(await res.arrayBuffer())).resize(size, size, { fit: 'cover' }).removeAlpha().toBuffer();
        } catch {
            // fall through to the placeholder
        }
    }
    return sharp(placeholder(a, size)).resize(size, size).png().toBuffer();
}

export async function collage(albums: readonly Album[], cols: number, rows: number, size = 300): Promise<Buffer> {
    const tiles = await Promise.all(Array.from({ length: cols * rows }, (_, i) => tile(albums[i], size)));
    return sharp({ create: { width: cols * size, height: rows * size, channels: 3, background: THEME.bg } })
        .composite(tiles.map((input, i) => ({ input, left: (i % cols) * size, top: Math.floor(i / cols) * size })))
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
}
