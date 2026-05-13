// Use relative path: works on localhost and production (same origin)
window.API_BASE = '/api';

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

// ========== IDLE TIMEOUT (24 hours) WITH WARNING MODAL ==========
let idleTimer = null;
let warningTimer = null;
let warningModal = null;
const IDLE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
const WARNING_BEFORE = 60 * 1000; // 1 minute before logout

// Create modal dynamically (once)
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

  // Add event listener to the button
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
  
  // Update countdown every second
  let secondsLeft = 60;
  const countdownSpan = document.getElementById('countdownSeconds');
  
  if (window.countdownInterval) clearInterval(window.countdownInterval);
  window.countdownInterval = setInterval(() => {
    secondsLeft--;
    if (countdownSpan) countdownSpan.textContent = secondsLeft;
    if (secondsLeft <= 0) {
      clearInterval(window.countdownInterval);
      // If they didn't click "Stay logged in", logout now
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
  // Clear existing timers
  if (idleTimer) clearTimeout(idleTimer);
  if (warningTimer) clearTimeout(warningTimer);
  
  // Hide warning if visible
  hideWarningModal();
  
  // Set new timers
  idleTimer = setTimeout(() => {
    // Final logout after 24h with no activity
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