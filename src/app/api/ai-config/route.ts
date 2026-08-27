import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

import type { UpdateAiConfigPayload } from '@/lib/ai-config/types';
import {
  CACHE_TAGS,
  EdgeFunctionError,
  getAiConfig,
  updateAiConfig,
} from '@/lib/supabase/admin-api';
import { UnauthenticatedError, requireAuthenticatedUser } from '@/lib/supabase/requireUser';

export async function GET() {
  try {
    await requireAuthenticatedUser();

    const config = await getAiConfig();
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

    const payload = (await request.json()) as UpdateAiConfigPayload;
    const config = await updateAiConfig(payload);
    revalidateTag(CACHE_TAGS.aiConfig);

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
