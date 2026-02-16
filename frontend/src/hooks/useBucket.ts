import { useState, useEffect } from 'react';
import { bucketService } from '@/services/api.service';

export function useBucket() {
  const [buckets, setBuckets] = useState<string[]>([]);
  const [currentBucket, setCurrentBucket] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBuckets();
  }, []);

  const loadBuckets = async () => {
    try {
      const data = await bucketService.getBuckets();
      setBuckets(data);

      const saved = localStorage.getItem('currentBucket');
      if (saved && data.includes(saved)) {
        setCurrentBucket(saved);
      } else if (data.length > 0) {
        setCurrentBucket(data[0]);
      }
    } catch (error) {
      console.error('Failed to load buckets:', error);
    } finally {
      setLoading(false);
    }
  };

  const switchBucket = (bucket: string) => {
    setCurrentBucket(bucket);
    localStorage.setItem('currentBucket', bucket);
  };

  return { buckets, currentBucket, switchBucket, loading };
}
