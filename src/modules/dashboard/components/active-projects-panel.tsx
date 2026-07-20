import Link from 'next/link';

import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/states';

import type { ActiveProjectRow } from '../dashboard.service';

interface Props {
  projects: ActiveProjectRow[];
}

function daysLeftLabel(endDate: Date | null): string {
  if (!endDate) return 'No end date';

  const days = Math.ceil((endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';

  return `${days} day${days === 1 ? '' : 's'} left`;
}

export function ActiveProjectsPanel({ projects }: Props) {
  if (projects.length === 0) {
    return <EmptyState title="No active projects" description="Projects in progress will show up here." />;
  }

  return (
    <div className="space-y-6">
      {projects.map((project) => {
        const percent =
          project.totalTasks === 0 ? 0 : Math.round((project.completedTasks / project.totalTasks) * 100);

        return (
          <Link key={project.id} href={`/dashboard/projects`} className="group block space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium transition-colors group-hover:text-primary">
                {project.name}
              </span>
              <span className="text-xs text-muted-foreground">{percent}%</span>
            </div>
            <Progress value={percent} className="h-1.5" />
            <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
              {daysLeftLabel(project.endDate)}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
