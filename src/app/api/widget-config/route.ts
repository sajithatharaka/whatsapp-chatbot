import { NextResponse } from 'next/server';

import type { UpdateWidgetConfigPayload } from '@/lib/widget/types';
import { EdgeFunctionError, getWidgetConfig, updateWidgetConfig } from '@/lib/supabase/admin-api';
import { UnauthenticatedError, requireAuthenticatedUser } from '@/lib/supabase/requireUser';

export async function GET() {
  try {
    await requireAuthenticatedUser();

    const config = await getWidgetConfig();
    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (error instanceof EdgeFunctionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAuthenticatedUser();

    const payload = (await request.json()) as UpdateWidgetConfigPayload;
    const config = await updateWidgetConfig(payload);

    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (error instanceof EdgeFunctionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
