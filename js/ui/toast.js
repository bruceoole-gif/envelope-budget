export function showToast(message, { actionLabel, onAction, timeout = 5000, kind = 'default' } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<span>${message}</span>${actionLabel ? `<button class="toast-action">${actionLabel}</button>` : ''}`;
  root.appendChild(el);
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 180);
  };
  if (actionLabel) {
    el.querySelector('.toast-action').addEventListener('click', () => {
      onAction?.();
      dismiss();
    });
  }
  setTimeout(dismiss, timeout);
  requestAnimationFrame(() => el.classList.add('toast-in'));
}
