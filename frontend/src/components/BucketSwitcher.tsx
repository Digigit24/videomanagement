import { useBucket } from '@/hooks/useBucket';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Database } from 'lucide-react';

export default function BucketSwitcher() {
  const { buckets, currentBucket, switchBucket, loading } = useBucket();

  if (loading || !currentBucket) {
    return <div className="text-sm text-gray-500">Loading buckets...</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <Database className="h-4 w-4 text-gray-500" />
      <Select value={currentBucket} onValueChange={switchBucket}>
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {buckets.map((bucket) => (
            <SelectItem key={bucket} value={bucket}>
              {bucket}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
