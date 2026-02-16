import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { DashboardStats } from '@/types';
import { FileVideo, FileEdit, CheckCircle, Globe, Archive } from 'lucide-react';

interface DashboardCardsProps {
  stats: DashboardStats;
}

export default function DashboardCards({ stats }: DashboardCardsProps) {
  const cards = [
    { title: 'Total Videos', value: stats.total, icon: FileVideo, color: 'text-blue-600' },
    { title: 'Draft', value: stats.draft, icon: FileEdit, color: 'text-gray-600' },
    { title: 'In Review', value: stats.inReview, icon: CheckCircle, color: 'text-yellow-600' },
    { title: 'Published', value: stats.published, icon: Globe, color: 'text-green-600' },
    { title: 'Archived', value: stats.archived, icon: Archive, color: 'text-red-600' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
