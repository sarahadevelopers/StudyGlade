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

// ----- Pagination for My Assignments -----
let assignmentsPage = 1;
let assignmentsTotalPages = 1;
const ASSIGNMENTS_PER_PAGE = 10;
// ----- Relative time (e.g., "2 hours ago") -----
function timeAgo(date) {
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' minutes ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' hours ago';
  if (diff < 172800) return 'Yesterday';
  return new Date(date).toLocaleDateString();
}

// ----- Format a date as "June 21, 2026" -----
function formatFullDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}
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

// ----- Question Preview Modal (unchanged) -----
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
    renderAssignmentsPagination();
    await loadAvailableQuestions();

    const dateInput = document.getElementById('dateFilter');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0,10);
  } catch (err) {
    console.error(err);
    showToast('Failed to load dashboard', 'error');
  }
}

// ----- Load Available Questions (with pagination and backend demo questions) -----
async function loadAvailableQuestions(page = 1) {
  try {
    const res = await fetch(`${window.API_BASE}/questions/pending?page=${page}&limit=${PAGE_SIZE}`, { credentials: 'include' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const questions = data.questions || [];
    const totalReal = data.total;

    const container = document.getElementById('availableQuestionsList');
    if (!container) return;
    if (questions.length === 0) {
      container.innerHTML = '<div class="available-item">No questions available</div>';
      document.getElementById('paginationControls').innerHTML = '';
      return;
    }

    let html = '';
    questions.forEach(q => {
      const isDemo = q.isDemo === true;

      // ----- FOR DEMO QUESTIONS: override posting date, deadline, school, course -----
      let displaySubject, displaySchool, displayCourse, displayCreatedAt, displayDeadline;

      if (isDemo) {
        // Always use current time for posting
        displayCreatedAt = new Date();

        // Deadline = 3 days from now
        displayDeadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

        // Subject – if missing or empty, stick to "General"
        displaySubject = (q.subject && q.subject.trim() !== '' && q.subject !== 'General') 
          ? q.subject 
          : 'General';

        // School – fallback to "GCU" if not provided
        displaySchool = (q.school && q.school.trim() !== '') 
          ? q.school 
          : 'GCU';

        // Course – if missing, show "Not specified" (admins should fill this)
        displayCourse = (q.course && q.course.trim() !== '') 
          ? q.course 
          : 'Not specified';
      } else {
        // Real questions: use stored values
        displaySubject = q.subject || 'General';
        displaySchool = q.school;
        displayCourse = q.course;
        displayCreatedAt = q.createdAt;
        displayDeadline = q.deadline;
      }

      // Build meta information string
      let metaParts = [
        `${escapeHtml(displaySubject)}`,
        `Budget: ${formatMoney(q.budget)}`,
        `Posted: ${timeAgo(displayCreatedAt)}`
      ];

      // Deadline
      if (displayDeadline) {
        metaParts.push(`Deadline: ${formatFullDate(displayDeadline)}`);
      } else {
        metaParts.push(`Deadline: Not set`);
      }

      // School & Course – only show if they exist (for dummy they always exist)
      if (displaySchool) metaParts.push(`School: ${escapeHtml(displaySchool)}`);
      if (displayCourse) metaParts.push(`Course: ${escapeHtml(displayCourse)}`);

      const metaString = metaParts.join(' • ');

      html += `
        <div class="available-item" data-id="${q._id}" data-demo="${isDemo}">
          <div class="available-header">
            <div>
              <div class="assignment-title">
                <i class="fas fa-file-alt" style="margin-right: 6px;"></i> ${escapeHtml(q.title)}
              </div>
              <div class="assignment-meta">${metaString}</div>
            </div>
            <span class="match-high">High Match</span>
          </div>
          <div class="bid-group">
            <input type="number" id="bid-${q._id}" placeholder="Bid amount" min="${q.budget}" step="1" class="bid-input">
            <button class="btn-sm btn-primary-sm" onclick="placeBid('${q._id}', ${isDemo})">Place Bid</button>
            <button class="btn-sm btn-outline-sm" onclick="acceptQuestion('${q._id}', ${isDemo})">Accept at ${formatMoney(q.budget)}</button>
            <button class="btn-sm btn-outline-sm" onclick="previewQuestion('${q._id}')">Preview</button>
            <button class="btn-sm btn-outline-sm" onclick="window.location.href='question-details.html?id=${q._id}'">View Question</button>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;

    totalAvailablePages = Math.ceil(totalReal / PAGE_SIZE);
    currentAvailablePage = page;
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
  let newPage = currentAvailablePage + delta;
  if (newPage < 1) newPage = 1;
  if (newPage > totalAvailablePages) newPage = totalAvailablePages;
  loadAvailableQuestions(newPage);
};

// ----- Place Bid (with demo question handling) -----
async function placeBid(questionId, isDemo = false) {
  // Helper to show toast or fallback to alert
  function notify(message, type = 'info') {
    if (typeof showToast === 'function') {
      showToast(message, type);
    } else {
      // Fallback: use alert
      alert(message);
    }
  }

  // Demo question: fake bid with immediate visual feedback
  if (isDemo) {
    notify('Bid placed (demo) – this is a practice question', 'success');

    const container = document.querySelector(`.available-item[data-id="${questionId}"]`);
    if (container) {
      container.style.opacity = '0.6';
      container.style.pointerEvents = 'none';
      container.style.backgroundColor = '#f5f5f5';
      container.title = 'Demo bid placed';
    }
    return;
  }

  // ---------- Real question logic ----------
  console.log('placeBid called for', questionId);

  const input = document.getElementById(`bid-${questionId}`);
  const container = input?.closest('.available-item');
  const btn = container?.querySelector('.btn-primary-sm');
  const amount = input?.value?.trim();

  // Validate amount
  if (!amount || parseFloat(amount) <= 0) {
    notify('Please enter a valid bid amount.', 'error');
    return;
  }

  // Disable inputs and show loading state
  if (input) input.disabled = true;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Placing...';
  }

  try {
    // Send bid request
    await apiFetch(`/questions/${questionId}/bid`, {
      method: 'POST',
      body: JSON.stringify({
        amount: parseFloat(amount),
        message: 'Bid from dashboard'
      })
    });

    notify('Bid placed successfully!', 'success');

    // Mark the question as bid on
    if (container) {
      container.style.opacity = '0.6';
      container.style.pointerEvents = 'none';
      container.style.backgroundColor = '#f5f5f5';
      container.title = 'You have already placed a bid on this question';

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
    console.error('Bid error:', err);
    notify(err.message || 'Failed to place bid. Please try again.', 'error');

    // Re-enable inputs on error
    if (input) input.disabled = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Place Bid';
    }
  }
}
// ----- Accept Question (with restriction handling) -----
async function acceptQuestion(questionId, isDemo = false) {
  try {
    const response = await fetch(`${window.API_BASE}/questions/${questionId}/accept`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();

    // ✅ Debug log: see exactly what the server returns
    console.log('📨 Accept response:', data);

    if (response.ok) {
      showToast('Question accepted!', 'success');
      loadTutorDashboard();
    } else if (data.error === 'restricted') {
      // Show the restriction modal with the server message
      showRestrictionModal(data.message);
    } else {
      showToast(data.error || 'Failed to accept question', 'error');
    }
  } catch (err) {
    console.error('Accept error:', err);
    showToast('Network error: ' + err.message, 'error');
  }
}
// ----- Restriction Modal (for demo questions) -----
function showRestrictionModal(message) {
  const modal = document.getElementById('restrictionModal');
  const body = document.getElementById('restrictionModalBody');
  if (!modal || !body) {
    // Fallback: show toast if modal not found
    showToast(message, 'error');
    return;
  }
  body.innerHTML = `
    <div style="text-align: center; padding: 0.5rem;">
      <i class="fas fa-lock" style="font-size: 2.5rem; color: var(--warning, #f59e0b); margin-bottom: 1rem;"></i>
      <p style="font-size: 1rem; color: var(--text-navy, #0f172a); line-height: 1.6;">${escapeHtml(message)}</p>
      <p style="font-size: 0.85rem; color: var(--slate, #64748b); margin-top: 0.5rem;">
        You can still <strong>place a bid</strong> on this question – if the student considers you, they may invite you to accept it later.
      </p>
      <button class="btn-primary" style="margin-top: 1rem; width: auto; padding: 0.6rem 2rem;" onclick="closeRestrictionModal()">Got it</button>
    </div>
  `;
  modal.style.display = 'flex';
}

function closeRestrictionModal() {
  const modal = document.getElementById('restrictionModal');
  if (modal) modal.style.display = 'none';
}

// Expose to global scope
window.showRestrictionModal = showRestrictionModal;
window.closeRestrictionModal = closeRestrictionModal;


// ----- Load Assignments (with pagination) -----
async function loadAssignments(page = 1) {
  try {
    const all = await apiFetch('/questions/my-assignments');
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    allAssignments = all;
    assignmentsTotalPages = Math.ceil(allAssignments.length / ASSIGNMENTS_PER_PAGE);
    assignmentsPage = Math.min(page, assignmentsTotalPages) || 1;
    renderAssignmentsByTab(currentTab);
    renderAssignmentsPagination();
  } catch (err) {
    console.error(err);
    document.getElementById('assignmentsList').innerHTML = '<div>Error loading assignments</div>';
  }
}

async function refreshAssignments() {
  await loadAssignments(assignmentsPage);
  renderAssignmentsByTab(currentTab);
  showToast('Assignments refreshed', 'success');
}

function renderAssignmentsByTab(tab) {
  let filtered = [];
  if (tab === 'all') filtered = allAssignments;
  else if (tab === 'in-progress') filtered = allAssignments.filter(a => a.status === 'assigned' || a.status === 'in_progress');
  else if (tab === 'overdue') {
    const now = new Date();
    filtered = allAssignments.filter(a => a.status !== 'completed' && a.deadline && new Date(a.deadline) < now);
  } else if (tab === 'completed') filtered = allAssignments.filter(a => a.status === 'completed');

  const start = (assignmentsPage - 1) * ASSIGNMENTS_PER_PAGE;
  const paginated = filtered.slice(start, start + ASSIGNMENTS_PER_PAGE);

  const container = document.getElementById('assignmentsList');
  if (!container) return;
  if (paginated.length === 0) {
    container.innerHTML = '<div class="assignment-item">No assignments found.</div>';
    return;
  }

  let html = '';
  paginated.forEach(a => {
    const statusText = a.status === 'assigned' ? 'In Progress' : a.status;
    let statusClass = 'status-in-progress';
    if (a.status === 'completed') statusClass = 'status-completed';
    if (a.status === 'overdue') statusClass = 'status-overdue';

    let deadlineDisplay = 'No deadline';
    if (a.deadline) {
      const deadlineDate = new Date(a.deadline);
      deadlineDisplay = deadlineDate.toLocaleString();
    }
    const showCancel = a.additionalFundsRequest && a.additionalFundsRequest.status === 'rejected';

    html += `
      <div class="assignment-item">
        <div class="assignment-header">
          <div>
            <div class="assignment-title"><i class="fas fa-file-alt" style="margin-right:6px;"></i> ${escapeHtml(a.title)}</div>
            <div class="assignment-meta">Student: ${escapeHtml(a.studentId.fullName)} • Budget: ${formatMoney(a.budget)} • Deadline: ${deadlineDisplay}</div>
          </div>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
    `;

    if (a.status === 'assigned') {
      html += `
        <div class="btn-group">
         <input type="file" id="answer-${a._id}" class="assignment-file-input" accept=".pdf,.doc,.docx,.jpg,.png" multiple style="display:none;">
          <button class="btn-sm btn-primary-sm" onclick="document.getElementById('answer-${a._id}').click()">📎 Upload Answers</button>
          <button class="btn-sm btn-success-sm" data-question-id="${a._id}" onclick="completeQuestion('${a._id}', event)">✅ Mark Complete</button>
          <button class="btn-sm btn-warning-sm" onclick="requestAdditionalFunds('${a._id}')">💰 Request More</button>
          <button class="btn-sm btn-outline-sm" onclick="window.location.href='question-details.html?id=${a._id}'">📄 View Question</button>
          ${showCancel ? `<button class="btn-sm" style="background:#fee2e2; color:#b91c1c;" onclick="cancelAssignment('${a._id}')">❌ Cancel</button>` : ''}
        </div>
      `;
    } else if (a.status === 'completed') {
      let answerTimeHtml = '';
      if (a.answerUploadedAt) {
        const submittedDate = new Date(a.answerUploadedAt);
        answerTimeHtml = `<div class="assignment-meta" style="margin-top:4px;">Answer submitted: ${submittedDate.toLocaleString()}</div>`;
      }
      html += `
        <div class="btn-group">
          ${a.answerFile ? `<button class="btn-sm btn-download" onclick="downloadAnswer('${a._id}')">⬇ Download Answer</button>` : '<span class="text-muted">No file uploaded</span>'}
          <button class="btn-sm btn-outline-sm" onclick="window.location.href='question-details.html?id=${a._id}'">📄 View Question</button>
        </div>
        ${answerTimeHtml}
      `;
    }
    html += `</div>`;
  });
  container.innerHTML = html;

  // Attach change event listeners to all file inputs with class "assignment-file-input"
  document.querySelectorAll('.assignment-file-input').forEach(input => {
    const questionId = input.id.replace('answer-', '');
    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        uploadAnswer(questionId);
      }
    });
  });
}

function renderAssignmentsPagination() {
  if (assignmentsTotalPages <= 1) return;
  let paginationDiv = document.getElementById('assignmentsPagination');
  if (!paginationDiv) {
    const container = document.getElementById('assignmentsList');
    const wrapper = container?.parentNode;
    if (!wrapper) return;
    paginationDiv = document.createElement('div');
    paginationDiv.id = 'assignmentsPagination';
    paginationDiv.className = 'assignments-pagination';
    wrapper.appendChild(paginationDiv);
  }
  paginationDiv.innerHTML = `
    <button onclick="changeAssignmentsPage(-1)" ${assignmentsPage === 1 ? 'disabled' : ''}>Prev</button>
    <span>${assignmentsPage} / ${assignmentsTotalPages}</span>
    <button onclick="changeAssignmentsPage(1)" ${assignmentsPage === assignmentsTotalPages ? 'disabled' : ''}>Next</button>
  `;
}

window.changeAssignmentsPage = function(delta) {
  const newPage = assignmentsPage + delta;
  if (newPage >= 1 && newPage <= assignmentsTotalPages) {
    assignmentsPage = newPage;
    renderAssignmentsByTab(currentTab);
    renderAssignmentsPagination();
  }
};

function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.getAttribute('data-tab');
      assignmentsPage = 1;
      renderAssignmentsByTab(currentTab);
      renderAssignmentsPagination();
    });
  });
}

// ----- Assignment actions -----
async function uploadAnswer(questionId) {
  console.log(`[UPLOAD] Called for question ${questionId}`);
  const fileInput = document.getElementById(`answer-${questionId}`);
  if (!fileInput) {
    console.error(`[UPLOAD] File input not found: answer-${questionId}`);
    showToast('File input not found', 'error');
    return;
  }
  const files = fileInput.files;
  if (!files.length) {
    showToast('Select at least one file', 'error');
    return;
  }
  console.log(`[UPLOAD] ${files.length} file(s) selected`);

  const btn = fileInput.closest('.btn-group')?.querySelector('.btn-primary-sm');
  const originalText = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Uploading...';
  }

  const formData = new FormData();
  // Append all files under the same field name 'answers'
  for (let i = 0; i < files.length; i++) {
    formData.append('answers', files[i]);
  }

  try {
    console.log(`[UPLOAD] Sending POST to /api/questions/${questionId}/upload-answers`);
    const response = await fetch(`${window.API_BASE}/questions/${questionId}/upload-answers`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    console.log(`[UPLOAD] Response status: ${response.status}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Upload failed');
    console.log(`[UPLOAD] Success, uploaded ${data.urls.length} file(s)`);

    // Reload assignments to reflect new files
    await loadAssignments(assignmentsPage);
    renderAssignmentsByTab(currentTab);

    showToast('Answer(s) uploaded! You can now mark as complete.', 'success');
  } catch (err) {
    console.error('[UPLOAD] Error:', err);
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
    fileInput.value = ''; // clear selection
  }
}

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

// ---------- Confirmation modal for marking complete ----------
let pendingCompleteQuestionId = null;

function showCompleteModal(questionId) {
  console.log('showCompleteModal called with ID:', questionId);
  if (!questionId) {
    console.error('showCompleteModal: No question ID provided');
    return;
  }
  pendingCompleteQuestionId = questionId;
  const modal = document.getElementById('completeQuestionModal');
  if (modal) {
    document.getElementById('confirmOriginalWork').checked = false;
    document.getElementById('confirmNoPlagiarism').checked = false;
    document.getElementById('confirmGrammar').checked = false;
    document.getElementById('confirmTerms').checked = false;
    modal.style.display = 'flex';
  } else {
    console.warn('Complete modal not found');
    doCompleteQuestion(questionId);
  }
}

function closeCompleteModal() {
  const modal = document.getElementById('completeQuestionModal');
  if (modal) modal.style.display = 'none';
  // Do NOT clear pendingCompleteQuestionId here – keep it until after confirmation.
}

async function confirmComplete() {
  console.log('confirmComplete called, pending ID:', pendingCompleteQuestionId);
  if (!pendingCompleteQuestionId) {
    showToast('No question selected. Please try again.', 'error');
    closeCompleteModal();
    return;
  }
  const originalWork = document.getElementById('confirmOriginalWork').checked;
  const noPlagiarism = document.getElementById('confirmNoPlagiarism').checked;
  const grammar = document.getElementById('confirmGrammar').checked;
  const terms = document.getElementById('confirmTerms').checked;
  if (!originalWork || !noPlagiarism || !grammar || !terms) {
    showToast('Please confirm all requirements before marking as complete.', 'error');
    return;
  }
  closeCompleteModal();
  const idToComplete = pendingCompleteQuestionId;
  pendingCompleteQuestionId = null;
  console.log('About to call doCompleteQuestion with id:', idToComplete);
  await doCompleteQuestion(idToComplete);
}

async function doCompleteQuestion(id) {
  if (!id) {
    showToast('Invalid question ID', 'error');
    return;
  }
  const btn = document.querySelector(`.btn-success-sm[data-question-id="${id}"]`);
  const originalText = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Completing...';
  }
  let attempts = 0;
  const maxAttempts = 4;
  let delay = 1000;
  while (attempts < maxAttempts) {
    try {
      await apiFetch(`/questions/${id}/complete`, { method: 'PUT' });
      showToast('Question marked as complete! Payment processed.', 'success');
      await loadTutorDashboard();
      return;
    } catch (err) {
      attempts++;
      console.error(`Attempt ${attempts} failed:`, err.message);
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        showToast('Failed to complete after multiple attempts. Please refresh and try again.', 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = originalText || '✅ Mark Complete';
        }
      }
    }
  }
}

// Wrapper function called from button onclick
async function completeQuestion(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const btn = event?.target?.closest('.btn-success-sm');
  if (btn) btn.setAttribute('data-question-id', id);
  showCompleteModal(id);
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

// ========== NOTIFICATION SOUND CONTROL ==========
let notificationSoundEnabled = localStorage.getItem('notificationSound') !== 'false';
const audio = new Audio('/sounds/notification.mp3');

function playNotificationSound() {
  if (!notificationSoundEnabled) return;
  audio.play().catch(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 800;
      gain.gain.value = 0.5;
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch(e) {}
  });
}

const soundToggle = document.getElementById('notificationSoundToggle');
if (soundToggle) {
  function updateSoundToggleUI() {
    if (notificationSoundEnabled) {
      soundToggle.classList.remove('muted');
      soundToggle.innerHTML = '<i class="fas fa-volume-up"></i>';
    } else {
      soundToggle.classList.add('muted');
      soundToggle.innerHTML = '<i class="fas fa-volume-mute"></i>';
    }
  }
  soundToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    notificationSoundEnabled = !notificationSoundEnabled;
    localStorage.setItem('notificationSound', notificationSoundEnabled);
    updateSoundToggleUI();
    if (notificationSoundEnabled) playNotificationSound();
  });
  updateSoundToggleUI();
}

// ========== NOTIFICATIONS DROPDOWN ==========
const notificationBell = document.querySelector('.notification-bell');
let notificationDropdown = null;
let notificationPage = 1;
let notificationHasMore = true;
let isLoadingNotifications = false;

function createNotificationDropdown() {
  if (notificationDropdown) return;
  notificationDropdown = document.createElement('div');
  notificationDropdown.className = 'notification-dropdown';
  notificationDropdown.innerHTML = `
    <div class="notification-header">Recent Notifications</div>
    <div class="notification-list" id="notificationListDropdown">Loading...</div>
    <div class="notification-footer">
      <a href="#" onclick="markAllRead(event); return false;">Mark all as read</a>
      <button id="loadMoreNotifications" class="load-more-btn" style="display: none;">Load more</button>
    </div>
  `;
  document.body.appendChild(notificationDropdown);
}

async function loadNotificationsDropdown(reset = true) {
  if (isLoadingNotifications) return;
  isLoadingNotifications = true;
  if (!notificationDropdown) createNotificationDropdown();
  const listDiv = notificationDropdown.querySelector('.notification-list');
  if (reset) {
    notificationPage = 1;
    notificationHasMore = true;
    listDiv.innerHTML = '<div class="notification-item">Loading...</div>';
  }
  try {
    const res = await fetch(`/api/notifications?limit=10&page=${notificationPage}`, { credentials: 'include' });
    const data = await res.json();
    let html = '';
    if (data.notifications.length === 0 && reset) {
      html = '<div class="notification-item no-notifications">No notifications</div>';
      notificationHasMore = false;
    } else {
      data.notifications.forEach(n => {
        html += `<div class="notification-item" data-id="${n._id}">
                   <strong>${escapeHtml(n.title)}</strong><br>
                   ${escapeHtml(n.message)}
                   <div class="notification-time">${new Date(n.createdAt).toLocaleString()}</div>
                 </div>`;
      });
      notificationHasMore = data.pagination && notificationPage < data.pagination.pages;
    }
    if (reset) {
      listDiv.innerHTML = html;
    } else {
      listDiv.insertAdjacentHTML('beforeend', html);
    }
    const loadMoreBtn = notificationDropdown.querySelector('#loadMoreNotifications');
    if (loadMoreBtn) {
      loadMoreBtn.style.display = notificationHasMore ? 'inline-block' : 'none';
    }
  } catch (err) {
    listDiv.innerHTML = '<div class="notification-item error">Failed to load</div>';
  } finally {
    isLoadingNotifications = false;
  }
}

async function loadMoreNotifications() {
  if (!notificationHasMore || isLoadingNotifications) return;
  notificationPage++;
  await loadNotificationsDropdown(false);
}

async function toggleNotificationDropdown(event) {
  event.stopPropagation();
  if (!notificationDropdown) createNotificationDropdown();
  const isVisible = notificationDropdown.style.display === 'block';
  if (isVisible) {
    notificationDropdown.style.display = 'none';
  } else {
    await loadNotificationsDropdown(true);
    notificationDropdown.style.display = 'block';
    const loadMoreBtn = notificationDropdown.querySelector('#loadMoreNotifications');
    if (loadMoreBtn && !loadMoreBtn.hasListener) {
      loadMoreBtn.addEventListener('click', loadMoreNotifications);
      loadMoreBtn.hasListener = true;
    }
  }
}

async function markAllRead(event) {
  if (event) event.preventDefault();
  try {
    const res = await fetch('/api/notifications/read-all', {
      method: 'PUT',
      credentials: 'include'
    });
    if (res.ok) {
      showToast('All notifications marked as read', 'info');
      const badge = document.querySelector('.notification-bell .badge');
      if (badge) badge.innerText = '0';
      if (notificationDropdown && notificationDropdown.style.display === 'block') {
        loadNotificationsDropdown(true);
      }
    } else {
      showToast('Failed to mark as read', 'error');
    }
  } catch (err) {
    console.error(err);
  }
}

function closeNotificationDropdown() {
  if (notificationDropdown) notificationDropdown.style.display = 'none';
}

document.addEventListener('click', function(e) {
  if (notificationDropdown && !notificationDropdown.contains(e.target) && !e.target.closest('.notification-bell')) {
    notificationDropdown.style.display = 'none';
  }
});

if (notificationBell) {
  notificationBell.addEventListener('click', toggleNotificationDropdown);
}

window.markAllRead = markAllRead;
window.loadMoreNotifications = loadMoreNotifications;

// ========== LIVE UNREAD COUNT + SOUND ==========
let lastUnreadCount = 0;

async function updateUnreadCountAndSound() {
  try {
    const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
    const data = await res.json();
    const currentCount = data.count;
    if (currentCount > lastUnreadCount && notificationSoundEnabled) {
      playNotificationSound();
    }
    lastUnreadCount = currentCount;
    const badge = document.querySelector('.notification-bell .badge');
    if (badge) badge.innerText = currentCount > 9 ? '9+' : currentCount;
  } catch (err) {
    console.error('Failed to fetch unread count:', err);
  }
}

updateUnreadCountAndSound();
setInterval(updateUnreadCountAndSound, 30000);

// Refresh assignments & available questions every 30 seconds
setInterval(async () => {
  if (document.querySelector('.main-content')) {
    await loadAssignments();
    renderAssignmentsPagination();
    await loadAvailableQuestions(currentAvailablePage);
  }
}, 30000);

const yearSpan = document.getElementById('currentYear');
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}

// ----- Event listeners -----
document.addEventListener('DOMContentLoaded', () => {
  loadTutorDashboard();
  initTabs();
  const withdrawBtn = document.getElementById('withdrawBtn');
  if (withdrawBtn) withdrawBtn.addEventListener('click', withdrawFunds);
  const userMenuEl = document.querySelector('.user-menu');
  if (userMenuEl) userMenuEl.addEventListener('click', toggleUserMenu);
  const confirmBtn = document.getElementById('confirmCompleteBtn');
  if (confirmBtn) confirmBtn.addEventListener('click', confirmComplete);
  const refreshBtn = document.getElementById('refreshAssignmentsBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshAssignments);
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
window.changeAssignmentsPage = changeAssignmentsPage;
window.closeCompleteModal = closeCompleteModal;