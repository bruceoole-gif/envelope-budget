let stack = [];

export function openModal(html, { title = '', onMount, wide = false } = {}) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${title.replace(/"/g, '')}">
      <div class="modal-head">
        <h2>${title}</h2>
        <button class="icon-btn" data-close aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${html}</div>
    </div>`;
  root.appendChild(overlay);
  const close = () => {
    overlay.remove();
    stack.pop();
    document.removeEventListener('keydown', escHandler);
  };
  const escHandler = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', escHandler);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('[data-close]').addEventListener('click', close);
  stack.push(close);
  if (onMount) onMount(overlay.querySelector('.modal-body'), close);
  const firstInput = overlay.querySelector('input, select, textarea, button:not([data-close])');
  if (firstInput) firstInput.focus();
  return close;
}

export function closeTopModal() {
  const close = stack[stack.length - 1];
  if (close) close();
}

export function confirmModal({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    openModal(
      `<p class="confirm-body">${body}</p>
       <div class="modal-actions">
         <button class="btn" data-cancel>Cancel</button>
         <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirmLabel}</button>
       </div>`,
      {
        title,
        onMount: (el, close) => {
          el.querySelector('[data-cancel]').addEventListener('click', () => {
            close();
            resolve(false);
          });
          el.querySelector('[data-ok]').addEventListener('click', () => {
            close();
            resolve(true);
          });
        },
      }
    );
  });
}
