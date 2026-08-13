export function showToast(message, { actionLabel, onAction, timeout, kind = 'default' } = {}) {
  const resolvedTimeout = timeout ?? (kind === 'error' ? 10000 : 5000);
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span>${message}</span>${actionLabel ? `<button class="toast-action">${actionLabel}</button>` : ''}<button class="toast-close" aria-label="Dismiss">✕</button>`;
  root.appendChild(el);
  let dismissed = false;
  let timer;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 180);
  };
  if (actionLabel) {
    el.querySelector('.toast-action').addEventListener('click', () => {
      onAction?.();
      dismiss();
    });
  }
  el.querySelector('.toast-close').addEventListener('click', dismiss);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, resolvedTimeout); });
  timer = setTimeout(dismiss, resolvedTimeout);
  requestAnimationFrame(() => el.classList.add('toast-in'));
}
