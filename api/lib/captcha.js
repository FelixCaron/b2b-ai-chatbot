/**
 * Cloudflare Turnstile Invisible Captcha Verification Helper
 * Protects onboarding and public endpoints from automated bot spam without user friction.
 */

export async function verifyTurnstileToken(token, clientIp = '') {
  // If token is absent:
  if (!token) {
    // If no secret key is configured in env (e.g. standard development), pass through gracefully
    if (!process.env.TURNSTILE_SECRET_KEY) {
      return { success: true, bypassed: true };
    }
    return { success: false, error: 'Missing Turnstile captcha token' };
  }

  // Use configured production secret key, or Cloudflare's standard always-pass test key
  const secretKey = process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (clientIp) {
      formData.append('remoteip', clientIp);
    }

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!verifyRes.ok) {
      throw new Error(`Turnstile HTTP error: ${verifyRes.status}`);
    }

    const data = await verifyRes.json();
    return {
      success: data.success === true,
      hostname: data.hostname,
      challengeTs: data.challenge_ts,
      error: data['error-codes'] ? data['error-codes'].join(', ') : null,
    };
  } catch (err) {
    console.error('Turnstile verification exception:', err.message);
    // Fail-open only if no secret key configured in local dev, otherwise fail-closed
    if (!process.env.TURNSTILE_SECRET_KEY) {
      return { success: true, bypassed: true, warning: err.message };
    }
    return { success: false, error: err.message };
  }
}
