import { AiConfigForm } from '@/components/settings/AiConfigForm';
import { WidgetConfigCard } from '@/components/settings/WidgetConfigCard';
import { getAiConfig, getWidgetConfig } from '@/lib/supabase/admin-api';

export default async function SettingsPage() {
  const [aiConfig, widgetConfig] = await Promise.all([getAiConfig(), getWidgetConfig()]);

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Tune the AI assistant&rsquo;s models, retrieval, and prompts. Changes take effect on the
            next incoming message — no redeploy needed.
          </p>
        </div>
        <AiConfigForm initialConfig={aiConfig} />
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Website widget</h2>
          <p className="text-sm text-muted-foreground">
            Managed on the widget page — shown here for reference.
          </p>
        </div>
        <WidgetConfigCard config={widgetConfig} />
      </div>
    </div>
  );
}
