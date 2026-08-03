interface TurnstileVerifyResult {
  success: boolean;
  errorCodes?: string[];
}

/**
 * Verifies a Turnstile token server-side.
 * Call this in your API route or Server Action before processing form data.
 */
export async function verifyTurnstileToken(token: string): Promise<TurnstileVerifyResult> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  if (!secretKey) {
    throw new Error('TURNSTILE_SECRET_KEY is not set');
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: secretKey, response: token }),
  });

  const data = (await response.json()) as { success: boolean; 'error-codes'?: string[] };

  return {
    success: data.success,
    errorCodes: data['error-codes'],
  };
}
