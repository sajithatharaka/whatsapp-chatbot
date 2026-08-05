import { NextResponse } from 'next/server';

import { VALID_STATUSES } from '@/lib/escalations/constants';
import type { EscalationStatus } from '@/lib/escalations/types';
import { EdgeFunctionError, listEscalations } from '@/lib/supabase/admin-api';
import { UnauthenticatedError, requireAuthenticatedUser } from '@/lib/supabase/requireUser';

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser();

    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const statuses = statusParam
      ?.split(',')
      .map((s) => s.trim())
      .filter((s): s is EscalationStatus => (VALID_STATUSES as string[]).includes(s));

    const escalations = await listEscalations({
      statuses: statuses && statuses.length > 0 ? statuses : undefined,
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
    });

    return NextResponse.json({ escalations });
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
