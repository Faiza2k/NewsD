'use client';

import { ModulePageLayout } from '@/components/pages/module-page-layout';
import { MODULE_CONFIGS } from '@/lib/module-configs';

export default function CloudDevOpsPage() {
  return <ModulePageLayout config={MODULE_CONFIGS.clouddevops} />;
}
