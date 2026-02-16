import { LayoutGrid, List } from 'lucide-react';
import { Button } from './ui/button';

interface ViewSwitcherProps {
  view: 'list' | 'kanban';
  onViewChange: (view: 'list' | 'kanban') => void;
}

export default function ViewSwitcher({ view, onViewChange }: ViewSwitcherProps) {
  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
      <Button
        variant={view === 'list' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('list')}
        className="h-8"
      >
        <List className="h-4 w-4 mr-2" />
        List
      </Button>
      <Button
        variant={view === 'kanban' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('kanban')}
        className="h-8"
      >
        <LayoutGrid className="h-4 w-4 mr-2" />
        Kanban
      </Button>
    </div>
  );
}
