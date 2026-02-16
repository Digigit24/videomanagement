import { useBucket } from '@/hooks/useBucket';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Folder } from 'lucide-react';

export default function BucketSwitcher() {
  const { buckets, currentBucket, switchBucket, loading } = useBucket();

  if (loading || !currentBucket) {
    return <div className="text-xs text-gray-400">Loading...</div>;
  }

  if (buckets.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <Folder className="h-3.5 w-3.5" />
        <span>{currentBucket}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Folder className="h-3.5 w-3.5 text-gray-400" />
      <Select value={currentBucket} onValueChange={switchBucket}>
        <SelectTrigger className="w-[160px] h-8 text-xs border-gray-200">
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
