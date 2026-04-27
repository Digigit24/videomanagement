import { Card, CardContent } from './ui/card';
import { DashboardStats } from '@/types';
import { FileVideo, Clock, Search, CheckCircle, AlertTriangle, XCircle, FileEdit, Send } from 'lucide-react';

interface DashboardCardsProps {
  stats: DashboardStats;
  totalEverPosted?: number;
}

export default function DashboardCards({ stats, totalEverPosted }: DashboardCardsProps) {
  const cards = [
    { title: 'Total', value: stats.total, icon: FileVideo, color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800' },
    { title: 'Draft', value: stats.draft, icon: FileEdit, color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800' },
    { title: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/50' },
    { title: 'Under Review', value: stats.underReview, icon: Search, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/50' },
    { title: 'Approved', value: stats.approved, icon: CheckCircle, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/50' },
    { title: 'Changes Needed', value: stats.changesNeeded, icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/50' },
    { title: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/50' },
    { title: 'Posted', value: stats.posted, icon: Send, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/50', subtitle: totalEverPosted !== undefined && totalEverPosted > stats.posted ? `${totalEverPosted} total` : undefined },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
      {cards.map((card) => (
        <Card key={card.title} className={`border-gray-200 dark:border-gray-700 dark:bg-gray-900 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${card.title === 'Total' ? 'col-span-2 sm:col-span-1' : ''}`}>
          <CardContent className="pt-3 pb-2.5 px-3 sm:pt-4 sm:pb-3 sm:px-4">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{card.title}</span>
              <div className={`p-1 sm:p-1.5 rounded ${card.bg}`}>
                <card.icon className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${card.color}`} />
              </div>
            </div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{card.value}</div>
            {'subtitle' in card && card.subtitle && (
              <div className="text-[9px] text-gray-400 dark:text-gray-500 font-medium mt-0.5">{card.subtitle}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
