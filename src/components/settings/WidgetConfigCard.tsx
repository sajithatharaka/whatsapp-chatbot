import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WidgetConfig } from '@/lib/widget/types';

export function WidgetConfigCard({ config }: { config: WidgetConfig }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border p-4"
      data-testid="settings-widget-config-card"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{config.title}</p>
          <p className="text-xs text-muted-foreground">
            {config.allowed_origins.length} allowed domain
            {config.allowed_origins.length === 1 ? '' : 's'}
          </p>
        </div>
        <Badge variant={config.enabled ? 'default' : 'secondary'}>
          {config.enabled ? 'Enabled' : 'Disabled'}
        </Badge>
      </div>
      <Button asChild variant="outline" size="sm" className="w-fit">
        <Link href="/dashboard/widget" data-testid="settings-widget-config-link">
          Manage widget settings
        </Link>
      </Button>
    </div>
  );
}
