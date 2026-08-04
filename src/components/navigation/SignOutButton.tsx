import { LogOut } from 'lucide-react';

import { signOut } from '@/app/login/actions';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        data-testid="sidebar-sign-out-button"
      >
        <LogOut className="size-4" />
        Sign out
      </Button>
    </form>
  );
}
