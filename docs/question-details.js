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

// ---------- Helper: format money ----------
function formatMoney(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

// ---------- DOM elements ----------
const urlParams = new URLSearchParams(window.location.search);
const questionId = urlParams.get('id');
let currentUser = null;
let currentQuestion = null;

if (!questionId) {
  alert('No question specified');
  window.location.href = '/';
}

// ---------- Load page ----------
async function loadPage() {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      window.location.href = 'login.html';
      return;
    }
    currentUser = JSON.parse(userStr);
    
    // Set dashboard link based on role
    const dashboardLink = document.getElementById('dashboardLink');
    if (currentUser.role === 'student') dashboardLink.href = 'student-dashboard.html';
    else if (currentUser.role === 'tutor') dashboardLink.href = 'tutor-dashboard.html';
    else dashboardLink.href = 'admin-dashboard.html';
    
    // Update user menu
    document.getElementById('userName').innerText = currentUser.fullName;
    if (currentUser.avatar) document.getElementById('userAvatar').src = currentUser.avatar;
    else {
      const id = Math.floor(Math.random() * 100);
      let avatarUrl = `https://randomuser.me/api/portraits/lego/${id}.jpg`;
      if (currentUser.gender === 'female') avatarUrl = `https://randomuser.me/api/portraits/women/${id}.jpg`;
      else if (currentUser.gender === 'male') avatarUrl = `https://randomuser.me/api/portraits/men/${id}.jpg`;
      document.getElementById('userAvatar').src = avatarUrl;
    }
    
    await loadQuestion();
    if (currentUser.role === 'student' && currentQuestion.status === 'pending') await loadBids();
    await loadComments();
    checkSpecialActions();
  } catch (err) {
    console.error(err);
    document.getElementById('questionDetails').innerHTML = '<p class="error">Failed to load question details.</p>';
  }
}

// ---------- Load question details ----------
async function loadQuestion() {
  try {
    const question = await apiFetch(`/questions/${questionId}`);
    currentQuestion = question;
    let filesHtml = '', answerHtml = '';
    if (question.files?.length) {
      filesHtml = '<p><strong>Attached files:</strong></p><ul>';
      question.files.forEach(url => filesHtml += `<li><a href="${escapeHtml(url)}" target="_blank">Download</a></li>`);
      filesHtml += '</ul>';
    }
    if (question.answerFile) {
      answerHtml = `<p><strong>Answer:</strong> <a href="${escapeHtml(question.answerFile)}" target="_blank">Download answer (${escapeHtml(question.answerFileName || 'file')})</a></p>`;
    }
    const html = `
      <h2>${escapeHtml(question.title)}</h2>
      <p>${escapeHtml(question.description)}</p>
      <p><strong>Budget:</strong> ${formatMoney(question.budget)} | <strong>Status:</strong> ${escapeHtml(question.status)}</p>
      <p><strong>Category:</strong> ${escapeHtml(question.category)} | <strong>Deadline:</strong> ${question.deadline ? new Date(question.deadline).toLocaleString() : 'Not set'}</p>
      <p><strong>School:</strong> ${escapeHtml(question.school || 'Not specified')} | <strong>Course:</strong> ${escapeHtml(question.course || 'Not specified')}</p>
      ${filesHtml} ${answerHtml}
    `;
    document.getElementById('questionDetails').innerHTML = html;
  } catch (err) {
    console.error(err);
    document.getElementById('questionDetails').innerHTML = '<p class="error">Error loading question</p>';
  }
}

// ---------- Load bids (student only) ----------
async function loadBids() {
  try {
    const bids = await apiFetch(`/questions/${questionId}/bids`);
    const container = document.getElementById('bidsList');
    if (!bids.length) {
      container.innerHTML = '<p>No bids yet.</p>';
    } else {
      container.innerHTML = bids.map(b => `
        <div class="bid-item" style="border:1px solid #E2E8F0; border-radius:24px; padding:1rem; margin-bottom:1rem;">
          <strong>${escapeHtml(b.tutorId.fullName)}</strong><br>
          Bid amount: <strong>${formatMoney(b.amount)}</strong><br>
          <button onclick="acceptBid('${b._id}', ${b.amount}, event)" class="btn-sm btn-primary-sm">Accept this bid</button>
        </div>
      `).join('');
    }
    document.getElementById('bidsSection').style.display = 'block';
  } catch (err) { console.error(err); }
}

window.acceptBid = async (bidId, bidAmount, event) => {
  const btn = event.target;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Accepting...'; }
  if (!confirm(`Accept bid $${bidAmount}? Your wallet will be adjusted.`)) {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Accept this bid'; }
    return;
  }
  try {
    const result = await apiFetch(`/questions/${questionId}/accept-bid/${bidId}`, { method: 'POST' });
    showToast(`Bid accepted! New budget $${result.newBudget}`, 'success');
    location.reload();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Accept this bid'; }
  }
};

// ---------- Tutor actions (additional funds & cancel) ----------
function checkSpecialActions() {
  const tutorActionsDiv = document.getElementById('tutorActions');
  const fundsRequestDiv = document.getElementById('fundsRequestCard');
  if (currentUser.role === 'tutor' && currentQuestion.tutorId && currentQuestion.tutorId._id === currentUser.id && currentQuestion.status === 'assigned') {
    tutorActionsDiv.style.display = 'block';
    document.getElementById('requestFundsBtn').onclick = () => requestAdditionalFunds();
    document.getElementById('cancelAssignmentBtn').onclick = () => cancelAssignment();
  } else {
    tutorActionsDiv.style.display = 'none';
  }
  
  // Student: show pending funds request
  if (currentUser.role === 'student' && currentQuestion.additionalFundsRequest && currentQuestion.additionalFundsRequest.status === 'pending') {
    const req = currentQuestion.additionalFundsRequest;
    document.getElementById('fundsRequestDetails').innerHTML = `Tutor requests <strong>$${req.amount}</strong> extra.<br>Reason: ${escapeHtml(req.reason)}`;
    fundsRequestDiv.style.display = 'block';
    document.getElementById('approveFundsBtn').onclick = () => respondToFundsRequest(true);
    document.getElementById('rejectFundsBtn').onclick = () => respondToFundsRequest(false);
  } else {
    fundsRequestDiv.style.display = 'none';
  }
}

async function requestAdditionalFunds() {
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
    location.reload();
  } catch (err) { showToast(err.message, 'error'); }
}

async function cancelAssignment() {
  const reason = prompt('Why are you cancelling? (No penalty)');
  if (!reason) return;
  if (!confirm('Cancel this assignment? You will not be penalized.')) return;
  try {
    await apiFetch(`/questions/${questionId}/cancel-assignment`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    showToast('Assignment cancelled', 'success');
    location.reload();
  } catch (err) { showToast(err.message, 'error'); }
}

async function respondToFundsRequest(accept) {
  try {
    await apiFetch(`/questions/${questionId}/respond-funds-request`, {
      method: 'POST',
      body: JSON.stringify({ accept })
    });
    showToast(accept ? 'Additional funds added' : 'Request rejected', 'success');
    location.reload();
  } catch (err) { showToast(err.message, 'error'); }
}

// ---------- Comments ----------
async function loadComments() {
  try {
    const comments = await apiFetch(`/comments/question/${questionId}`);
    const container = document.getElementById('commentsList');
    if (!comments.length) {
      container.innerHTML = '<p>No comments yet.</p>';
      return;
    }
    const currentUserId = currentUser.id;
    container.innerHTML = comments.map(c => `
      <div class="comment-item">
        <strong>${escapeHtml(c.userName)} (${escapeHtml(c.userRole)})</strong> <small>${new Date(c.createdAt).toLocaleString()}</small>
        <p>${escapeHtml(c.text)}</p>
        ${c.fileUrl ? `<p><a href="${escapeHtml(c.fileUrl)}" target="_blank">📎 Download attached file</a></p>` : ''}
        ${(c.userId === currentUserId || currentUser.role === 'admin') ? `<button onclick="deleteComment('${c._id}')" class="btn-outline-sm" style="font-size:0.7rem;">Delete</button>` : ''}
      </div>
    `).join('');
  } catch (err) { console.error(err); }
}

window.deleteComment = async (commentId) => {
  if (confirm('Delete this comment?')) {
    try {
      await apiFetch(`/comments/${commentId}`, { method: 'DELETE' });
      loadComments();
    } catch (err) { alert(err.message); }
  }
};

document.getElementById('postCommentBtn').addEventListener('click', async () => {
  const text = document.getElementById('commentText').value;
  const file = document.getElementById('commentFile').files[0];
  if (!text.trim() && !file) return alert('Enter a comment or attach a file.');
  const formData = new FormData();
  formData.append('questionId', questionId);
  if (text.trim()) formData.append('text', text);
  if (file) formData.append('file', file);
  try {
    const res = await fetch(`${window.API_BASE}/comments`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    if (res.ok) {
      document.getElementById('commentText').value = '';
      document.getElementById('commentFile').value = '';
      loadComments();
    } else { const data = await res.json(); alert(data.error); }
  } catch (err) { alert(err.message); }
});

// ---------- Start ----------
loadPage();