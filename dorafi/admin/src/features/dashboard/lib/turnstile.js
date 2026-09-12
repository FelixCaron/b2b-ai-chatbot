// Invisible Turnstile Captcha helper for seamless bot protection
export async function executeTurnstileCaptcha() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve('');
      return;
    }
    if (!window.turnstile) {
      resolve('');
      return;
    }

    try {
      const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';
      let container = document.getElementById('turnstile-invisible-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'turnstile-invisible-container';
        container.style.display = 'none';
        document.body.appendChild(container);
      }
      container.innerHTML = '';
      const widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        size: 'invisible',
        callback: (token) => {
          resolve(token);
        },
        'error-callback': () => {
          resolve('');
        },
        'expired-callback': () => {
          resolve('');
        }
      });
      window.turnstile.execute(widgetId);
    } catch (e) {
      console.warn('[Turnstile] Invisible execution notice:', e);
      resolve('');
    }
  });
}
