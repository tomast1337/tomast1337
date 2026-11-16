// A GlyphEngine runner without a screen: one frame, computed and returned.

import { bufferOf, computeFrame, createFrame, type Context, type Frame, type Program, type Settings } from '@glyph-engine/core';

export interface Cell {
    width: number; // px
    height: number; // px
    fontSize: number; // px
    fontFamily: string;
}

export function renderOnce(program: Program, cols: number, rows: number, cell: Cell): Frame {
    const settings: Settings = {
        element: null,
        cols,
        rows,
        once: true,
        fps: 0,
        renderer: 'svg',
        allowSelect: false,
        restoreState: false,
        ...program.settings,
    };
    const context: Context = {
        width: cols * cell.width,
        height: rows * cell.height,
        frame: 0,
        time: 0,
        delta: 0,
        cols,
        rows,
        metrics: {
            aspect: cell.width / cell.height,
            cellWidth: cell.width,
            lineHeight: cell.height,
            fontFamily: cell.fontFamily,
            fontSize: cell.fontSize,
            _update() {},
        },
        settings,
        runtime: { time: 0, frame: 0, cycle: 0, fps: 0 },
    };
    const frame = createFrame(cols, rows);
    const userData = {};
    program.boot?.(context, bufferOf(frame), userData);
    computeFrame(program, context, { x: -1, y: -1, pressed: false }, frame, userData);
    return frame;
}
