// API base is now relative because frontend and backend are on the same origin
window.API_BASE = '/api';

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