'use client';

import React, { useState } from 'react';
import { useArweaveUpload } from '@/hooks/useArweaveUpload';

/**
 * UploadTest - Placeholder component for testing the Arweave upload pipeline.
 * For Phase 0 demo purposes. In production this will be part of the Creator Dashboard.
 *
 * Requires ARWEAVE_WALLET_JSON in .env.local to actually work.
 */
export default function UploadTest() {
  const { upload, uploading, result, error, reset } = useArweaveUpload();
  const [fileName, setFileName] = useState<string>('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    reset();

    // Read file as ArrayBuffer for the hook
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload with some tags
    await upload(uint8Array, file.type || 'application/octet-stream', {
      'File-Name': file.name,
      'Uploaded-Via': 'Decentralflix-Phase0',
    });
  };

  return (
    <div className="max-w-md mx-auto bg-zinc-900 border border-white/10 rounded-2xl p-6 text-left">
      <h3 className="text-lg font-semibold mb-2">Test Arweave Upload (Phase 0)</h3>
      <p className="text-sm text-white/60 mb-4">
        Select a small file to upload to Arweave. This uses the pipeline created in Phase 0.
      </p>

      <input
        type="file"
        onChange={handleFileChange}
        disabled={uploading}
        className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-white file:text-black hover:file:bg-white/90 cursor-pointer mb-4"
      />

      {uploading && (
        <div className="text-amber-400 text-sm mb-2">Uploading to Arweave...</div>
      )}

      {error && (
        <div className="text-red-400 text-sm mb-2">
          Error: {error} <br />
          <span className="text-xs">(Add ARWEAVE_WALLET_JSON to .env.local to test)</span>
        </div>
      )}

      {result && (
        <div className="text-emerald-400 text-sm mb-2 break-all">
          ✅ Uploaded! <br />
          TX: <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline">
            {result.id}
          </a>
          <div className="mt-3">
            <a
              href={`/mint?videoHash=${result.id}`}
              className="inline-block px-6 py-2 text-sm bg-white text-black rounded-full hover:bg-white/90 transition-all"
            >
              Mint this video →
            </a>
          </div>
        </div>
      )}

      {(result || error) && (
        <button
          onClick={reset}
          className="mt-2 text-xs text-white/70 hover:text-white"
        >
          Reset
        </button>
      )}

      {fileName && !uploading && !result && !error && (
        <div className="text-xs text-white/50">Selected: {fileName}</div>
      )}
    </div>
  );
}
