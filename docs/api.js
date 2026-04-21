// Expose API_BASE globally so other scripts can use it
window.API_BASE = window.location.hostname === 'localhost' 
  ? '/api' 
  : 'https://studyglade.onrender.com/api';

const API_BASE = window.API_BASE;

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers
  };
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}