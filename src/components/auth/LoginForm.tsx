'use client';

import { useActionState } from 'react';

import { signIn, type SignInState } from '@/app/login/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initialState: SignInState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">Email</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          data-testid="login-email-input"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-password">Password</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          data-testid="login-password-input"
        />
      </div>
      {state.error ? (
        <p role="alert" data-testid="login-error-message" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending} data-testid="login-submit-button">
        {isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
