// The top albums of a period from Last.fm: names, play counts and cover URLs.

import type { Album, Music } from './model';

const API = 'https://ws.audioscrobbler.com/2.0/';

interface TopAlbums {
    topalbums?: {
        album: {
            name: string;
            playcount: string;
            artist: { name: string };
            image: { size: string; '#text': string }[];
        }[];
    };
    error?: number;
    message?: string;
}

export async function topAlbums(user: string, apiKey: string, period: string, limit: number): Promise<Music> {
    const q = new URLSearchParams({ method: 'user.gettopalbums', user, api_key: apiKey, period, limit: String(limit), format: 'json' });
    const res = await fetch(`${API}?${q}`);
    const body = (await res.json()) as TopAlbums;
    if (!res.ok || body.error || !body.topalbums) throw new Error(`Last.fm ${res.status}: ${body.message ?? res.statusText}`);

    const albums: Album[] = body.topalbums.album.slice(0, limit).map((a) => {
        const url = a.image[a.image.length - 1]?.['#text'] ?? ''; // listed small to large
        return { name: a.name, artist: a.artist.name, plays: Number(a.playcount), image: url || null };
    });
    return { user, period, albums };
}
