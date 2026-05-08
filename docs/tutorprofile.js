// tutorprofile.js – Tutor Dashboard Logic

// Helper: escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// Update user menu (name, avatar)
function updateUserMenu(user) {
  const userNameSpan = document.querySelector('.user-name');
  const userAvatarImg = document.querySelector('.user-avatar');
  if (userNameSpan) userNameSpan.innerText = user.fullName;
  if (userAvatarImg) {
    let avatarUrl = user.avatar;
    if (!avatarUrl) {
      const id = Math.floor(Math.random() * 100);
      if (user.gender === 'female') avatarUrl = `https://randomuser.me/api/portraits/women/${id}.jpg`;
      else if (user.gender === 'male') avatarUrl = `https://randomuser.me/api/portraits/men/${id}.jpg`;
      else avatarUrl = `https://randomuser.me/api/portraits/lego/${id}.jpg`;
    }
    userAvatarImg.src = avatarUrl;
  }
}

async function loadTutorDashboard() {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user || !user.id || user.role !== 'tutor') {
    window.location.href = 'login.html';
    return;
  }
  updateUserMenu(user);
  
  // Fetch fresh user data
  const freshUser = await apiFetch('/auth/me');
  document.getElementById('totalEarnings').innerText = `$${freshUser.tutorProfile?.totalEarnings?.toFixed(2) || '0.00'}`;
  document.getElementById('completedCount').innerText = freshUser.tutorProfile?.completedQuestions || 0;
  document.getElementById('tutorRating').innerText = freshUser.tutorProfile?.rating?.toFixed(1) || '0.0';
  document.getElementById('availableBalance').innerText = `$${freshUser.walletBalance?.toFixed(2) || '0.00'}`;
  
  await loadPendingQuestions();
  await loadAssignments();
}

async function loadPendingQuestions() {
  try {
    const data = await apiFetch('/questions/pending?page=1&limit=50');
    const questions = data.questions || [];
    document.getElementById('pendingCount').innerText = questions.length;
    const tbody = document.getElementById('pendingQuestions');
    tbody.innerHTML = '';
    if (questions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No available questions</td></tr>';
      return;
    }
    for (const q of questions) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(q.title)}</td>
        <td>${escapeHtml(q.subject || 'General')}</td>
        <td>$${q.budget}</td>
        <td>${q.deadline ? new Date(q.deadline).toLocaleDateString() : '—'}</td>
        <td><input type="number" id="bidAmount_${q._id}" class="bid-input" placeholder="Amount" min="${q.budget}" style="width:100px;"></td>
        <td><button class="btn-sm btn-primary-sm" onclick="placeBid('${q._id}')">Place Bid</button></td>
      `;
      tbody.appendChild(row);
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to load pending questions', 'error');
  }
}

window.placeBid = async function(questionId) {
  const amountInput = document.getElementById(`bidAmount_${questionId}`);
  const amount = parseFloat(amountInput.value);
  if (isNaN(amount) || amount <= 0) {
    showToast('Please enter a valid bid amount', 'error');
    return;
  }
  try {
    await apiFetch(`/questions/${questionId}/bid`, {
      method: 'POST',
      body: JSON.stringify({ amount, message: 'I can help!' })
    });
    showToast('Bid placed successfully!', 'success');
    amountInput.value = '';
    loadPendingQuestions(); // refresh
  } catch (err) {
    showToast(err.message, 'error');
  }
};

async function loadAssignments() {
  try {
    const assignments = await apiFetch('/questions/my-assignments');
    document.getElementById('assignmentsCount').innerText = assignments.length;
    const tbody = document.getElementById('assignmentsList');
    tbody.innerHTML = '';
    if (assignments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No assignments yet</td></tr>';
      return;
    }
    for (const a of assignments) {
      const statusText = a.status === 'assigned' ? 'In Progress' : a.status === 'completed' ? 'Completed' : a.status;
      const statusClass = a.status === 'assigned' ? 'status-progress' : a.status === 'completed' ? 'status-completed' : 'status-awaiting';
      const fundsReq = a.additionalFundsRequest;
      let fundsHtml = '-';
      if (fundsReq && fundsReq.status === 'pending') fundsHtml = `<span class="status-badge status-awaiting">Pending approval</span>`;
      else if (fundsReq && fundsReq.status === 'approved') fundsHtml = `<span class="status-badge status-completed">Approved</span>`;
      else if (fundsReq && fundsReq.status === 'rejected') fundsHtml = `<span class="status-badge" style="background:#FEE2E2;color:#B91C1C;">Rejected</span>`;
      
      let actions = '';
      if (a.status === 'assigned') {
        actions = `<button class="btn-sm" onclick="window.location.href='upload-answer.html?id=${a._id}'">Upload Answer</button>
                   ${!fundsReq || fundsReq.status !== 'pending' ? `<button class="btn-sm btn-outline-sm" onclick="requestAdditionalFunds('${a._id}')">Request Extra</button>` : ''}
                   ${fundsReq && fundsReq.status === 'rejected' ? `<button class="btn-sm btn-outline-sm" onclick="cancelAssignment('${a._id}')">Cancel</button>` : ''}`;
      } else if (a.status === 'completed') {
        actions = `<button class="btn-sm" onclick="window.location.href='answer-details.html?id=${a._id}'">View Answer</button>`;
      }
      const row = `
        <tr>
          <td>${escapeHtml(a.title)}</td>
          <td>${escapeHtml(a.studentId?.fullName || 'Unknown')}</td>
          <td>$${a.budget}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>${fundsHtml}</td>
          <td>${actions}</td>
        </tr>
      `;
      tbody.innerHTML += row;
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to load assignments', 'error');
  }
}

window.requestAdditionalFunds = async function(questionId) {
  const amount = prompt('Enter additional amount requested ($):');
  if (!amount) return;
  const reason = prompt('Reason for additional funds:');
  if (!reason) return;
  try {
    await apiFetch(`/questions/${questionId}/request-additional-funds`, {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), reason })
    });
    showToast('Request sent to student', 'success');
    loadAssignments();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.cancelAssignment = async function(questionId) {
  const reason = prompt('Reason for cancelling assignment:');
  if (!reason) return;
  try {
    await apiFetch(`/questions/${questionId}/cancel-assignment`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    showToast('Assignment cancelled', 'success');
    loadAssignments();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Document upload
document.getElementById('uploadDocForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData();
  formData.append('title', document.getElementById('docTitle').value);
  formData.append('description', document.getElementById('docDescription').value);
  formData.append('subject', document.getElementById('docSubject').value);
  formData.append('level', document.getElementById('docLevel').value);
  formData.append('type', document.getElementById('docType').value);
  formData.append('price', parseFloat(document.getElementById('docPrice').value));
  formData.append('file', document.getElementById('docFile').files[0]);
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerText = 'Uploading...';
  try {
    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    const data = await response.json();
    if (response.ok) {
      showToast('Document uploaded! Pending approval.', 'success');
      closeUploadDocModal();
      document.getElementById('uploadDocForm').reset();
    } else {
      showToast(data.error || 'Upload failed', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Upload';
  }
});

// Withdrawal request
document.getElementById('withdrawForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('withdrawAmount').value);
  const method = document.getElementById('withdrawMethod').value;
  if (isNaN(amount) || amount <= 0) {
    showToast('Invalid amount', 'error');
    return;
  }
  try {
    await apiFetch('/wallet/withdraw', {
      method: 'POST',
      body: JSON.stringify({ amount, method })
    });
    showToast('Withdrawal request submitted', 'success');
    closeWithdrawModal();
    const freshUser = await apiFetch('/auth/me');
    document.getElementById('availableBalance').innerText = `$${freshUser.walletBalance?.toFixed(2) || '0.00'}`;
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Notification badge (optional)
async function updateUnreadBadge() {
  try {
    const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
    const data = await res.json();
    const badge = document.querySelector('.notification-bell .badge');
    if (badge) badge.innerText = data.count > 9 ? '9+' : data.count;
  } catch (err) {}
}

// Initialise
document.addEventListener('DOMContentLoaded', () => {
  loadTutorDashboard();
  updateUnreadBadge();
  setInterval(updateUnreadBadge, 30000);
});

// Expose global functions used in HTML
window.placeBid = placeBid;
window.requestAdditionalFunds = requestAdditionalFunds;
window.cancelAssignment = cancelAssignment;
window.closeUploadDocModal = () => document.getElementById('uploadDocModal').style.display = 'none';
window.closeWithdrawModal = () => document.getElementById('withdrawModal').style.display = 'none';
window.closeAvatarModal = () => document.getElementById('avatarUploadModal').style.display = 'none';