import { useState, useEffect } from 'react';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { REVIEWS_ADDRESS, REVIEWS_ABI } from './config';

// REVIEWS_ABI now comes from the generated ABIs (via config) so it stays in sync with the
// compiled contract. Re-exported here for existing consumers (e.g. components/Reviews.tsx).
export { REVIEWS_ABI };

export function useReviews(videoHash: string) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  const fetchReviews = async () => {
    if (!REVIEWS_ADDRESS || REVIEWS_ADDRESS === '0x0000000000000000000000000000000000000000' || !videoHash) {
      return;
    }

    setIsLoading(true);
    try {
      const [count, reviewList] = await Promise.all([
        publicClient.readContract({
          address: REVIEWS_ADDRESS,
          abi: REVIEWS_ABI,
          functionName: 'getReviewCount',
          args: [videoHash],
        }),
        publicClient.readContract({
          address: REVIEWS_ADDRESS,
          abi: REVIEWS_ABI,
          functionName: 'getReviews',
          args: [videoHash],
        }),
      ]);

      setReviewCount(Number(count));
      setReviews(reviewList as any[]);
    } catch (err) {
      console.warn('Could not fetch reviews (contract may not be deployed)');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [videoHash]);

  return {
    reviews,
    reviewCount,
    isLoading,
    refresh: fetchReviews,
  };
}