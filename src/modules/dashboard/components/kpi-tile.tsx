import type { LucideIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  icon: LucideIcon;
  label: string;
  value: string;
  href: Route;
  footer?: React.ReactNode;
}

/** One of the four overview tiles. A plain Server Component — nothing here needs client JS. */
export function KpiTile({ icon: Icon, label, value, href, footer }: Props) {
  return (
    <Link href={href}>
      <Card className={cn('relative overflow-hidden glass transition-colors hover:border-primary/30')}>
        <CardContent className="space-y-3">
          <Icon className="absolute top-4 right-4 size-9 text-muted-foreground/10" aria-hidden />
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
          {footer}
        </CardContent>
      </Card>
    </Link>
  );
}
