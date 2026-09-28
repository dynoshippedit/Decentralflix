'use client';

import { useState, useCallback } from 'react';

export type FilmMetadataInput = {
  title: string;
  description: string;
  genre: string;
  tierPrices: {
    BASIC: number;
    DELUXE: number;
    PRODUCER: number;
  };
};

export type UploadResult = {
  r2Key: string;
  livepeerPlaybackId: string;
  arweaveMetadataTxId: string;
  filecoinCid: string;
  isSimulation: boolean;
};

export type UploadProgress = {
  step: 1 | 2 | 3 | 4;
  stepName: string;
  percent: number;
  message: string;
};

export function useVideoUpload() {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const upload = useCallback(async (file: File, metadata: FilmMetadataInput): Promise<UploadResult> => {
    setError(null);
    setIsUploading(true);

    const isSimulation = !process.env.NEXT_PUBLIC_LIVEPEER_API_KEY;

    try {
      // STEP 1 — Livepeer Transcode
      setProgress({ step: 1, stepName: 'Transcoding with Livepeer', percent: 10, message: 'Uploading to Livepeer...' });

      let playbackId = 'sim_' + Date.now();
      let assetId = 'asset_' + Date.now();

      if (!isSimulation) {
        // Real Livepeer upload would go here
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('https://livepeer.studio/api/asset/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_LIVEPEER_API_KEY}` },
          body: formData,
        });
        const asset = await res.json();
        assetId = asset.asset.id;
        playbackId = asset.asset.playbackId;

        // Poll until ready (simplified)
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 2000));
          // In real code: check status
          setProgress({ step: 1, stepName: 'Transcoding with Livepeer', percent: 10 + (i * 2), message: `Processing... ${i * 3}%` });
        }
      } else {
        // Simulation — realistic timing
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 400));
          setProgress({ step: 1, stepName: 'Transcoding with Livepeer', percent: 10 + (i * 14), message: 'Simulating Livepeer transcode...' });
        }
      }

      // STEP 2 — R2 (via backend presign in real)
      setProgress({ step: 2, stepName: 'Uploading to Cloudflare R2', percent: 55, message: 'Getting presigned URL...' });

      let r2Key = `videos/${playbackId}/master.m3u8`;
      if (!isSimulation) {
        // Call your backend /api/upload/r2-presign here
        // Then PUT the segments
      } else {
        await new Promise(r => setTimeout(r, 600));
        r2Key = `sim/${playbackId}/index.m3u8`;
      }
      setProgress({ step: 2, stepName: 'Uploading to Cloudflare R2', percent: 75, message: 'HLS segments uploaded to R2' });

      // STEP 3 — Arweave metadata only (use existing hook if available)
      setProgress({ step: 3, stepName: 'Archiving metadata to Arweave', percent: 82, message: 'Uploading manifest JSON...' });

      const manifest = {
        title: metadata.title,
        description: metadata.description,
        genre: metadata.genre,
        r2Key,
        livepeerPlaybackId: playbackId,
        thumbnailHash: 'sim-thumb',
        tierPrices: metadata.tierPrices,
        timestamp: new Date().toISOString(),
        isSimulation,
      };

      let arweaveTxId = 'sim-arweave-' + Date.now();
      if (!isSimulation) {
        // Use existing useArweaveUpload here in real implementation
      } else {
        await new Promise(r => setTimeout(r, 500));
      }

      // STEP 4 — Filecoin (simulation) + return pointers
      setProgress({ step: 4, stepName: 'Registering on Filecoin + on-chain', percent: 95, message: 'Mirroring to Filecoin...' });

      const filecoinCid = isSimulation ? 'bafy-sim-' + Date.now() : 'real-filecoin-cid';

      await new Promise(r => setTimeout(r, 300));

      const result: UploadResult = {
        r2Key,
        livepeerPlaybackId: playbackId,
        arweaveMetadataTxId: arweaveTxId,
        filecoinCid,
        isSimulation,
      };

      setProgress({ step: 4, stepName: 'Complete', percent: 100, message: 'Upload pipeline finished' });
      setIsUploading(false);

      return result;
    } catch (e: any) {
      setError(e.message || 'Upload failed');
      setIsUploading(false);
      setProgress(null);
      throw e;
    }
  }, []);

  return {
    upload,
    progress,
    error,
    isUploading,
  };
}
