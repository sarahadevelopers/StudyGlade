window.API_BASE = window.location.hostname === 'localhost' 
  ? '/api' 
  : 'https://studyglade.onrender.com/api';

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${window.API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = 'login.html';
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}