// Helper: escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Helper: format money with 2 decimals
function formatMoney(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

// Helper: get deadline status (shows "Overdue", "Due soon", or days left)
function getDeadlineStatus(deadline) {
  if (!deadline) return { class: 'deadline-normal', text: 'No deadline' };
  const now = new Date();
  const due = new Date(deadline);
  const diffHours = (due - now) / (1000 * 60 * 60);
  if (diffHours < 0) return { class: 'deadline-overdue', text: 'Overdue' };
  if (diffHours < 24) {
    const hoursLeft = Math.ceil(diffHours);
    return { class: 'deadline-soon', text: `Due in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}` };
  }
  const daysLeft = Math.ceil(diffHours / 24);
  return { class: 'deadline-normal', text: `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left` };
}

// Helper for file uploads
async function uploadFile(endpoint, file) {
  const formData = new FormData();
  formData.append('answer', file);
  const res = await fetch(`${window.API_BASE}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    body: formData
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

let currentPage = 1;
const PAGE_SIZE = 10;

// ---------- Fetch fresh user data ----------
async function fetchFreshUser() {
  const user = await apiFetch('/auth/me');
  localStorage.setItem('user', JSON.stringify(user));
  return user;
}

// ---------- Safe element update ----------
function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.innerText = text;
  else console.warn(`Element #${id} not found`);
}

function safeSetHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
  else console.warn(`Element #${id} not found`);
}

// ---------- Load Dashboard ----------
async function loadTutorDashboard() {
  try {
    const user = await fetchFreshUser();

    // Update stats cards
    safeSetText('walletBalance', formatMoney(user.walletBalance));
    safeSetText('walletBalanceStat', formatMoney(user.walletBalance));
    safeSetText('totalEarnings', formatMoney(user.tutorProfile?.totalEarnings || 0));
    const ratingValue = (user.tutorProfile?.rating || 0).toFixed(1);
    safeSetHtml('tutorRating', `${ratingValue} ⭐`);
    safeSetText('tutorLevel', user.tutorProfile?.level || 'Entry-Level');

    // Fetch total withdrawals
    try {
      const withdrawData = await apiFetch('/wallet/withdrawals-total');
      safeSetText('totalWithdrawals', formatMoney(withdrawData.total));
    } catch (err) {
      console.error('Failed to load withdrawals total', err);
      safeSetText('totalWithdrawals', '$0.00');
    }

    // Load pending questions
    await loadPendingQuestions();

    // Load assignments
    const assignments = await apiFetch('/questions/my-assignments');
    const assignDiv = document.getElementById('myAssignments');
    if (!assignDiv) return;

    if (!assignments || assignments.length === 0) {
      assignDiv.innerHTML = '<div class="card premium-card"><p>No assignments yet.</p></div>';
      return;
    }

    assignDiv.innerHTML = assignments.map(q => {
      const deadlineStatus = getDeadlineStatus(q.deadline);
      const statusClass = q.status === 'pending' ? 'status-pending' : (q.status === 'assigned' ? 'status-assigned' : 'status-completed');
      const showCancel = q.additionalFundsRequest && q.additionalFundsRequest.status === 'rejected';
      const budgetFormatted = formatMoney(q.budget);

      return `
        <div class="card premium-card" style="margin-bottom: 1rem;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
            <div>
              <strong>${escapeHtml(q.title)}</strong>
              <span class="status-badge ${statusClass}" style="margin-left:0.5rem;">${escapeHtml(q.status)}</span>
              <span class="status-badge ${deadlineStatus.class}" style="margin-left:0.5rem;">${deadlineStatus.text}</span>
            </div>
            <div class="btn-group">
              <a href="question-details.html?id=${q._id}" class="btn-sm">📄 View Question</a>
              ${q.status !== 'completed' && q.answerFile ? `<a href="${q.answerFile}" download class="btn-sm">⬇ Download Answer</a>` : ''}
            </div>
          </div>
          <div style="margin-top:0.5rem; font-size:0.9rem;">
            Student: ${escapeHtml(q.studentId.fullName)} | Budget: ${budgetFormatted}
          </div>
          ${q.status === 'assigned' ? `
            <div style="margin-top: 0.75rem;">
              <input type="file" id="answer-${q._id}" accept=".pdf,.doc,.docx,.jpg,.png,.txt" style="margin-bottom:0.5rem;">
              <div class="btn-group">
                <button onclick="uploadAnswer('${q._id}', event)" class="btn">📎 Upload Answer</button>
                <button onclick="completeQuestion('${q._id}')" class="btn-outline">✅ Mark Complete</button>
                <button onclick="requestAdditionalFunds('${q._id}')" class="btn-outline">💰 Request More Funds</button>
                ${showCancel ? `<button onclick="cancelAssignment('${q._id}')" class="btn-outline" style="background:#ef4444; color:white;">❌ Cancel (No Penalty)</button>` : ''}
              </div>
            </div>
          ` : ''}
          ${q.status === 'completed' && q.answerFile ? `
            <div class="btn-group" style="margin-top:0.5rem;">
              <a href="${q.answerFile}" download class="btn-sm">⬇ Download Answer</a>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Dashboard load error:', err);
    showToast('Failed to load dashboard data', 'error');
  }
}

async function loadPendingQuestions() {
  try {
    const res = await fetch(`${window.API_BASE}/questions/pending?page=${currentPage}&limit=${PAGE_SIZE}`, {
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to load pending');
    const data = await res.json();
    const pendingDiv = document.getElementById('pendingQuestions');
    if (!pendingDiv) return;

    if (!data.questions || data.questions.length === 0) {
      pendingDiv.innerHTML = '<div class="card premium-card"><p>No pending questions available.</p></div>';
      const paginationDiv = document.getElementById('paginationControls');
      if (paginationDiv) paginationDiv.innerHTML = '';
      return;
    }

    pendingDiv.innerHTML = data.questions.map(q => `
      <div class="card premium-card" style="margin-bottom: 1rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
          <div>
            <strong>${escapeHtml(q.title)}</strong><br>
            Student budget: ${formatMoney(q.budget)} | Student: ${escapeHtml(q.studentId.fullName)}
          </div>
          <a href="question-details.html?id=${q._id}" class="btn-sm">Details</a>
        </div>
        <div class="btn-group" style="margin-top:0.5rem;">
          <input type="number" id="bid-${q._id}" placeholder="Bid amount" min="${q.budget}" step="1" style="width:150px;">
          <button onclick="placeBid('${q._id}')" class="btn">💰 Place Bid</button>
          <button onclick="acceptQuestion('${q._id}', event)" class="btn-outline">Accept at ${formatMoney(q.budget)}</button>
        </div>
      </div>
    `).join('');

    const paginationDiv = document.getElementById('paginationControls');
    if (paginationDiv) {
      const totalPages = Math.ceil(data.total / PAGE_SIZE);
      paginationDiv.innerHTML = `
        <button onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${currentPage} of ${totalPages}</span>
        <button onclick="changePage(1)" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
      `;
    }
  } catch (err) {
    console.error('Error loading pending questions:', err);
    const pendingDiv = document.getElementById('pendingQuestions');
    if (pendingDiv) pendingDiv.innerHTML = '<div class="card premium-card"><p>Error loading questions. Please refresh.</p></div>';
  }
}

window.changePage = (delta) => {
  currentPage += delta;
  if (currentPage < 1) currentPage = 1;
  loadPendingQuestions();
};

// ---------- Bid and action functions (unchanged) ----------
async function placeBid(questionId) {
  const amountInput = document.getElementById(`bid-${questionId}`);
  if (!amountInput) return;
  const amount = amountInput.value;
  if (!amount || amount <= 0) {
    showToast('Enter a valid bid amount (minimum $1)', 'error');
    return;
  }
  try {
    await apiFetch(`/questions/${questionId}/bid`, {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), message: 'Bid from dashboard' })
    });
    showToast('Bid placed!', 'success');
    amountInput.value = '';
    loadPendingQuestions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function acceptQuestion(questionId, event) {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Accepting...'; }
  try {
    await apiFetch(`/questions/${questionId}/accept`, { method: 'PUT' });
    showToast('Question accepted!', 'success');
    loadTutorDashboard();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = `Accept at student's budget`; }
  }
}

async function uploadAnswer(questionId, event) {
  const fileInput = document.getElementById(`answer-${questionId}`);
  const btn = event?.target;
  if (!fileInput) return;
  const file = fileInput.files[0];
  if (!file) { showToast('Select a file', 'error'); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Uploading...'; }
  try {
    await uploadFile(`/questions/${questionId}/upload-answer`, file);
    showToast('Answer uploaded!', 'success');
    loadTutorDashboard();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Upload Answer'; }
  }
}

async function completeQuestion(id) {
  try {
    await apiFetch(`/questions/${id}/complete`, { method: 'PUT' });
    showToast('Completed! Payment processed.', 'success');
    loadTutorDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function requestAdditionalFunds(questionId) {
  const amount = prompt('Additional amount requested ($):');
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return showToast('Invalid amount', 'error');
  const reason = prompt('Reason for additional funds:');
  if (!reason) return showToast('Reason required', 'error');
  try {
    await apiFetch(`/questions/${questionId}/request-additional-funds`, {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), reason })
    });
    showToast('Request sent to student', 'success');
    loadTutorDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function cancelAssignment(questionId) {
  const reason = prompt('Cancellation reason (student refused extra funds):');
  if (!reason) return;
  if (!confirm('Cancel this assignment? No penalty.')) return;
  try {
    await apiFetch(`/questions/${questionId}/cancel-assignment`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    showToast('Assignment cancelled', 'success');
    loadTutorDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function withdrawFunds() {
  const amount = prompt('Withdraw amount (USD):');
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) return showToast('Invalid amount', 'error');
  const method = prompt('Withdrawal method: paypal, mpesa, bank, payoneer');
  if (!method) return;
  const accountDetails = prompt('Enter account details (email/phone/account number):');
  if (!accountDetails) return;
  try {
    await apiFetch('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), method, accountDetails: { details: accountDetails } })
    });
    showToast('Withdrawal request submitted. Admin will process within 3‑5 business days.', 'success');
    location.reload();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Expose functions globally
window.placeBid = placeBid;
window.acceptQuestion = acceptQuestion;
window.uploadAnswer = uploadAnswer;
window.completeQuestion = completeQuestion;
window.withdrawFunds = withdrawFunds;
window.requestAdditionalFunds = requestAdditionalFunds;
window.cancelAssignment = cancelAssignment;

// Initial load
loadTutorDashboard();