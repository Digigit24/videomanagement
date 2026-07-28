import { Card, CardContent } from './ui/card';
import { DashboardStats, VideoStatus, ALL_STATUSES } from '@/types';
import { FileVideo, Clock, Search, CheckCircle, AlertTriangle, XCircle, FileEdit, Send } from 'lucide-react';

interface DashboardCardsProps {
  stats: DashboardStats;
  totalEverPosted?: number;
  /** Currently selected status filter — a VideoStatus or "all". */
  activeStatus?: string;
  /** When provided, the cards become filter buttons. */
  onSelectStatus?: (status: string) => void;
}

interface StatCard {
  title: string;
  /** Exact filter value: a VideoStatus from the shared enum, or "all". */
  status: VideoStatus | typeof ALL_STATUSES;
  value: number;
  icon: typeof FileVideo;
  color: string;
  bg: string;
  /** Border + ring used when this card is the active filter. */
  active: string;
  subtitle?: string;
}

export default function DashboardCards({ stats, totalEverPosted, activeStatus, onSelectStatus }: DashboardCardsProps) {
  const cards: StatCard[] = [
    { title: 'Total', status: ALL_STATUSES, value: stats.total, icon: FileVideo, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800', active: 'border-gray-400 dark:border-gray-500 ring-2 ring-gray-300 dark:ring-gray-600 bg-gray-50 dark:bg-gray-800' },
    { title: 'Draft', status: 'Draft', value: stats.draft, icon: FileEdit, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800', active: 'border-slate-400 dark:border-slate-500 ring-2 ring-slate-300 dark:ring-slate-600 bg-slate-50 dark:bg-slate-900' },
    { title: 'Pending', status: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/50', active: 'border-amber-400 dark:border-amber-500 ring-2 ring-amber-300 dark:ring-amber-700 bg-amber-50 dark:bg-amber-950' },
    { title: 'Under Review', status: 'Under Review', value: stats.underReview, icon: Search, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/50', active: 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700 bg-blue-50 dark:bg-blue-950' },
    { title: 'Approved', status: 'Approved', value: stats.approved, icon: CheckCircle, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/50', active: 'border-emerald-400 dark:border-emerald-500 ring-2 ring-emerald-300 dark:ring-emerald-700 bg-emerald-50 dark:bg-emerald-950' },
    { title: 'Changes Needed', status: 'Changes Needed', value: stats.changesNeeded, icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/50', active: 'border-orange-400 dark:border-orange-500 ring-2 ring-orange-300 dark:ring-orange-700 bg-orange-50 dark:bg-orange-950' },
    { title: 'Rejected', status: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/50', active: 'border-red-400 dark:border-red-500 ring-2 ring-red-300 dark:ring-red-700 bg-red-50 dark:bg-red-950' },
    { title: 'Posted', status: 'Posted', value: stats.posted, icon: Send, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/50', active: 'border-violet-400 dark:border-violet-500 ring-2 ring-violet-300 dark:ring-violet-700 bg-violet-50 dark:bg-violet-950', subtitle: totalEverPosted !== undefined && totalEverPosted > stats.posted ? `${totalEverPosted} total` : undefined },
  ];

  const interactive = typeof onSelectStatus === 'function';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
      {cards.map((card) => {
        const isActive = interactive && activeStatus === card.status;
        const spanClass = card.title === 'Total' ? 'col-span-2 sm:col-span-1' : '';

        const content = (
          <Card
            className={`h-full transition-all duration-200 dark:bg-gray-900 ${
              isActive
                ? card.active
                : 'border-gray-200 dark:border-gray-700'
            } ${interactive ? 'hover:shadow-md hover:-translate-y-0.5' : 'hover:shadow-md hover:-translate-y-0.5'}`}
          >
            <CardContent className="pt-3 pb-2.5 px-3 sm:pt-4 sm:pb-3 sm:px-4">
              <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{card.title}</span>
                <div className={`p-1 sm:p-1.5 rounded ${card.bg}`}>
                  <card.icon className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${card.color}`} />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{card.value}</div>
              {card.subtitle && (
                <div className="text-[9px] text-gray-400 dark:text-gray-500 font-medium mt-0.5">{card.subtitle}</div>
              )}
            </CardContent>
          </Card>
        );

        if (!interactive) {
          return <div key={card.title} className={spanClass}>{content}</div>;
        }

        return (
          <button
            key={card.title}
            type="button"
            onClick={() => onSelectStatus?.(card.status)}
            aria-pressed={isActive}
            aria-label={`Filter by ${card.title}`}
            title={`Filter by ${card.title}`}
            className={`text-left cursor-pointer rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950 ${spanClass}`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
