// The telemetry record: everything the cards show, and nothing else.
// github.ts produces it, cards.ts consumes it; the fixture is one serialized.

export interface Day {
    date: string; // YYYY-MM-DD
    count: number;
}

export interface Language {
    name: string;
    color: string | null; // linguist colour, "#rrggbb"
    commits: number;
}

export interface Telemetry {
    login: string;
    generatedAt: string; // ISO timestamp
    timeZone: string; // IANA name the hours are counted in
    totals: {
        commits: number;
        pullRequests: number;
        issues: number;
        stars: number;
        followers: number;
        repos: number;
    };
    calendar: Day[]; // oldest first, contiguous, ends today
    languages: Language[]; // most commits first
    hours: number[]; // 24 entries: commits authored in each local hour
    music?: Music; // absent when Last.fm is not configured
}

export interface Music {
    user: string; // Last.fm user name
    period: string; // Last.fm period: 7day, 1month, 3month…
    albums: Album[]; // most played first
}

export interface Album {
    name: string;
    artist: string;
    plays: number;
    image: string | null; // cover URL, the largest Last.fm has
}

// -- derived values: pure functions of the record ------------------------------

export interface Streaks {
    current: number;
    longest: number;
}

// A day with no contribution ends a streak. Today does not count against the
// current streak until it is over: it starts from yesterday when today is empty.
export function streaks(calendar: readonly Day[]): Streaks {
    let longest = 0;
    let run = 0;
    for (const d of calendar) {
        run = d.count > 0 ? run + 1 : 0;
        longest = Math.max(longest, run);
    }
    let i = calendar.length - 1;
    if (i >= 0 && calendar[i]!.count === 0) i--;
    let current = 0;
    while (i >= 0 && calendar[i]!.count > 0) {
        current++;
        i--;
    }
    return { current, longest };
}

// Contribution level 0..4, as GitHub draws it: 0 for an empty day, otherwise the
// quartile of the day among the non-empty days.
export function levels(calendar: readonly Day[]): number[] {
    const sorted = calendar
        .map((d) => d.count)
        .filter((c) => c > 0)
        .sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
    const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
    return calendar.map(({ count: c }) => (c === 0 ? 0 : c <= q1 ? 1 : c <= q2 ? 2 : c <= q3 ? 3 : 4));
}

export function total(calendar: readonly Day[]): number {
    return calendar.reduce((s, d) => s + d.count, 0);
}
