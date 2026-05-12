window.API_BASE = window.location.hostname === 'localhost' 
  ? '/api' 
  : 'https://studyglade.onrender.com/api';

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

function showSpinner(element) { /* ... unchanged ... */ }
function hideSpinner(element) { /* ... unchanged ... */ }

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${window.API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });

  // Handle 401 first
  if (res.status === 401) {
    localStorage.clear();
    showToast('Session expired. Please log in again.', 'error');
    window.location.href = 'login.html';
    throw new Error('Session expired');
  }

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