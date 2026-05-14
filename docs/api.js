// Use relative path: works on localhost and production (same origin)
window.API_BASE = '/api';

// ========== CSRF Token Handling (private inside IIFE) ==========
(function() {
  // Private variables
  let csrfToken = null;
  let csrfPromise = null;
  let isRefreshing = false;

  async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    if (csrfPromise) return csrfPromise;
    
    csrfPromise = (async () => {
      try {
        const res = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!res.ok) throw new Error(`CSRF token fetch failed: ${res.status}`);
        const data = await res.json();
        csrfToken = data.csrfToken;
        return csrfToken;
      } catch (err) {
        console.error('Failed to fetch CSRF token:', err);
        csrfPromise = null;
        return null;
      } finally {
        csrfPromise = null;
      }
    })();
    return csrfPromise;
  }

  async function refreshAccessToken() {
    try {
      const res = await fetch(`${window.API_BASE}/auth/refresh-token`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      return res.ok;
    } catch (err) {
      console.error('Refresh token error:', err);
      return false;
    }
  }

  // Expose the core API fetch function globally
  window.apiFetch = async function(endpoint, options = {}) {
    const method = options.method || 'GET';
    let headers = { 'Content-Type': 'application/json', ...options.headers };
    
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      const token = await getCsrfToken();
      if (token) headers['X-CSRF-Token'] = token;
    }
    
    const makeRequest = async () => {
      return await fetch(`${window.API_BASE}${endpoint}`, {
        ...options,
        credentials: 'include',
        headers
      });
    };

    // Retry logic for network failures (e.g., ERR_CONNECTION_CLOSED)
    let res;
    try {
      res = await makeRequest();
    } catch (err) {
      // Network error (connection closed, DNS failure, etc.)
      console.warn(`Network error for ${endpoint}, retrying once...`, err);
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        res = await makeRequest();
      } catch (retryErr) {
        // Still failing – rethrow
        throw retryErr;
      }
    }

    // If 401 and not already refreshing, try to refresh token once
    if (res.status === 401 && !isRefreshing) {
      isRefreshing = true;
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry original request with new token
        res = await makeRequest();
        isRefreshing = false;
        if (res.status === 401) {
          // Still 401 after refresh – force logout
          localStorage.clear();
          window.showToast('Session expired. Please log in again.', 'error');
          window.location.href = 'login.html';
          throw new Error('Session expired');
        }
        return handleResponse(res);
      } else {
        isRefreshing = false;
        localStorage.clear();
        window.showToast('Session expired. Please log in again.', 'error');
        window.location.href = 'login.html';
        throw new Error('Session expired');
      }
    }

    if (res.status === 403) {
      csrfToken = null;
      const token = await getCsrfToken();
      if (token) {
        headers['X-CSRF-Token'] = token;
        const retryRes = await fetch(`${window.API_BASE}${endpoint}`, {
          ...options,
          credentials: 'include',
          headers
        });
        if (retryRes.ok) return handleResponse(retryRes);
      }
      const errorData = await retryRes?.json().catch(() => ({}));
      window.showToast(errorData.error || 'Request forbidden (CSRF validation failed)', 'error');
      throw new Error('CSRF validation failed');
    }

    return handleResponse(res);
  };

  async function handleResponse(res) {
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error('Non-JSON response from', res.url, text.substring(0, 200));
      throw new Error(`Expected JSON but received ${contentType || 'unknown'}. URL: ${res.url}`);
    }
    const data = await res.json();
    if (!res.ok) {
      let errorMsg = 'Request failed';
      if (data.error) errorMsg = data.error;
      else if (data.errors && data.errors.length > 0) errorMsg = data.errors[0].msg;
      window.showToast(errorMsg, 'error');
      throw new Error(errorMsg);
    }
    return data;
  }

  // ========== Toast & Spinner Helpers (expose globally) ==========
  window.showToast = function(message, type = 'info') {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
  };

  window.showSpinner = function(element) {
    if (!element) return;
    const originalText = element.textContent;
    element.disabled = true;
    element.dataset.originalText = originalText;
    element.innerHTML = '<span class="spinner"></span> Loading...';
  };

  window.hideSpinner = function(element) {
    if (!element) return;
    element.disabled = false;
    element.innerHTML = element.dataset.originalText || 'Submit';
    delete element.dataset.originalText;
  };

  window.formatMoney = function(amount) {
    return `$${parseFloat(amount).toFixed(2)}`;
  };

  // ========== Idle Timeout with Warning Modal (private) ==========
  let idleTimer = null;
  let warningTimer = null;
  let warningModal = null;
  const IDLE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
  const WARNING_BEFORE = 60 * 1000;

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
          window.showToast('Session expired due to inactivity. Please log in again.', 'info');
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
      window.showToast('Session expired due to inactivity. Please log in again.', 'info');
      window.location.href = 'login.html';
    }, IDLE_TIMEOUT);
    warningTimer = setTimeout(() => {
      showWarningModal();
    }, IDLE_TIMEOUT - WARNING_BEFORE);
  }

  window.initIdleTimer = function() {
    createWarningModal();
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetIdleTimer);
    });
    resetIdleTimer();
  };

  window.stopIdleTimer = function() {
    if (idleTimer) clearTimeout(idleTimer);
    if (warningTimer) clearTimeout(warningTimer);
    hideWarningModal();
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.removeEventListener(event, resetIdleTimer);
    });
  };

  window.resetCsrfToken = function() {
    csrfToken = null;
    csrfPromise = null;
  };

  // ========== SOCKET.IO REAL‑TIME CONNECTION ==========
  let socket = null;

function initSocket() {
  console.log('🔌 initSocket called');
  
  const token = localStorage.getItem('accessToken');
  console.log('Token from localStorage:', token ? token.substring(0,20) + '...' : 'null');
  
  if (!token) {
    console.warn('No access token found – socket not connected');
    return;
  }
  
  if (typeof io === 'undefined') {
    console.error('Socket.io library not loaded! Check script tag in HTML.');
    return;
  }
  
  if (socket && socket.connected) {
    console.log('Socket already connected');
    return;
  }
  
  // Disconnect existing socket if any
  if (socket) {
    socket.disconnect();
  }
  
  console.log('Attempting to connect socket...');
  socket = io({
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });
  
  socket.on('connect', () => {
    console.log('✅ Socket connected successfully');
  });
  
  socket.on('connect_error', (err) => {
    console.error('❌ Socket connection error:', err.message);
  });
  
  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
  });
  
  socket.on('wallet_update', (data) => {
    console.log('💰 Wallet update received:', data);
    const walletSpan = document.querySelector('#walletBalance');
    if (walletSpan) {
      walletSpan.innerText = window.formatMoney(data.newBalance);
      console.log('Wallet balance updated to:', data.newBalance);
    } else {
      console.warn('Wallet span element not found');
    }
    window.showToast(`Wallet updated: $${Math.abs(data.transaction.amount).toFixed(2)}`, 'info');
  });
  
  socket.on('notification_new', (data) => {
    console.log('🔔 New notification:', data);
    const badge = document.querySelector('.notification-badge');
    if (badge) {
      let count = parseInt(badge.innerText) || 0;
      badge.innerText = count + 1;
    }
    window.showToast(data.message, 'info');
    if (window.playNotificationSound) window.playNotificationSound();
  });
  
  socket.on('question_assigned', (data) => {
    window.showToast(`Tutor assigned to "${data.questionTitle}"`, 'success');
  });
  
  socket.on('bid_placed', (data) => {
    window.showToast(`New bid of $${data.bidAmount} on "${data.questionTitle}" by ${data.tutorName}`, 'info');
  });
  
  socket.on('answer_uploaded', (data) => {
    window.showToast(`Answer uploaded for "${data.questionTitle}"`, 'success');
  });
  
  socket.on('question_completed', (data) => {
    window.showToast(`Question "${data.questionTitle}" completed by ${data.tutorName}`, 'success');
  });
  
  socket.on('document_unlocked', (data) => {
    window.showToast(`Document "${data.documentTitle}" unlocked!`, 'success');
  });
  
  socket.on('funds_requested', (data) => {
    window.showToast(`Additional funds requested for "${data.questionTitle}": $${data.amount}`, 'warning');
  });
}
  window.initSocket = initSocket;
  window.disconnectSocket = function() {
    if (socket) socket.disconnect();
  };
})();