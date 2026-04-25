window.API_BASE = window.location.hostname === 'localhost' 
  ? '/api' 
  : 'https://studyglade.onrender.com/api';

// ---------- Toast Notification System ----------
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

// ---------- Spinner Helpers ----------
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

// ---------- API Fetch (with credentials) ----------
async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${window.API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });

  if (res.status === 401) {
    localStorage.clear();
    showToast('Session expired. Please log in again.', 'error');
    window.location.href = 'login.html';
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) {
    const err = await res.json();
    const errorMsg = err.error || 'Request failed';
    showToast(errorMsg, 'error');
    throw new Error(errorMsg);
  }

  return res.json();
}