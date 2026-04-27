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

// Helper: format deadline status
function getDeadlineStatus(deadline) {
  if (!deadline) return { class: 'deadline-normal', text: 'No deadline' };
  const now = new Date();
  const due = new Date(deadline);
  const diffHours = (due - now) / (1000 * 60 * 60);
  if (diffHours < 0) return { class: 'deadline-overdue', text: 'Overdue' };
  if (diffHours < 24) return { class: 'deadline-soon', text: 'Due soon' };
  return { class: 'deadline-normal', text: due.toLocaleDateString() };
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

// ---------- Dashboard Load ----------
async function loadTutorDashboard() {
  const user = JSON.parse(localStorage.getItem('user'));
  
  // Update stats
  document.getElementById('walletBalance').innerText = `$${user.walletBalance}`;
  document.getElementById('walletBalanceStat').innerText = `$${user.walletBalance}`;
  document.getElementById('totalEarnings').innerText = `$${user.tutorProfile?.totalEarnings || 0}`;
  document.getElementById('tutorRating').innerHTML = `${user.tutorProfile?.rating || 0} ⭐`;
  document.getElementById('tutorLevelStat').innerText = user.tutorProfile?.level || 'Entry-Level';
  const levelSpan = document.getElementById('tutorLevel');
  if (levelSpan) levelSpan.innerText = user.tutorProfile?.level || 'Entry-Level';

  // Load pending questions
  await loadPendingQuestions();

  // Load assignments
  const assignments = await apiFetch('/questions/my-assignments');
  const assignDiv = document.getElementById('myAssignments');
  assignDiv.innerHTML = assignments.map(q => {
    const deadlineStatus = getDeadlineStatus(q.deadline);
    const statusClass = q.status === 'pending' ? 'status-pending' : (q.status === 'assigned' ? 'status-assigned' : 'status-completed');
    
    // Determine if cancel button should be shown (only if there is a rejected additional funds request)
    const showCancel = q.additionalFundsRequest && q.additionalFundsRequest.status === 'rejected';
    
    return `
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap;">
          <div>
            <strong>${escapeHtml(q.title)}</strong>
            <span class="status-badge ${statusClass}" style="margin-left:0.5rem;">${escapeHtml(q.status)}</span>
            <span class="status-badge ${deadlineStatus.class}" style="margin-left:0.5rem;">${deadlineStatus.text}</span>
          </div>
          <a href="question-details.html?id=${q._id}" class="btn-sm">📄 View Question</a>
        </div>
        <div style="margin-top:0.5rem; font-size:0.9rem;">
          Student: ${escapeHtml(q.studentId.fullName)} | Budget: $${q.budget}
        </div>
        ${q.status === 'assigned' ? `
          <div class="btn-group">
            <input type="file" id="answer-${q._id}" accept=".pdf,.doc,.docx,.jpg,.png,.txt" style="flex:1;">
            <button onclick="uploadAnswer('${q._id}', event)" class="btn">📎 Upload Answer</button>
            ${q.answerFile ? `<a href="${q.answerFile}" download class="btn-outline">⬇ Download Answer</a>` : ''}
            <button onclick="completeQuestion('${q._id}')" class="btn-outline">✅ Mark Complete</button>
            <button onclick="requestAdditionalFunds('${q._id}')" class="btn-outline">💰 Request More Funds</button>
            ${showCancel ? `<button onclick="cancelAssignment('${q._id}')" class="btn-outline" style="background:#ef4444; color:white;">❌ Cancel (No Penalty)</button>` : ''}
          </div>
        ` : ''}
        ${q.status === 'completed' && q.answerFile ? `
          <div class="btn-group">
            <a href="${q.answerFile}" download class="btn-outline">⬇ Download Answer</a>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function loadPendingQuestions() {
  const res = await fetch(`${window.API_BASE}/questions/pending?page=${currentPage}&limit=${PAGE_SIZE}`, {
    credentials: 'include'
  });
  if (!res.ok) throw new Error('Failed to load pending');
  const data = await res.json();
  const pendingDiv = document.getElementById('pendingQuestions');
  pendingDiv.innerHTML = data.questions.map(q => `
    <div class="card" style="margin-bottom: 1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>${escapeHtml(q.title)}</strong><br>
          Student budget: $${q.budget} | Student: ${escapeHtml(q.studentId.fullName)}
        </div>
        <a href="question-details.html?id=${q._id}" class="btn-sm">Details</a>
      </div>
      <div class="btn-group" style="margin-top:0.5rem;">
        <input type="number" id="bid-${q._id}" placeholder="Bid amount" min="${q.budget}" step="1" style="width:150px;">
        <button onclick="placeBid('${q._id}')" class="btn">💰 Place Bid</button>
        <button onclick="acceptQuestion('${q._id}', event)" class="btn-outline">Accept at $${q.budget}</button>
      </div>
    </div>
  `).join('');

  const paginationDiv = document.getElementById('paginationControls');
  if (paginationDiv) {
    paginationDiv.innerHTML = `
      <button onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
      <span>Page ${currentPage} of ${Math.ceil(data.total / PAGE_SIZE)}</span>
      <button onclick="changePage(1)" ${currentPage * PAGE_SIZE >= data.total ? 'disabled' : ''}>Next</button>
    `;
  }
}

window.changePage = (delta) => {
  currentPage += delta;
  if (currentPage < 1) currentPage = 1;
  loadPendingQuestions();
};

// ---------- Bid Functions (unchanged) ----------
async function placeBid(questionId) {
  const amountInput = document.getElementById(`bid-${questionId}`);
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
    // Refresh to show pending request status
    loadTutorDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function cancelAssignment(questionId) {
  // This function is only called when there is a rejected additional funds request
  const reason = prompt('Cancellation reason (student refused to add extra funds):');
  if (!reason) return;
  if (!confirm('Cancel this assignment? No penalty because student refused extra funds.')) return;
  try {
    await apiFetch(`/questions/${questionId}/cancel-assignment`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    showToast('Assignment cancelled (no penalty)', 'success');
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

loadTutorDashboard();