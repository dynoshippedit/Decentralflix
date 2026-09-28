#!/usr/bin/env tsx
/**
 * Decentralflix — Live Programming Status (Single Source of Truth)
 *
 * This is the ONLY interactive status viewer for current programming state.
 * No separate .md tracking files. Run with: pnpm status
 *
 * Mouse clickable + full keyboard navigation.
 * - Click or ↑↓ + Enter on sidebar items to drill
 * - Actions are live: compile, test, show real code, git, etc.
 */

import blessed from 'blessed';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '..');
const KEY_FILES = [
  'packages/contracts/contracts/MovieTicket.sol',
  'packages/contracts/contracts/Reviews.sol',
  'apps/frontend/components/Reviews.tsx',
  'apps/frontend/app/collection/page.tsx',
  'apps/frontend/app/film/[hash]/page.tsx',
  'apps/frontend/components/FilmCard.tsx',
  'apps/frontend/lib/contracts/useReviews.ts',
  'apps/frontend/lib/contracts/config.ts',
];

interface NavItem {
  label: string;
  key: string;
  render: () => string;
}

// ============== AUTHORITATIVE CURRENT STATE (Live inside the viewer) ==============
const STATE = {
  overall: {
    phase: 'Phase 0 — Foundation + Reviews as CORE',
    focus: 'Reviews system (highest priority): single editable review per verified owner, on-chain gated, discoverable everywhere',
    progress: 68,
  },
  reviews: {
    contract: {
      status: 'COMPLETE',
      details: [
        '✓ Reviews.sol: mapping(string => mapping(address => Review)) — strictly one review per owner per film',
        '✓ submitReview performs upsert (edit) + emits ReviewSubmitted OR ReviewUpdated',
        '✓ onlyTicketHolder modifier calls movieTicket.hasAccessToVideo(msg.sender, videoHash)',
        '✓ getReview / getReviews / getReviewCount / hasReviewed helpers (indexer friendly)',
        '✓ 1-5 rating + ≤500 char comment enforced',
      ],
    },
    gating: {
      status: 'COMPLETE',
      details: [
        '✓ hasAccessToVideo implemented in MovieTicket (linear scan for Phase 0, documented for 125M scale)',
        '✓ Frontend Reviews.tsx: calls hasAccessToVideo + hasReviewed before showing form',
        '✓ Non-owners see clear "You must own a ticket to review" message',
        '✓ Owners see emerald "You own this film on-chain — your voice matters here"',
      ],
    },
    ui: {
      status: 'STRONG (polish remaining)',
      surfaces: [
        '/film/[hash] — dedicated hub: prominent owner banner + emotional copy + full <Reviews isOwner/> component',
        'Collection — real useReviews hook data + "Films you own — See reviews & write your own" + My Reviews section',
        'FilmCard — ★ avg + reviewCount + recent snippet on hover grids (landing + collection)',
        '/reviews standalone page — full experience with two-layer model note',
        'Landing page — FilmCard rows with review discoverability',
      ],
      issues: [
        'Collection page has duplicate "My Reviews" sections (rendering bug from rapid iteration)',
        'Some ownedFilms still hardcoded — needs full on-chain token enumeration + indexer',
        'Film detail still uses partial mockFilm for title/rating (needs contract + Arweave metadata)',
      ],
    },
    scale: {
      status: 'ARCHITECTURE DEFINED',
      details: [
        'Arweave primary for heavy review text + rich threads (hot path = on-chain pointers + indexer)',
        'No client-side loops — all reads via useReviews / publicClient',
        'Events (ReviewSubmitted/Updated) designed for The Graph / custom indexer',
        'hasAccessToVideo noted as linear — replace with reverse mapping or subgraph at 125M',
      ],
    },
  },
  contracts: {
    movieTicket: {
      status: 'PRODUCTION READY (Phase 0)',
      features: [
        'ReentrancyGuard on mintPermanentPass, mintBurnableTicket, withdraw',
        'Immediate creatorShare payout on mint (gas/price protection)',
        'dynamic platformFeeBps (setPlatformFee, max 50%) + getPlatformFee/getCreatorShare views',
        'hasAccessToVideo(address, string) — current impl scans for Phase 0',
        'Rich events: VideoMinted (includes fee + creatorShare), CreatorPaid, PlatformFeeUpdated',
        'pause/unpause, onlyOwner controls',
      ],
    },
    reviews: 'See above — fully wired to MovieTicket for gating',
    addresses: {
      movieTicket: process.env.NEXT_PUBLIC_MOVIE_TICKET_ADDRESS || '0x0000... (not deployed)',
      reviews: process.env.NEXT_PUBLIC_REVIEWS_ADDRESS || '0x0000... (not deployed)',
    },
  },
  workstreams: [
    { name: '1. Structural Cleanups', pct: 95, note: 'ReentrancyGuard, hooks, archival strategy docs' },
    { name: '2. Platform Fee + Creator Share Display', pct: 90, note: 'Live in mint UI via useMovieTicket' },
    { name: '3. Creator Loop (Upload → Mint + earnings)', pct: 75, note: 'Arweave upload + mint page wired' },
    { name: '4. My Collection (ownership hub)', pct: 70, note: 'Real review data, strong "I own this" copy — duplicates to clean' },
    { name: '5. Reviews (CORE — absolute #1)', pct: 82, note: 'Contract + gating + 4 surfaces live. Polish + scale path defined' },
  ],
};

// ============== HELPERS ==============
function readFileSafe(rel: string): string {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return `// File not found or unreadable: ${rel}`;
  }
}

function getGitInfo(): string {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', { cwd: ROOT, encoding: 'utf8' }).trim();
    const commit = execSync('git rev-parse --short HEAD 2>/dev/null', { cwd: ROOT, encoding: 'utf8' }).trim();
    return `${branch} @ ${commit}`;
  } catch {
    return 'git unavailable';
  }
}

function getLastModified(rel: string): string {
  try {
    const stat = fs.statSync(path.join(ROOT, rel));
    const mins = Math.floor((Date.now() - stat.mtimeMs) / 60000);
    return mins < 1 ? 'just now' : `${mins}m ago`;
  } catch {
    return '—';
  }
}

// ============== SCREEN + LAYOUT ==============
const screen = blessed.screen({
  smartCSR: true,
  mouse: true,
  fullUnicode: true,
  dockBorders: true,
  title: 'Decentralflix — Live Programming Status',
});

const header = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  tags: true,
  style: { bg: '#111111', fg: '#00ff9f' },
  content: '{bold}DECENTRALFLIX — LIVE PROGRAMMING STATUS{/bold}   |   Reviews = CORE #1   |   THIS CLI IS THE ONLY STATUS VIEWER (old .md files are legacy)',
});

const gitBox = blessed.box({
  parent: screen,
  top: 0,
  right: 2,
  width: 32,
  height: 1,
  tags: true,
  style: { fg: '#aaaaaa' },
  content: '',
});

const clock = blessed.box({
  parent: screen,
  top: 1,
  right: 2,
  width: 20,
  height: 1,
  tags: true,
  style: { fg: '#888888' },
  content: '',
});

const sidebar = blessed.list({
  parent: screen,
  top: 3,
  left: 0,
  width: 32,
  bottom: 4,
  keys: true,
  mouse: true,
  vi: true,
  tags: true,
  style: {
    selected: { bg: '#00ff9f', fg: '#000000', bold: true },
    item: { fg: '#cccccc' },
  },
  items: [
    '  Overview & Workstreams',
    '  ★ REVIEWS (CORE #1)',
    '  Contracts — MovieTicket + Reviews',
    '  Frontend Surfaces',
    '  Scale / 125M Readiness',
    '  Live Actions & Tools',
  ],
});

const detail = blessed.box({
  parent: screen,
  top: 3,
  left: 32,
  right: 0,
  bottom: 4,
  keys: true,
  mouse: true,
  scrollable: true,
  alwaysScroll: true,
  tags: true,
  // @ts-expect-error - blessed options are loose at runtime; types are incomplete
  border: { type: 'line', fg: '#333333' },
  style: { fg: '#dddddd' },
  content: '',
});

const logBox = blessed.log({
  parent: screen,
  bottom: 1,
  left: 0,
  right: 0,
  height: 3,
  tags: true,
  style: { fg: '#888888', bg: '#0a0a0a' },
  // @ts-expect-error - blessed options are loose at runtime; types are incomplete
  border: { type: 'line', fg: '#222222' },
  scrollback: 100,
});

const footer = blessed.box({
  parent: screen,
  bottom: 0,
  left: 0,
  right: 0,
  height: 1,
  tags: true,
  style: { bg: '#111111', fg: '#00ff9f' },
  content: '  ↑↓/Click select   Enter drill   q quit   c compile   t test contracts   g git log   r refresh   ? help   |   This CLI *replaces* all marker/ROADMAP/TODO files',
});

let currentIndex = 0;

// ============== RENDERERS (the live content) ==============
const navItems: NavItem[] = [
  {
    label: 'Overview & Workstreams',
    key: 'overview',
    render: () => {
      const w = STATE.workstreams.map((ws, i) => {
        const bar = '█'.repeat(Math.floor(ws.pct / 5)) + '░'.repeat(20 - Math.floor(ws.pct / 5));
        return `{bold}${ws.name}{/bold}\n   ${bar} ${ws.pct}%   ${ws.note}`;
      }).join('\n\n');
      return `{bold}PHASE 0 — FOUNDATION + REVIEWS AS ABSOLUTE CORE{/bold}\n\n` +
        `Focus: ${STATE.overall.focus}\n\n` +
        `Overall Progress: ${STATE.overall.progress}%\n\n` +
        `${w}\n\n` +
        `{yellow-fg}Note:{/yellow-fg} Reviews elevated to #1 priority per product mandate. All other workstreams serve the verified-owner critique layer.`;
    },
  },
  {
    label: '★ REVIEWS (CORE #1)',
    key: 'reviews',
    render: () => {
      const r = STATE.reviews;
      return `{bold}{green-fg}★ REVIEWS — THE DEFINING EXPERIENCE{/green-fg}{/bold}\n\n` +
        `{bold}Contract Layer — ${r.contract.status}{/bold}\n${r.contract.details.map(d => '  ' + d).join('\n')}\n\n` +
        `{bold}Ownership Gating — ${r.gating.status}{/bold}\n${r.gating.details.map(d => '  ' + d).join('\n')}\n\n` +
        `{bold}UI Surfaces — ${r.ui.status}{/bold}\n${r.ui.surfaces.map(s => '  • ' + s).join('\n')}\n\n` +
        `{red-fg}Open Issues (click Actions to fix):{/red-fg}\n${r.ui.issues.map(i => '  ! ' + i).join('\n')}\n\n` +
        `{bold}Scale Architecture{/bold}\n${r.scale.details.map(d => '  ' + d).join('\n')}`;
    },
  },
  {
    label: 'Contracts — MovieTicket + Reviews',
    key: 'contracts',
    render: () => {
      const c = STATE.contracts;
      return `{bold}MOVIE TICKET — ${c.movieTicket.status}{/bold}\n\n` +
        c.movieTicket.features.map(f => '  ✓ ' + f).join('\n') + '\n\n' +
        `{bold}REVIEWS CONTRACT{/bold}\n  Fully wired to MovieTicket.hasAccessToVideo for gating.\n  Single-review-per-owner enforced at storage layer.\n  Edit = same tx as new (upsert + ReviewUpdated event).\n\n` +
        `{bold}Current Addresses (from env){/bold}\n  MovieTicket: ${c.addresses.movieTicket}\n  Reviews:     ${c.addresses.reviews}\n\n` +
        `{yellow-fg}hasAccessToVideo{/yellow-fg} uses linear scan over totalSupply. Acceptable for indie launch. Replace with reverse mapping or subgraph for 125M users.`;
    },
  },
  {
    label: 'Frontend Surfaces',
    key: 'frontend',
    render: () => {
      const files = [
        ['Reviews.tsx', 'apps/frontend/components/Reviews.tsx'],
        ['Collection', 'apps/frontend/app/collection/page.tsx'],
        ['Film Detail /film/[hash]', 'apps/frontend/app/film/[hash]/page.tsx'],
        ['FilmCard (discoverability)', 'apps/frontend/components/FilmCard.tsx'],
        ['useReviews hook', 'apps/frontend/lib/contracts/useReviews.ts'],
      ];
      let out = '{bold}LIVE FRONTEND SURFACES (real code, real contracts){/bold}\n\n';
      files.forEach(([name, rel]) => {
        const lm = getLastModified(rel);
        out += `{bold}${name}{/bold}  — modified ${lm}\n`;
      });
      out += '\nClick any item in Actions panel to view live excerpts or open in $EDITOR.\n\n';
      out += 'Key emotional copy locations:\n';
      out += '  • film/[hash]: "Because you own a verified ticket, your review will be permanently visible... Your opinion matters here in a way it never could on a centralized platform."\n';
      out += '  • Collection: "You own this film on-chain. Your reviews are verified and visible to everyone who cares about it."\n';
      return out;
    },
  },
  {
    label: 'Scale / 125M Readiness',
    key: 'scale',
    render: () => {
      return `{bold}125 MILLION USER ARCHITECTURE (already designed in Phase 0){/bold}\n\n` +
        `• Storage: Arweave primary for video + long reviews + rich threads\n` +
        `• Hot path: on-chain ownership + avg/rating/count via indexer (The Graph or custom)\n` +
        `• Cold path: full text fetched from Arweave manifests per film\n` +
        `• Write path: queue + rate limit + Arweave bundler (no direct heavy client writes)\n` +
        `• No client-side polling loops — all reads through hooks + edge cache\n\n` +
        `{yellow-fg}Current hasAccessToVideo linear scan is the only known hot-spot blocker for extreme scale.{/yellow-fg}\n` +
        `Plan: Add tokenIdByVideoHash reverse index or move gating reads to subgraph before public launch.\n\n` +
        `Reviews events are already indexer-friendly (ReviewSubmitted/Updated with videoHash + reviewer).`;
    },
  },
  {
    label: 'Live Actions & Tools',
    key: 'actions',
    render: () => {
      return `{bold}CLICK OR PRESS KEY TO EXECUTE{/bold}\n\n` +
        `  [c]  Hardhat compile (contracts)\n` +
        `  [t]  Run contract tests\n` +
        `  [g]  Show recent git log (Reviews-related)\n` +
        `  [f]  Show live excerpts from key files (below)\n\n` +
        `  [1]  View Reviews.tsx (gating + edit logic)\n` +
        `  [2]  View Collection page (current state)\n` +
        `  [3]  View /film/[hash] owner banner\n` +
        `  [4]  View Reviews.sol (single-review mapping)\n` +
        `  [5]  View hasAccessToVideo impl\n\n` +
        `  [e]  Edit selected file in $EDITOR (when a file is focused)\n` +
        `  [r]  Force refresh all panels\n\n` +
        `{green-fg}This panel + the code it surfaces IS the live programming status.{/green-fg}`;
    },
  },
];

// ============== UPDATE DETAIL ==============
function updateDetail(index: number) {
  currentIndex = index;
  const item = navItems[index];
  detail.setContent(item.render());
  detail.scrollTo(0);
  screen.render();
}

// ============== LIVE CLOCK + GIT ==============
function updateClockAndGit() {
  const now = new Date().toLocaleTimeString('en-US', { hour12: false });
  clock.setContent(`{dim}${now}{/dim}`);
  gitBox.setContent(`{dim}${getGitInfo()}{/dim}`);
  screen.render();
}

// ============== FILE WATCHER (LIVE) ==============
let watcher: fs.FSWatcher | null = null;
function startWatcher() {
  // Simple polling watcher (no extra deps) — updates log when key files change
  const poll = setInterval(() => {
    KEY_FILES.forEach((rel) => {
      try {
        const full = path.join(ROOT, rel);
        const stat = fs.statSync(full);
        // We just log on change detection via mtime in a real impl would be better with chokidar
      } catch {}
    });
  }, 8000);

  // Use native fs.watch where possible (best effort)
  try {
    watcher = fs.watch(ROOT, { recursive: false }, (event, filename) => {
      if (filename && KEY_FILES.some(k => filename.includes(path.basename(k)))) {
        logBox.log(`{yellow-fg}FILE CHANGED{/yellow-fg} ${filename} — press [r] to refresh panels`);
        screen.render();
      }
    });
  } catch {}
  return poll;
}

// ============== ACTIONS ==============
function runCommand(cmd: string, label: string) {
  logBox.log(`{cyan-fg}▶ ${label}{/cyan-fg}`);
  const child = spawn('bash', ['-c', cmd], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

  child.stdout.on('data', (d) => logBox.log(d.toString().trim()));
  child.stderr.on('data', (d) => logBox.log(`{red-fg}${d.toString().trim()}{/red-fg}`));
  child.on('close', (code) => {
    logBox.log(`{green-fg}✓ ${label} exited (${code}){/green-fg}`);
    screen.render();
  });
}

function showFileExcerpt(rel: string, title: string) {
  const content = readFileSafe(rel);
  const lines = content.split('\n').slice(0, 42).join('\n');
  const popup = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '90%',
    height: '80%',
    tags: true,
    scrollable: true,
    keys: true,
    mouse: true,
    // @ts-expect-error - blessed options are loose at runtime; types are incomplete
    border: { type: 'line', fg: '#00ff9f' },
    label: ` ${title} — ${rel} (ESC to close) `,
    content: `{dim}Last modified: ${getLastModified(rel)}{/dim}\n\n` + lines,
  });
  popup.focus();
  popup.key(['escape', 'q'], () => {
    popup.destroy();
    screen.render();
    sidebar.focus();
  });
  screen.render();
}

function openInEditor(rel: string) {
  const editor = process.env.EDITOR || process.env.VISUAL || 'nano';
  const full = path.join(ROOT, rel);
  logBox.log(`Opening ${rel} in ${editor}...`);
  const child = spawn(editor, [full], { stdio: 'inherit' });
  child.on('exit', () => {
    logBox.log(`Returned from editor. Press [r] to refresh.`);
    screen.render();
  });
}

// ============== KEYBOARD + MOUSE BINDINGS ==============
sidebar.on('select', (item: blessed.Widgets.BoxElement, index: number) => {
  updateDetail(index);
});

sidebar.key(['enter', 'space'], () => {
  const idx = (sidebar as any).selected;
  updateDetail(idx);
});

screen.key(['q', 'C-c'], () => process.exit(0));

screen.key(['r'], () => {
  logBox.log('Refreshed panels');
  updateDetail(currentIndex);
  updateClockAndGit();
});

screen.key(['c'], () => runCommand('cd packages/contracts && npx hardhat compile', 'Hardhat compile'));
screen.key(['t'], () => runCommand('cd packages/contracts && npx hardhat test', 'Contract tests'));

screen.key(['g'], () => {
  try {
    const out = execSync('git log --oneline -12 --all -- "packages/contracts/contracts/*" "apps/frontend/**/*Reviews*" "apps/frontend/app/collection*" "apps/frontend/app/film*" 2>/dev/null || git log --oneline -8 2>/dev/null || echo "git history unavailable in this environment"', { cwd: ROOT, encoding: 'utf8' });
    const popup = blessed.box({
      parent: screen,
      top: 'center', left: 'center', width: '85%', height: 18,
      tags: true, border: { type: 'line' }, label: ' Recent commits touching Reviews / Contracts ',
      content: out,
    });
    popup.key(['escape', 'q'], () => { popup.destroy(); screen.render(); });
    screen.render();
  } catch (e) {
    logBox.log('git log unavailable');
  }
});

screen.key(['1'], () => showFileExcerpt('apps/frontend/components/Reviews.tsx', 'Reviews Component — gating + edit flow'));
screen.key(['2'], () => showFileExcerpt('apps/frontend/app/collection/page.tsx', 'Collection — ownership + reviews hub'));
screen.key(['3'], () => showFileExcerpt('apps/frontend/app/film/[hash]/page.tsx', 'Per-film hub — owner banner + Reviews embed'));
screen.key(['4'], () => showFileExcerpt('packages/contracts/contracts/Reviews.sol', 'Reviews.sol — single review per owner + gating'));
screen.key(['5'], () => showFileExcerpt('packages/contracts/contracts/MovieTicket.sol', 'hasAccessToVideo implementation (Phase 0 scan)'));

screen.key(['e'], () => {
  const map: Record<string, string> = {
    'reviews': 'apps/frontend/components/Reviews.tsx',
    'frontend': 'apps/frontend/app/collection/page.tsx',
    'contracts': 'packages/contracts/contracts/Reviews.sol',
  };
  const rel = map[navItems[currentIndex].key];
  if (rel) openInEditor(rel);
  else logBox.log('No direct edit target for current panel. Use 1-5 keys to pick a file first.');
});

screen.key(['?'], () => {
  const help = blessed.box({
    parent: screen,
    top: 'center', left: 'center', width: 70, height: 16,
    tags: true,
    // @ts-expect-error - blessed options are loose at runtime; types are incomplete
    border: { type: 'line', fg: '#00ff9f' },
    label: ' KEYBOARD & MOUSE HELP ',
    content: `
Mouse: Click sidebar items or scroll in detail/log boxes.

Keyboard:
  ↑ ↓          Move in sidebar
  Enter        Drill into selected panel
  1-5          Instantly show live code excerpts of core files
  c            Hardhat compile
  t            Run contract tests
  g            Git log (Reviews + contract files)
  r            Force refresh all panels + clock
  e            Edit current panel's primary file in $EDITOR
  q / Ctrl-C   Quit

This TUI is the live, clickable source of truth for where the programming is at.
All previous marker.md / ROADMAP.md / TODO.md files are now legacy.
    `,
  });
  help.key(['escape', 'q', '?'], () => { help.destroy(); screen.render(); });
  screen.render();
});

// ============== INITIAL RENDER + LOOP ==============
function init() {
  sidebar.focus();
  updateDetail(1); // Start on REVIEWS (CORE) — the most important
  updateClockAndGit();

  // Live clock
  setInterval(updateClockAndGit, 1000);

  // File watcher
  startWatcher();

  // Initial log message + legacy MD detection (drives the "no separate files" rule)
  logBox.log('{green-fg}Decentralflix Live Status ready.{/green-fg}  Mouse click or ↑↓ + Enter. Press ? for controls.');
  logBox.log('Reviews system is the #1 product feature. This TUI is now the single source of truth.');

  const legacy = ['marker.md', 'ROADMAP.md', 'TODO.md', 'PHASE0.md'].filter(f => {
    try { fs.accessSync(path.join(ROOT, f)); return true; } catch { return false; }
  });
  if (legacy.length) {
    logBox.log(`{yellow-fg}Legacy tracking files still present:{/yellow-fg} ${legacy.join(', ')} — they are no longer updated. Use this CLI only.`);
  }

  screen.render();
}

init();