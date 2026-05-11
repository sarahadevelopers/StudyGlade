// ---------- Helper: escape HTML ----------
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function formatMoney(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

// ----- Global variables -----
let currentPage = 1;
const PAGE_SIZE = 10;
let allAssignments = [];
let currentTab = 'all';
let currentAvailablePage = 1;
let totalAvailablePages = 1;

// ----- Helper to update user menu (avatar, name) -----
function updateUserMenu(user) {
  const topName = document.getElementById('topName');
  const sidebarName = document.getElementById('sidebarName');
  const topAvatar = document.getElementById('topAvatar');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  if (topName) topName.innerText = user.fullName;
  if (sidebarName) sidebarName.innerText = user.fullName;
  if (topAvatar && user.avatar) topAvatar.src = user.avatar;
  if (sidebarAvatar && user.avatar) sidebarAvatar.src = user.avatar;
  if (!user.avatar) {
    const id = Math.floor(Math.random() * 100);
    let avatarUrl = `https://randomuser.me/api/portraits/lego/${id}.jpg`;
    if (user.gender === 'female') avatarUrl = `https://randomuser.me/api/portraits/women/${id}.jpg`;
    else if (user.gender === 'male') avatarUrl = `https://randomuser.me/api/portraits/men/${id}.jpg`;
    if (topAvatar) topAvatar.src = avatarUrl;
    if (sidebarAvatar) sidebarAvatar.src = avatarUrl;
  }
}

// ----- User dropdown toggle -----
function toggleUserMenu() {
  const menu = document.querySelector('.user-menu');
  menu.classList.toggle('active');
}
document.addEventListener('click', function(e) {
  const menu = document.querySelector('.user-menu');
  if (menu && !menu.contains(e.target)) menu.classList.remove('active');
});

// ----- Logout -----
function logoutUser() {
  localStorage.clear();
  window.location.href = 'login.html';
}

// ----- Fetch fresh user data -----
async function fetchFreshUser() {
  const user = await apiFetch('/auth/me');
  localStorage.setItem('user', JSON.stringify(user));
  return user;
}

// ----- Question Preview Modal -----
async function previewQuestion(questionId) {
  const modal = document.getElementById('questionPreviewModal');
  const contentDiv = document.getElementById('previewContent');
  if (!modal || !contentDiv) return;
  modal.style.display = 'flex';
  contentDiv.innerHTML = '<div class="loading">Loading question details...</div>';
  try {
    const q = await apiFetch(`/questions/${questionId}`);
    const deadline = q.deadline ? new Date(q.deadline).toLocaleString() : 'Not set';
    contentDiv.innerHTML = `
      <div style="margin-bottom:0.5rem;"><strong>Title:</strong> ${escapeHtml(q.title)}</div>
      <div><strong>Description:</strong> ${escapeHtml(q.description)}</div>
      <div><strong>Budget:</strong> $${q.budget}</div>
      <div><strong>Deadline:</strong> ${deadline}</div>
      <div><strong>Subject:</strong> ${escapeHtml(q.subject || 'General')}</div>
      <div><strong>Category:</strong> ${escapeHtml(q.category || '—')}</div>
      ${q.files && q.files.length ? `<div><strong>Attachments:</strong> ${q.files.map(f => `<a href="${f}" target="_blank">View</a>`).join(', ')}</div>` : ''}
    `;
  } catch (err) {
    contentDiv.innerHTML = '<div class="error">Failed to load question details.</div>';
  }
}
function closeQuestionPreview() {
  const modal = document.getElementById('questionPreviewModal');
  if (modal) modal.style.display = 'none';
}

// ----- Load Tutor Dashboard (main) -----
async function loadTutorDashboard() {
  try {
    const user = await fetchFreshUser();
    updateUserMenu(user);
    document.getElementById('tutorName').innerText = user.fullName;
    document.getElementById('tutorRating').innerText = user.tutorProfile?.rating?.toFixed(1) || '0.0';
    const rating = user.tutorProfile?.rating || 0;
    const starsHtml = '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
    document.getElementById('ratingStars').innerHTML = starsHtml;
    document.getElementById('totalEarnings').innerText = formatMoney(user.tutorProfile?.totalEarnings || 0);
    document.getElementById('currentBalance').innerText = formatMoney(user.walletBalance);
    document.getElementById('withdrawBalance').innerText = formatMoney(user.walletBalance);
    try {
      const withdrawData = await apiFetch('/wallet/withdrawals-total');
      document.getElementById('totalWithdrawals').innerText = formatMoney(withdrawData.total);
    } catch(e) { document.getElementById('totalWithdrawals').innerText = '$0.00'; }

    const level = user.tutorProfile?.level || 'Entry-Level';
    document.getElementById('tutorLevelBadge').innerText = level;
    const completed = user.tutorProfile?.completedQuestions || 0;
    let nextLevel = 20;
    if (level === 'Entry-Level') nextLevel = 20;
    else if (level === 'Skilled') nextLevel = 50;
    else if (level === 'Expert') nextLevel = 100;
    else if (level === 'Premium') nextLevel = completed;
    const progressPercent = Math.min(100, (completed / nextLevel) * 100);
    document.getElementById('levelProgressFill').style.width = progressPercent + '%';
    document.getElementById('levelProgressStats').innerText = `${completed} / ${nextLevel} completed`;

    await loadAssignments();
    await loadAvailableQuestions();

    const dateInput = document.getElementById('dateFilter');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0,10);
  } catch (err) {
    console.error(err);
    showToast('Failed to load dashboard', 'error');
  }
}

// ----- Load Available Questions (with pagination) -----
async function loadAvailableQuestions(page = 1) {
  try {
    const res = await fetch(`${window.API_BASE}/questions/pending?page=${page}&limit=${PAGE_SIZE}`, { credentials: 'include' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const container = document.getElementById('availableQuestionsList');
    if (!container) return;
    if (!data.questions || data.questions.length === 0) {
      container.innerHTML = '<div class="available-item">No questions available</div>';
      document.getElementById('paginationControls').innerHTML = '';
      return;
    }
    let html = '';
    data.questions.forEach(q => {
      html += `
        <div class="available-item">
          <div class="available-header">
            <div>
              <div class="assignment-title"><i class="fas fa-file-alt" style="margin-right: 6px; color:var(--brand-blue);"></i> ${escapeHtml(q.title)}</div>
              <div class="assignment-meta">${escapeHtml(q.subject || 'General')} • Budget: ${formatMoney(q.budget)} • Posted: ${new Date(q.createdAt).toLocaleDateString()}</div>
            </div>
            <span class="match-high">High Match</span>
          </div>
          <div class="bid-group">
            <input type="number" id="bid-${q._id}" placeholder="Bid amount" min="${q.budget}" step="1" class="bid-input">
            <button class="btn-sm btn-primary-sm" onclick="placeBid('${q._id}')">Place Bid</button>
            <button class="btn-sm btn-outline-sm" onclick="acceptQuestion('${q._id}')">Accept at ${formatMoney(q.budget)}</button>
            <button class="btn-sm btn-outline-sm" onclick="previewQuestion('${q._id}')">Preview</button>
            <button class="btn-sm btn-outline-sm" onclick="window.location.href='question-details.html?id=${q._id}'">View Question</button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
    totalAvailablePages = Math.ceil(data.total / PAGE_SIZE);
    const paginationDiv = document.getElementById('paginationControls');
    if (paginationDiv && totalAvailablePages > 1) {
      paginationDiv.innerHTML = `
        <button onclick="changeAvailablePage(-1)" ${currentAvailablePage === 1 ? 'disabled' : ''}>Prev</button>
        <span>Page ${currentAvailablePage} of ${totalAvailablePages}</span>
        <button onclick="changeAvailablePage(1)" ${currentAvailablePage === totalAvailablePages ? 'disabled' : ''}>Next</button>
      `;
    } else if (paginationDiv) paginationDiv.innerHTML = '';
  } catch (err) {
    console.error(err);
    document.getElementById('availableQuestionsList').innerHTML = '<div class="available-item">Error loading questions</div>';
  }
}

window.changeAvailablePage = (delta) => {
  currentAvailablePage += delta;
  if (currentAvailablePage < 1) currentAvailablePage = 1;
  if (currentAvailablePage > totalAvailablePages) currentAvailablePage = totalAvailablePages;
  loadAvailableQuestions(currentAvailablePage);
};

// ----- Place Bid (with immediate blur + disable, no reload) -----
async function placeBid(questionId) {
  console.log("placeBid called for", questionId);
  const input = document.getElementById(`bid-${questionId}`);
  const container = input?.closest('.available-item');
  const btn = container?.querySelector('.btn-primary-sm');
  const amount = input?.value;
  
  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
  
  // Disable input and button immediately
  if (input) input.disabled = true;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Placing...'; }
  
  try {
    await apiFetch(`/questions/${questionId}/bid`, {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), message: 'Bid from dashboard' })
    });
    showToast('Bid placed successfully!', 'success');
    
    // Blur and disable the card permanently (no reload)
    if (container) {
      container.style.opacity = '0.6';
      container.style.pointerEvents = 'none';
      container.style.backgroundColor = '#f5f5f5';
      container.title = 'You have already placed a bid on this question';
      // Add a checkmark badge
      const header = container.querySelector('.available-header');
      if (header && !header.querySelector('.bid-placed-check')) {
        const checkSpan = document.createElement('span');
        checkSpan.className = 'bid-placed-check';
        checkSpan.innerHTML = ' ✅ Bid placed';
        checkSpan.style.marginLeft = '10px';
        checkSpan.style.color = 'green';
        checkSpan.style.fontSize = '0.8rem';
        header.appendChild(checkSpan);
      }
    }
  } catch (err) {
    console.error("Bid error:", err);
    showToast(err.message, 'error');
    // Re-enable on error
    if (input) input.disabled = false;
    if (btn) { btn.disabled = false; btn.innerHTML = 'Place Bid'; }
  }
}

async function acceptQuestion(questionId) {
  try {
    await apiFetch(`/questions/${questionId}/accept`, { method: 'PUT' });
    showToast('Question accepted!', 'success');
    loadTutorDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

// ----- Load Assignments -----
async function loadAssignments() {
  try {
    const assignments = await apiFetch('/questions/my-assignments');
    allAssignments = assignments;
    renderAssignmentsByTab(currentTab);
  } catch (err) {
    console.error(err);
    document.getElementById('assignmentsList').innerHTML = '<div>Error loading assignments</div>';
  }
}

function renderAssignmentsByTab(tab) {
  let filtered = [];
  if (tab === 'all') filtered = allAssignments;
  else if (tab === 'in-progress') filtered = allAssignments.filter(a => a.status === 'assigned' || a.status === 'in_progress');
  else if (tab === 'overdue') {
    const now = new Date();
    filtered = allAssignments.filter(a => a.status !== 'completed' && a.deadline && new Date(a.deadline) < now);
  } else if (tab === 'completed') filtered = allAssignments.filter(a => a.status === 'completed');
  
  const container = document.getElementById('assignmentsList');
  if (!container) return;
  if (filtered.length === 0) {
    container.innerHTML = '<div class="assignment-item">No assignments found.</div>';
    return;
  }
  
  let html = '';
  filtered.forEach(a => {
    const statusText = a.status === 'assigned' ? 'In Progress' : a.status;
    let statusClass = 'status-in-progress';
    if (a.status === 'completed') statusClass = 'status-completed';
    if (a.status === 'overdue') statusClass = 'status-overdue';
    const deadlineStatus = a.deadline ? new Date(a.deadline) < new Date() ? 'Overdue' : new Date(a.deadline).toLocaleDateString() : 'No deadline';
    const showCancel = a.additionalFundsRequest && a.additionalFundsRequest.status === 'rejected';
    
    html += `
      <div class="assignment-item">
        <div class="assignment-header">
          <div>
            <div class="assignment-title"><i class="fas fa-file-alt" style="margin-right:6px;"></i> ${escapeHtml(a.title)}</div>
            <div class="assignment-meta">Student: ${escapeHtml(a.studentId.fullName)} • Budget: ${formatMoney(a.budget)} • Due: ${deadlineStatus}</div>
          </div>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
    `;
    
    if (a.status === 'assigned') {
      html += `
        <div class="btn-group">
          <input type="file" id="answer-${a._id}" accept=".pdf,.doc,.docx,.jpg,.png" style="display:none;">
          <button class="btn-sm btn-primary-sm" onclick="document.getElementById('answer-${a._id}').click(); uploadAnswer('${a._id}')">📎 Upload Answer</button>
          <button class="btn-sm btn-success-sm" onclick="completeQuestion('${a._id}', event)">✅ Mark Complete</button>
          <button class="btn-sm btn-warning-sm" onclick="requestAdditionalFunds('${a._id}')">💰 Request More</button>
          <button class="btn-sm btn-outline-sm" onclick="window.location.href='question-details.html?id=${a._id}'">📄 View Question</button>
          ${showCancel ? `<button class="btn-sm" style="background:#fee2e2; color:#b91c1c;" onclick="cancelAssignment('${a._id}')">❌ Cancel</button>` : ''}
        </div>
      `;
    } else if (a.status === 'completed') {
      html += `
        <div class="btn-group">
          ${a.answerFile ? `<button class="btn-sm btn-download" onclick="downloadAnswer('${a._id}')">⬇ Download Answer</button>` : '<span class="text-muted">No file uploaded</span>'}
          <button class="btn-sm btn-outline-sm" onclick="window.location.href='question-details.html?id=${a._id}'">📄 View Question</button>
        </div>
      `;
    }
    
    html += `</div>`;
  });
  container.innerHTML = html;
}

// ----- Tab switching -----
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.getAttribute('data-tab');
      renderAssignmentsByTab(currentTab);
    });
  });
}

// ----- Upload Answer (manual local update, no full reload) -----
async function uploadAnswer(questionId) {
  const fileInput = document.getElementById(`answer-${questionId}`);
  const file = fileInput.files[0];
  if (!file) { showToast('Select a file', 'error'); return; }
  
  const btn = fileInput.closest('.btn-group')?.querySelector('.btn-primary-sm');
  const originalText = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Uploading...'; }
  
  const formData = new FormData();
  formData.append('answer', file);
  try {
    const res = await fetch(`${window.API_BASE}/questions/${questionId}/upload-answer`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    
    // Manually update local assignment
    const assignment = allAssignments.find(a => a._id === questionId);
    if (assignment) {
      assignment.answerFile = data.fileUrl;
      assignment.answerFileName = file.name;
    }
    // Re-render current tab – "Mark Complete" button sees the file
    renderAssignmentsByTab(currentTab);
    
    showToast('Answer uploaded! You can now mark as complete.', 'success');
  } catch (err) {
    console.error('Upload error:', err);
    showToast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    fileInput.value = '';
  }
}

// ----- Download Answer (backend proxy) -----
async function downloadAnswer(questionId) {
  try {
    const question = await apiFetch(`/questions/${questionId}`);
    if (!question.answerFile) {
      showToast('No answer file available', 'error');
      return;
    }
    window.open(`${window.API_BASE}/questions/${questionId}/download-answer`, '_blank');
  } catch (err) {
    showToast('Failed to get download link', 'error');
  }
}

// ----- Mark Complete (instant spinner, removal from list, background refresh) -----
async function completeQuestion(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  
  console.log("🔵 COMPLETE QUESTION CLICKED for ID:", id);
  
  // Find the button and disable it
  let btn = event?.target;
  if (btn && !btn.classList?.contains('btn-success-sm')) {
    btn = btn.closest('.btn-success-sm');
  }
  const originalText = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Completing...';
  }
  
  // Get assignment from current list
  const assignment = allAssignments.find(a => a._id === id);
  if (!assignment) {
    showToast('Assignment not found', 'error');
    if (btn) btn.disabled = false;
    return;
  }
  
  if (!assignment.answerFile) {
    showToast('Please upload an answer first', 'error');
    if (btn) btn.disabled = false;
    return;
  }
  
  try {
    console.log("📡 Calling API: PUT /questions/" + id + "/complete");
    const response = await apiFetch(`/questions/${id}/complete`, { method: 'PUT' });
    console.log("✅ API Response:", response);
    
    showToast('Question marked as complete! Payment processed.', 'success');
    
    // Remove this assignment from the local array
    const index = allAssignments.findIndex(a => a._id === id);
    if (index !== -1) {
      allAssignments.splice(index, 1);
      console.log(`🗑️ Removed question ${id} from assignments list`);
    }
    
    // Re-render the current tab (so it disappears)
    renderAssignmentsByTab(currentTab);
    console.log("🔄 Re-rendered tab:", currentTab);
    
    // Update dashboard stats (balance, completed count) in background
    loadTutorDashboard().catch(console.warn);
    
  } catch (err) {
    console.error("❌ Complete error:", err);
    showToast(`Failed: ${err.message}`, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText || '✅ Mark Complete';
    }
  }
}

async function requestAdditionalFunds(questionId) {
  const amount = prompt('Additional amount requested ($):');
  if (!amount) return;
  const reason = prompt('Reason:');
  if (!reason) return;
  try {
    await apiFetch(`/questions/${questionId}/request-additional-funds`, {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), reason })
    });
    showToast('Request sent to student', 'success');
    loadAssignments();
  } catch (err) { showToast(err.message, 'error'); }
}

async function cancelAssignment(questionId) {
  const reason = prompt('Cancellation reason (student refused extra funds):');
  if (!reason) return;
  if (!confirm('Cancel this assignment?')) return;
  try {
    await apiFetch(`/questions/${questionId}/cancel-assignment`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    showToast('Assignment cancelled', 'success');
    loadTutorDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

// ----- Withdraw Funds -----
async function withdrawFunds() {
  const amount = prompt('Amount to withdraw (min $10):');
  if (!amount || isNaN(amount) || parseFloat(amount) < 10) { showToast('Invalid amount', 'error'); return; }
  const method = prompt('Method: paypal, mpesa, bank');
  if (!method) return;
  try {
    await apiFetch('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), method, accountDetails: { details: 'manual' } })
    });
    showToast('Withdrawal request submitted', 'success');
    loadTutorDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

// ----- Avatar upload -----
async function uploadAvatar() {
  const fileInput = document.getElementById('avatarFile');
  const file = fileInput.files[0];
  if (!file) { showToast('Select a file', 'error'); return; }
  const formData = new FormData();
  formData.append('avatar', file);
  try {
    const res = await fetch('/api/auth/avatar', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Avatar updated', 'success');
      const user = JSON.parse(localStorage.getItem('user'));
      user.avatar = data.avatarUrl;
      localStorage.setItem('user', JSON.stringify(user));
      updateUserMenu(user);
      closeAvatarModal();
    } else throw new Error(data.error);
  } catch (err) { showToast(err.message, 'error'); }
}

// ----- Notifications (simple modal) -----
const notificationBell = document.querySelector('.notification-bell');
if (notificationBell) {
  notificationBell.addEventListener('click', () => {
    const modal = document.getElementById('notificationModal');
    if (modal) modal.style.display = 'flex';
  });
}

// ----- Event listeners -----
document.addEventListener('DOMContentLoaded', () => {
  loadTutorDashboard();
  initTabs();
  const withdrawBtn = document.getElementById('withdrawBtn');
  if (withdrawBtn) withdrawBtn.addEventListener('click', withdrawFunds);
  const userMenuEl = document.querySelector('.user-menu');
  if (userMenuEl) userMenuEl.addEventListener('click', toggleUserMenu);
});

// Expose global functions
window.placeBid = placeBid;
window.acceptQuestion = acceptQuestion;
window.uploadAnswer = uploadAnswer;
window.downloadAnswer = downloadAnswer;
window.completeQuestion = completeQuestion;
window.requestAdditionalFunds = requestAdditionalFunds;
window.cancelAssignment = cancelAssignment;
window.logoutUser = logoutUser;
window.uploadAvatar = uploadAvatar;
window.changeAvailablePage = changeAvailablePage;
window.previewQuestion = previewQuestion;
window.closeQuestionPreview = closeQuestionPreview;