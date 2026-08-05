import { WidgetSettingsForm } from '@/components/widget/WidgetSettingsForm';
import { getWidgetConfig } from '@/lib/supabase/admin-api';

export default async function WidgetPage() {
  const config = await getWidgetConfig();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Website Widget</h1>
        <p className="text-sm text-muted-foreground">
          Add a chat bubble to your own website, backed by the same knowledge base as the WhatsApp
          assistant. List every domain the widget is allowed to run on, then paste the embed snippet
          into your site.
        </p>
      </div>
      <WidgetSettingsForm initialConfig={config} />
    </div>
  );
}
