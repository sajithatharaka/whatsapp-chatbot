import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/LoginForm';
import { createClient } from '@/lib/supabase/server';

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border p-6 shadow-sm">
        <h1 className="mb-6 text-lg font-semibold">Sign in</h1>
        <LoginForm />
      </div>
    </div>
  );
}
