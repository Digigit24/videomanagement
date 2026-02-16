import { Card, CardContent } from './ui/card';
import { DashboardStats } from '@/types';
import { FileVideo, Clock, Search, CheckCircle, AlertTriangle, XCircle, FileEdit } from 'lucide-react';

interface DashboardCardsProps {
  stats: DashboardStats;
}

export default function DashboardCards({ stats }: DashboardCardsProps) {
  const cards = [
    { title: 'Total', value: stats.total, icon: FileVideo, color: 'text-gray-600', bg: 'bg-gray-50' },
    { title: 'Draft', value: stats.draft, icon: FileEdit, color: 'text-slate-600', bg: 'bg-slate-50' },
    { title: 'Pending', value: stats.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { title: 'Under Review', value: stats.underReview, icon: Search, color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Approved', value: stats.approved, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: 'Changes Needed', value: stats.changesNeeded, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50' },
    { title: 'Rejected', value: stats.rejected, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card) => (
        <Card key={card.title} className="border-gray-200">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.title}</span>
              <div className={`p-1.5 rounded ${card.bg}`}>
                <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
