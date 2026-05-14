// Use relative path: works on localhost and production (same origin)
window.API_BASE = '/api';

// ---------- CSRF Token Handling ----------
let csrfToken = null;
let csrfPromise = null; // avoid multiple concurrent fetches

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  if (csrfPromise) return csrfPromise;
  
  csrfPromise = (async () => {
    try {
      const res = await fetch('/api/csrf-token', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`CSRF token fetch failed: ${res.status}`);
      const data = await res.json();
      csrfToken = data.csrfToken;
      return csrfToken;
    } catch (err) {
      console.error('Failed to fetch CSRF token:', err);
      // Retry on next request
      csrfPromise = null;
      return null;
    } finally {
      csrfPromise = null;
    }
  })();
  return csrfPromise;
}

// ---------- Toast & Spinner Helpers ----------
function showToast(message, type = 'info') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function showSpinner(element) {
  if (!element) return;
  const originalText = element.textContent;
  element.disabled = true;
  element.dataset.originalText = originalText;
  element.innerHTML = '<span class="spinner"></span> Loading...';
}

function hideSpinner(element) {
  if (!element) return;
  element.disabled = false;
  element.innerHTML = element.dataset.originalText || 'Submit';
  delete element.dataset.originalText;
}

// ---------- Core API Fetch with CSRF ----------
async function apiFetch(endpoint, options = {}) {
  const method = options.method || 'GET';
  let headers = { 'Content-Type': 'application/json', ...options.headers };
  
  // Add CSRF token for state-changing requests
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const token = await getCsrfToken();
    if (token) headers['X-CSRF-Token'] = token;
    // If token is missing (e.g., network error), request may fail – backend will reject.
  }
  
  const res = await fetch(`${window.API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers
  });

  // Handle 401 (unauthorized) -> session expired
  if (res.status === 401) {
    localStorage.clear();
    showToast('Session expired. Please log in again.', 'error');
    window.location.href = 'login.html';
    throw new Error('Session expired');
  }

  // Handle 403 (forbidden) – could be CSRF token missing/invalid
  if (res.status === 403) {
    // Possibly CSRF token expired or invalid; clear token and retry once?
    csrfToken = null;
    const token = await getCsrfToken();
    if (token) {
      // Retry the same request with fresh token
      headers['X-CSRF-Token'] = token;
      const retryRes = await fetch(`${window.API_BASE}${endpoint}`, {
        ...options,
        credentials: 'include',
        headers
      });
      if (retryRes.ok) {
        // Continue with the retried response
        return await handleResponse(retryRes);
      }
    }
    // If still failing, throw error
    const errorData = await retryRes?.json().catch(() => ({}));
    showToast(errorData.error || 'Request forbidden (CSRF validation failed)', 'error');
    throw new Error('CSRF validation failed');
  }

  return handleResponse(res);
}

// Helper to parse JSON response and handle non‑OK statuses
async function handleResponse(res) {
  // Check content type BEFORE parsing
  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await res.text();
    console.error('Non-JSON response from', res.url, text.substring(0, 200));
    throw new Error(`Expected JSON but received ${contentType || 'unknown'}. URL: ${res.url}`);
  }

  const data = await res.json();

  if (!res.ok) {
    const errorMsg = data.error || 'Request failed';
    showToast(errorMsg, 'error');
    throw new Error(errorMsg);
  }

  return data;
}

// ---------- Idle Timeout (24h) with Warning Modal ----------
let idleTimer = null;
let warningTimer = null;
let warningModal = null;
const IDLE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
const WARNING_BEFORE = 60 * 1000; // 1 minute before logout

function createWarningModal() {
  if (document.getElementById('idleWarningModal')) return;

  const modalDiv = document.createElement('div');
  modalDiv.id = 'idleWarningModal';
  modalDiv.style.cssText = `
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;
  modalDiv.innerHTML = `
    <div style="background: white; border-radius: 1rem; padding: 1.5rem; max-width: 400px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
      <h3 style="margin-bottom: 1rem;">⚠️ Session Expiring Soon</h3>
      <p>You have been inactive for nearly 24 hours. Your session will expire in <strong><span id="countdownSeconds">60</span> seconds</strong>.</p>
      <p style="margin-top: 1rem;">Click below to stay logged in.</p>
      <button id="stayLoggedInBtn" style="margin-top: 1rem; background: #2563eb; color: white; border: none; padding: 0.5rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">Stay Logged In</button>
    </div>
  `;
  document.body.appendChild(modalDiv);
  warningModal = document.getElementById('idleWarningModal');

  const stayBtn = document.getElementById('stayLoggedInBtn');
  if (stayBtn) {
    stayBtn.addEventListener('click', () => {
      resetIdleTimer();
      hideWarningModal();
    });
  }
}

function showWarningModal() {
  if (!warningModal) createWarningModal();
  if (!warningModal) return;
  
  let secondsLeft = 60;
  const countdownSpan = document.getElementById('countdownSeconds');
  
  if (window.countdownInterval) clearInterval(window.countdownInterval);
  window.countdownInterval = setInterval(() => {
    secondsLeft--;
    if (countdownSpan) countdownSpan.textContent = secondsLeft;
    if (secondsLeft <= 0) {
      clearInterval(window.countdownInterval);
      if (warningModal.style.display === 'flex') {
        hideWarningModal();
        localStorage.clear();
        showToast('Session expired due to inactivity. Please log in again.', 'info');
        window.location.href = 'login.html';
      }
    }
  }, 1000);
  
  warningModal.style.display = 'flex';
}

function hideWarningModal() {
  if (warningModal) warningModal.style.display = 'none';
  if (window.countdownInterval) {
    clearInterval(window.countdownInterval);
    window.countdownInterval = null;
  }
}

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (warningTimer) clearTimeout(warningTimer);
  hideWarningModal();
  
  idleTimer = setTimeout(() => {
    localStorage.clear();
    showToast('Session expired due to inactivity. Please log in again.', 'info');
    window.location.href = 'login.html';
  }, IDLE_TIMEOUT);
  
  warningTimer = setTimeout(() => {
    showWarningModal();
  }, IDLE_TIMEOUT - WARNING_BEFORE);
}

function initIdleTimer() {
  createWarningModal();
  const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
  events.forEach(event => {
    window.addEventListener(event, resetIdleTimer);
  });
  resetIdleTimer();
}

function stopIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (warningTimer) clearTimeout(warningTimer);
  hideWarningModal();
  const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
  events.forEach(event => {
    window.removeEventListener(event, resetIdleTimer);
  });
}