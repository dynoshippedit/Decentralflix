'use client';

import { useState } from 'react';
import { uploadToArweave, uploadJSON, type UploadResult } from '@/lib/arweave/upload';

/**
 * React hook for easy Arweave uploads in Decentralflix components.
 * Handles loading + error state.
 *
 * Usage:
 *   const { upload, uploading, result, error } = useArweaveUpload();
 *   await upload(fileBuffer, 'video/mp4', { 'Title': 'My Film' });
 */
export function useArweaveUpload() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (
    data: Uint8Array | ArrayBuffer | Buffer,
    contentType: string,
    tags: Record<string, string> = {}
  ): Promise<UploadResult | null> => {
    const fileBuffer = Buffer.from(data as any); // Safe conversion for browser + node
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const uploadResult = await uploadToArweave(fileBuffer, contentType, tags);
      setResult(uploadResult);
      return uploadResult;
    } catch (err: any) {
      const message = err?.message || 'Arweave upload failed';
      setError(message);
      console.error('[useArweaveUpload]', err);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const uploadJson = async (data: unknown, tags: Record<string, string> = {}) => {
    setUploading(true);
    setError(null);

    try {
      const uploadResult = await uploadJSON(data, tags);
      setResult(uploadResult);
      return uploadResult;
    } catch (err: any) {
      const message = err?.message || 'JSON upload to Arweave failed';
      setError(message);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setUploading(false);
  };

  return {
    upload,
    uploadJson,
    uploading,
    result,
    error,
    reset,
  };
}
