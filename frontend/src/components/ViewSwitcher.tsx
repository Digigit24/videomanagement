import { LayoutGrid, List, Calendar } from 'lucide-react';
import { Button } from './ui/button';

interface ViewSwitcherProps {
  view: 'list' | 'kanban' | 'calendar';
  onViewChange: (view: 'list' | 'kanban' | 'calendar') => void;
}

export default function ViewSwitcher({ view, onViewChange }: ViewSwitcherProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
      <Button
        variant={view === 'list' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('list')}
        className="h-7 px-2.5 text-xs gap-1.5"
      >
        <List className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">List</span>
      </Button>
      <Button
        variant={view === 'kanban' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('kanban')}
        className="h-7 px-2.5 text-xs gap-1.5"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Board</span>
      </Button>
      <Button
        variant={view === 'calendar' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('calendar')}
        className="h-7 px-2.5 text-xs gap-1.5"
      >
        <Calendar className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Calendar</span>
      </Button>
    </div>
  );
}
