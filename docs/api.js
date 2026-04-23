window.API_BASE = window.location.hostname === 'localhost' 
  ? '/api' 
  : 'https://studyglade.onrender.com/api';

let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
}

async function apiFetch(endpoint, options = {}) {
  const makeRequest = async () => {
    const res = await fetch(`${window.API_BASE}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers }
    });
    if (res.status === 401) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await fetch(`${window.API_BASE}/auth/refresh-token`, {
            method: 'POST',
            credentials: 'include'
          });
          if (refreshRes.ok) {
            processQueue(null);
            return makeRequest(); // retry original request
          } else {
            throw new Error('Refresh failed');
          }
        } catch (err) {
          processQueue(err);
          localStorage.clear();
          window.location.href = '/login';
          throw new Error('Session expired. Please log in again.');
        } finally {
          isRefreshing = false;
        }
      }
      // Queue request while refreshing
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(() => makeRequest()).catch(err => { throw err; });
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  };
  return makeRequest();
}