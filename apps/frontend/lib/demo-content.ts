/**
 * Demo content for DecentralFlix.
 * Used when NEXT_PUBLIC_INDEXER_URL is not set (development / investor demo).
 * Developer's real films: 'Raging Midlife', 'Savage Midlife'.
 */

export type DemoFilm = {
  filmHash: string;
  title: string;
  description: string;
  creator: string;
  creatorName: string;
  price: string;        // ETH string e.g. '0.01'
  priceWei: string;     // wei as string
  tier: 'BASIC' | 'DELUXE' | 'PRODUCER';
  genre: string;
  duration: string;     // e.g. '1h 42m'
  releaseYear: number;
  isDeplatformed: boolean;
  deplatformedReason?: string;
  thumbnailUrl: string;
  videoUrl: string;     // HLS playlist or demo stream
  arweaveMetaTxId: string;
  filecoinCid: string;
  ownerCount: number;
  averageRating: number;
  reviewCount: number;
};

export const DEMO_FILMS: DemoFilm[] = [
  {
    filmHash: 'raging-midlife',
    title: 'Raging Midlife',
    description:
      'A raw, unflinching look at one man\'s journey through the chaos of midlife — career collapse, identity crisis, and unexpected redemption. Shot documentary-style over three years.',
    creator: '0xDino000000000000000000000000000000000001',
    creatorName: 'Dino Martinović',
    price: '0.01',
    priceWei: '10000000000000000',
    tier: 'BASIC',
    genre: 'Documentary',
    duration: '1h 18m',
    releaseYear: 2024,
    isDeplatformed: false,
    thumbnailUrl: '',
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    arweaveMetaTxId: 'demo-raging-midlife-arweave-tx',
    filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    ownerCount: 247,
    averageRating: 4.8,
    reviewCount: 89,
  },
  {
    filmHash: 'savage-midlife',
    title: 'Savage Midlife',
    description:
      'The follow-up to Raging Midlife. Older, angrier, funnier. Life doesn\'t slow down — so you learn to run faster or get left behind.',
    creator: '0xDino000000000000000000000000000000000001',
    creatorName: 'Dino Martinović',
    price: '0.01',
    priceWei: '10000000000000000',
    tier: 'BASIC',
    genre: 'Documentary',
    duration: '1h 24m',
    releaseYear: 2025,
    isDeplatformed: false,
    thumbnailUrl: '',
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    arweaveMetaTxId: 'demo-savage-midlife-arweave-tx',
    filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    ownerCount: 189,
    averageRating: 4.9,
    reviewCount: 73,
  },
  {
    filmHash: 'signal-lost',
    title: 'Signal Lost',
    description:
      'Uploaded to YouTube in 2022. Removed within 48 hours without explanation. This film lives permanently on DecentralFlix — no algorithm, no ban, no explanation required.',
    creator: '0xTyler00000000000000000000000000000000001',
    creatorName: 'Independent Filmmaker',
    price: '0.02',
    priceWei: '20000000000000000',
    tier: 'DELUXE',
    genre: 'Drama',
    duration: '52m',
    releaseYear: 2022,
    isDeplatformed: true,
    deplatformedReason: 'Removed from YouTube without stated reason. Appeals denied.',
    thumbnailUrl: '',
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    arweaveMetaTxId: 'demo-signal-lost-arweave-tx',
    filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    ownerCount: 512,
    averageRating: 4.7,
    reviewCount: 203,
  },
  {
    filmHash: 'the-unmuted',
    title: 'The Unmuted',
    description:
      'Six creators. Six countries. All deplatformed in the same week. This is their story — told in their words, on a platform that cannot silence them.',
    creator: '0xTyler00000000000000000000000000000000001',
    creatorName: 'Independent Filmmaker',
    price: '0.015',
    priceWei: '15000000000000000',
    tier: 'BASIC',
    genre: 'Documentary',
    duration: '1h 6m',
    releaseYear: 2023,
    isDeplatformed: true,
    deplatformedReason: 'Removed from multiple platforms simultaneously.',
    thumbnailUrl: '',
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    arweaveMetaTxId: 'demo-unmuted-arweave-tx',
    filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    ownerCount: 934,
    averageRating: 4.6,
    reviewCount: 341,
  },
  {
    filmHash: 'ghost-frame',
    title: 'Ghost Frame',
    description:
      'A psychological thriller shot entirely on consumer hardware over 18 months. Sundance submission. Streaming exclusively here.',
    creator: '0xCreator0000000000000000000000000000000001',
    creatorName: 'Independent Creator',
    price: '0.03',
    priceWei: '30000000000000000',
    tier: 'PRODUCER',
    genre: 'Thriller',
    duration: '1h 51m',
    releaseYear: 2025,
    isDeplatformed: false,
    thumbnailUrl: '',
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    arweaveMetaTxId: 'demo-ghost-frame-arweave-tx',
    filecoinCid: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
    ownerCount: 78,
    averageRating: 4.4,
    reviewCount: 29,
  },
];

/** Returns true when running in demo/development mode (no real indexer configured) */
export function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_INDEXER_URL;
}

/** Get film for display — real indexer when available, demo data otherwise */
export function getDemoFilm(filmHash: string): DemoFilm | undefined {
  return DEMO_FILMS.find(f => f.filmHash === filmHash);
}

/** Get films for display with optional genre filter */
export function getFilmsForDisplay(genre?: string): DemoFilm[] {
  if (!genre || genre === 'All') return DEMO_FILMS;
  return DEMO_FILMS.filter(f => f.genre.toLowerCase() === genre.toLowerCase());
}

export const DEMO_GENRES = ['All', 'Documentary', 'Drama', 'Thriller', 'Action', 'Comedy', 'Sci-Fi', 'Horror', 'Indie'];
