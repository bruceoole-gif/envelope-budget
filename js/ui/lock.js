// App lock: a PIN and/or biometric (WebAuthn platform authenticator — Face ID / Touch ID /
// Windows Hello / Android biometrics) gate, required every time the app becomes active again,
// plus an instant privacy cover whenever it isn't. Everything here is a client-side, local-device
// gate (same as the rest of this app's data) — there's no backend, so the WebAuthn ceremony is
// used as proof the platform authenticator succeeded, not verified against a stored public key.
// That's an intentional, honest simplification: it protects against someone picking up an
// unlocked device, not a remote attacker who already has code execution in this origin.

import { state, saveMeta } from '../state.js';

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
}

export function hasLock() {
  return !!(state.meta.pinHash || state.meta.webauthnCredentialId);
}

export async function biometricsAvailable() {
  if (!window.PublicKeyCredential || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export async function registerBiometric() {
  const available = await biometricsAvailable();
  if (!available) throw new Error('No biometric authenticator (Face ID / Touch ID / Windows Hello / fingerprint) is available on this device.');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Envelope Budget' },
      user: { id: userId, name: 'envelope-local', displayName: 'Envelope' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
      attestation: 'none',
    },
  });
  await saveMeta({ webauthnCredentialId: bufToBase64(cred.rawId) });
}

export async function removeBiometric() {
  await saveMeta({ webauthnCredentialId: null });
}

async function verifyBiometric() {
  const credId = state.meta.webauthnCredentialId;
  if (!credId) throw new Error('No biometric credential registered.');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: base64ToBuf(credId), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return true;
}

export async function verifyPin(pin) {
  if (!state.meta.pinHash) return false;
  const hash = await sha256Hex(pin);
  return hash === state.meta.pinHash;
}

// ---------- Overlay ----------

let overlay, form, errorEl, subtitleEl, bioBtn;
let resolveUnlock = null;
let reauthPending = false;
let initialized = false;

function elems() {
  overlay = document.getElementById('lock-screen');
  form = overlay.querySelector('form');
  errorEl = overlay.querySelector('.lock-error');
  subtitleEl = overlay.querySelector('[data-lock-subtitle]');
  bioBtn = overlay.querySelector('[data-biometric-btn]');
}

function showCover() {
  overlay.hidden = false;
  overlay.classList.add('cover-mode');
}

async function showUnlockForm() {
  overlay.hidden = false;
  overlay.classList.remove('cover-mode');
  errorEl.textContent = '';
  form.pin.value = '';
  const bioAvailable = !!state.meta.webauthnCredentialId && (await biometricsAvailable());
  bioBtn.hidden = !bioAvailable;
  subtitleEl.textContent = state.meta.pinHash ? 'Enter your PIN' : 'Unlock to continue';
  form.hidden = !state.meta.pinHash;
  if (bioAvailable) {
    tryBiometricUnlock();
  } else {
    setTimeout(() => form.pin?.focus(), 50);
  }
}

function hideOverlay() {
  overlay.hidden = true;
  overlay.classList.remove('cover-mode');
}

async function tryBiometricUnlock() {
  try {
    await verifyBiometric();
    completeUnlock();
  } catch {
    // Cancelled or failed — fall back to the PIN field already showing, no error needed.
  }
}

function completeUnlock() {
  reauthPending = false;
  hideOverlay();
  if (resolveUnlock) {
    resolveUnlock();
    resolveUnlock = null;
  }
}

function wireForm() {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await verifyPin(form.pin.value)) {
      completeUnlock();
    } else {
      errorEl.textContent = 'Incorrect PIN.';
      form.pin.value = '';
      form.pin.focus();
    }
  });
  bioBtn.addEventListener('click', tryBiometricUnlock);
}

// Page Visibility API's `hidden` is the correct signal here — it only flips on real tab-switches,
// app backgrounding, or minimizing. `document.hasFocus()` is deliberately NOT used: it also flips
// for in-page focus shuffles (e.g. opening devtools) that aren't actually "leaving the app," which
// would false-trigger the lock. blur/focus listeners still feed into this same check below, purely
// as a redundant nudge to re-evaluate promptly in case a browser is slow to fire visibilitychange.
function isAppActive() {
  return !document.hidden;
}

function handleVisibility() {
  if (!isAppActive()) {
    showCover();
    if (hasLock()) reauthPending = true;
  } else if (reauthPending) {
    showUnlockForm();
  } else {
    hideOverlay();
  }
}

// Sets up the privacy cover + re-auth-on-return behavior. Call once at boot, after the initial
// unlock (if any) has already been handled by requireInitialUnlock().
export function initLock() {
  if (initialized) return;
  initialized = true;
  elems();
  wireForm();
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('blur', handleVisibility);
  window.addEventListener('focus', handleVisibility);
}

// Gates first render on app boot. Resolves immediately if no PIN/biometric is configured.
export function requireInitialUnlock() {
  elems();
  if (!hasLock()) return Promise.resolve();
  reauthPending = true;
  return new Promise((resolve) => {
    resolveUnlock = resolve;
    showUnlockForm();
  });
}
