'use strict';
// CDN abstraction for the Decentralflix Lifeboat.
//
// Common interface:
//   getPlaybackUrl(film)        -> string URL a player can load
//   streamFile(req, res, film)  -> pipes video bytes, honoring Range
//
// Backends:
//   LocalOrigin — serves masters from ./data/masters on this box with full
//                 HTTP Range support (206 Partial Content) so <video> seeking
//                 works. This is the M1-active backend.
//   Bunny       — pull-zone style backend. Code-complete but NOT activated:
//                 every method throws "Bunny not configured — set env vars"
//                 until BUNNY_STORAGE_ZONE, BUNNY_API_KEY and
//                 BUNNY_PULLZONE_HOSTNAME are set. Nothing here spends money
//                 or provisions anything.

const fs = require('node:fs');
const path = require('node:path');

class LocalOrigin {
  constructor({ mastersDir }) {
    if (!mastersDir) throw new Error('LocalOrigin requires mastersDir');
    this.mastersDir = mastersDir;
  }

  getPlaybackUrl(film) {
    return `/api/films/${film.film_id}/stream`;
  }

  masterPath(film) {
    // film_id is server-generated ([a-z0-9_]), so no traversal risk.
    return path.join(this.mastersDir, `${film.film_id}.mp4`);
  }

  streamFile(req, res, film) {
    const filePath = this.masterPath(film);
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'master not found' }));
        return;
      }
      const total = st.size;
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'video/mp4');

      const range = req.headers.range;
      if (!range) {
        res.writeHead(200, { 'Content-Length': total });
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
      let start = null;
      let end = null;
      if (m) {
        if (m[1] === '' && m[2] !== '') {
          // Suffix range: last N bytes.
          const suffix = parseInt(m[2], 10);
          start = Number.isNaN(suffix) ? null : Math.max(0, total - suffix);
          end = total - 1;
        } else {
          start = m[1] === '' ? 0 : parseInt(m[1], 10);
          end = m[2] === '' ? total - 1 : parseInt(m[2], 10);
        }
      }

      const bad =
        m === null ||
        start === null ||
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start > end ||
        start >= total ||
        end >= total;
      if (bad) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        res.end();
        return;
      }

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': end - start + 1,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    });
  }
}

class Bunny {
  constructor() {
    this.storageZone = process.env.BUNNY_STORAGE_ZONE;
    this.apiKey = process.env.BUNNY_API_KEY;
    this.pullzoneHostname = process.env.BUNNY_PULLZONE_HOSTNAME;
  }

  _assertConfigured() {
    if (!this.storageZone || !this.apiKey || !this.pullzoneHostname) {
      throw new Error(
        'Bunny not configured — set env vars (BUNNY_STORAGE_ZONE, BUNNY_API_KEY, BUNNY_PULLZONE_HOSTNAME)'
      );
    }
  }

  // Pull-zone model: the player loads straight from the pull zone; upload to
  // the storage zone happens at import time (Phase 2 wiring, not M1).
  getPlaybackUrl(film) {
    this._assertConfigured();
    return `https://${this.pullzoneHostname}/masters/${film.film_id}.mp4`;
  }

  streamFile(req, res, film) {
    this._assertConfigured();
    // Behind a pull zone the origin redirects the player to the edge.
    res.writeHead(302, { Location: this.getPlaybackUrl(film) });
    res.end();
  }
}

function createCdn({ mastersDir }) {
  if ((process.env.CDN_BACKEND || '').toLowerCase() === 'bunny') return new Bunny();
  return new LocalOrigin({ mastersDir });
}

module.exports = { LocalOrigin, Bunny, createCdn };
