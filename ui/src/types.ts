export interface Song {
    title: string;
    path: string;
    author: string;
    bpm: number;
    capo: string;
    ccli: string;
    chordpro_lyrics: string;
    copyright: string;
    key: string;
    lyrics: string;
    transpose: string;
}

export interface Set {
    name: string;
    path: string;
    songs: Song[];
}
