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

// ---------- Helper: format date ----------
function formatDate(date) {
  if (!date) return 'Not set';
  return new Date(date).toLocaleString();
}

// ---------- Helper: get file name from URL ----------
function getFileNameFromUrl(url) {
  if (!url) return 'file';
  const parts = url.split('/');
  const last = parts[parts.length - 1];
  return last.split('?')[0] || 'file';
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

    const dashboardLink = document.getElementById('dashboardLink');
    if (currentUser.role === 'student') dashboardLink.href = 'student-dashboard.html';
    else if (currentUser.role === 'tutor') dashboardLink.href = 'tutor-dashboard.html';
    else dashboardLink.href = 'admin-dashboard.html';

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
    if (currentUser.role === 'student' && currentQuestion && currentQuestion.status === 'pending') await loadBids();
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
    const isDemo = question.isDemo === true;

    let displaySubject, displaySchool, displayCourse, displayDeadline, displayCategory;

    if (isDemo) {
      displaySubject = (question.subject && question.subject.trim() !== '' && question.subject !== 'General')
        ? question.subject
        : 'General';
      displaySchool = (question.school && question.school.trim() !== '') ? question.school : 'GCU';
      displayCourse = (question.course && question.course.trim() !== '') ? question.course : 'Not specified';
      displayCategory = question.category || '—';
      displayDeadline = question.deadline ? formatDate(question.deadline) : formatDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000));
    } else {
      displaySubject = question.subject || 'General';
      displaySchool = question.school || 'Not specified';
      displayCourse = question.course || 'Not specified';
      displayCategory = question.category || '—';
      displayDeadline = question.deadline ? formatDate(question.deadline) : 'Not set';
    }

    let filesHtml = '';
    let answerHtml = '';

    // --- Attached files ---
    if (question.files && question.files.length > 0) {
      filesHtml = '<p><strong>Attached files:</strong></p><ul>';
      question.files.forEach((url, index) => {
        const fileName = question.fileNames && question.fileNames[index]
          ? question.fileNames[index]
          : getFileNameFromUrl(url);
        filesHtml += '<li><a href="#" onclick="downloadFile(' +
          JSON.stringify(url) + ', ' + JSON.stringify(fileName) +
          '); return false;">Download ' + escapeHtml(fileName) + '</a></li>';
      });
      filesHtml += '</ul>';
    }

    // --- Answer files ---
    if (question.answerFiles && question.answerFiles.length > 0) {
      answerHtml = '<p><strong>Answer files:</strong></p><ul>';
      question.answerFiles.forEach((url, index) => {
        const fileName = question.answerFileNames && question.answerFileNames[index]
          ? question.answerFileNames[index]
          : getFileNameFromUrl(url);
        answerHtml += '<li><a href="#" onclick="downloadFile(' +
          JSON.stringify(url) + ', ' + JSON.stringify(fileName) +
          '); return false;">Download ' + escapeHtml(fileName) + '</a></li>';
      });
      answerHtml += '</ul>';
    } else if (question.answerFile) {
      const answerUrl = question.answerFileSigned || question.answerFile;
      if (answerUrl && (answerUrl.startsWith('http://') || answerUrl.startsWith('https://'))) {
        const fileName = question.answerFileName || getFileNameFromUrl(answerUrl);
        answerHtml = '<p><strong>Answer:</strong> <a href="#" onclick="downloadFile(' +
          JSON.stringify(answerUrl) + ', ' + JSON.stringify(fileName) +
          '); return false;">Download ' + escapeHtml(fileName) + '</a></p>';
      } else if (answerUrl) {
        answerHtml = '<p><strong>Answer:</strong> <span style="color:#dc2626;">⚠️ Answer file unavailable. Please contact support.</span></p>';
      }
    }

    const html = `
      <h2>${escapeHtml(question.title)}</h2>
      <p>${escapeHtml(question.description)}</p>
      <p><strong>Budget:</strong> ${formatMoney(question.budget)} | <strong>Status:</strong> ${escapeHtml(question.status)}</p>
      <p><strong>Category:</strong> ${escapeHtml(displayCategory)} | <strong>Deadline:</strong> ${escapeHtml(displayDeadline)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(displaySubject)}</p>
      <p><strong>School:</strong> ${escapeHtml(displaySchool)} | <strong>Course:</strong> ${escapeHtml(displayCourse)}</p>
      ${filesHtml}
      ${answerHtml}
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
    if (!bids || bids.length === 0) {
      container.innerHTML = '<p>No bids yet.</p>';
      return;
    }
    container.innerHTML = bids.map(function(b) {
      return `
        <div class="bid-item" style="border:1px solid #E2E8F0; border-radius:24px; padding:1rem; margin-bottom:1rem;">
          <strong>${escapeHtml(b.tutorId.fullName)}</strong><br>
          Bid amount: <strong>${formatMoney(b.amount)}</strong><br>
          <button onclick="acceptBid('${b._id}', ${b.amount}, event)" class="btn-sm btn-primary-sm">Accept this bid</button>
        </div>
      `;
    }).join('');
    document.getElementById('bidsSection').style.display = 'block';
  } catch (err) {
    console.error('Error loading bids:', err);
  }
}

// ---------- Accept a bid ----------
window.acceptBid = async function(bidId, bidAmount, event) {
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Accepting...'; }
  if (!confirm('Accept bid $' + bidAmount + '? Your wallet will be adjusted.')) {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Accept this bid'; }
    return;
  }
  try {
    const result = await apiFetch(`/questions/${questionId}/accept-bid/${bidId}`, { method: 'POST' });
    showToast('Bid accepted! New budget $' + result.newBudget, 'success');
    window.location.href = 'student-dashboard.html?walletUpdated=true';
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Accept this bid'; }
  }
};

// ---------- Special actions ----------
function checkSpecialActions() {
  const tutorActionsDiv = document.getElementById('tutorActions');
  const fundsRequestDiv = document.getElementById('fundsRequestCard');

  if (!currentQuestion) return;

  if (currentUser.role === 'tutor' && currentQuestion.tutorId && currentQuestion.tutorId._id === currentUser.id && currentQuestion.status === 'assigned') {
    if (tutorActionsDiv) {
      tutorActionsDiv.style.display = 'block';
      document.getElementById('requestFundsBtn').onclick = function() { requestAdditionalFunds(); };
      document.getElementById('cancelAssignmentBtn').onclick = function() { cancelAssignment(); };
    }
  } else if (tutorActionsDiv) {
    tutorActionsDiv.style.display = 'none';
  }

  if (currentUser.role === 'student' && currentQuestion.additionalFundsRequest && currentQuestion.additionalFundsRequest.status === 'pending') {
    if (fundsRequestDiv) {
      const req = currentQuestion.additionalFundsRequest;
      document.getElementById('fundsRequestDetails').innerHTML = 'Tutor requests <strong>$' + req.amount + '</strong> extra.<br>Reason: ' + escapeHtml(req.reason);
      fundsRequestDiv.style.display = 'block';
      document.getElementById('approveFundsBtn').onclick = function() { respondToFundsRequest(true); };
      document.getElementById('rejectFundsBtn').onclick = function() { respondToFundsRequest(false); };
    }
  } else if (fundsRequestDiv) {
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
      body: JSON.stringify({ amount: parseFloat(amount), reason: reason })
    });
    showToast('Request sent to student', 'success');
    location.reload();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function cancelAssignment() {
  const reason = prompt('Why are you cancelling? (No penalty)');
  if (!reason) return;
  if (!confirm('Cancel this assignment? You will not be penalized.')) return;
  try {
    await apiFetch(`/questions/${questionId}/cancel-assignment`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason })
    });
    showToast('Assignment cancelled', 'success');
    location.reload();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function respondToFundsRequest(accept) {
  try {
    await apiFetch(`/questions/${questionId}/respond-funds-request`, {
      method: 'POST',
      body: JSON.stringify({ accept: accept })
    });
    showToast(accept ? 'Additional funds added' : 'Request rejected', 'success');
    window.location.href = 'student-dashboard.html?walletUpdated=true';
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------- Comments ----------
async function loadComments() {
  try {
    const comments = await apiFetch(`/comments/question/${questionId}`);
    const container = document.getElementById('commentsList');
    if (!comments || comments.length === 0) {
      container.innerHTML = '<p>No comments yet.</p>';
      return;
    }
    const currentUserId = currentUser ? currentUser.id : null;
    container.innerHTML = comments.map(function(c) {
      let fileLink = '';
      if (c.fileUrl) {
        const fileName = c.fileName || getFileNameFromUrl(c.fileUrl);
        fileLink = '<p><a href="#" onclick="downloadFile(' +
          JSON.stringify(c.fileUrl) + ', ' + JSON.stringify(fileName) +
          '); return false;">📎 Download attached file</a></p>';
      }
      return `
        <div class="comment-item">
          <strong>${escapeHtml(c.userName)} (${escapeHtml(c.userRole)})</strong> <small>${new Date(c.createdAt).toLocaleString()}</small>
          <p>${escapeHtml(c.text)}</p>
          ${fileLink}
          ${(c.userId === currentUserId || (currentUser && currentUser.role === 'admin')) ?
            '<button onclick="deleteComment(\'' + c._id + '\')" class="btn-outline-sm" style="font-size:0.7rem;">Delete</button>' :
            ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading comments:', err);
  }
}

window.deleteComment = async function(commentId) {
  if (confirm('Delete this comment?')) {
    try {
      await apiFetch(`/comments/${commentId}`, { method: 'DELETE' });
      loadComments();
    } catch (err) {
      alert(err.message);
    }
  }
};

// ---------- Post comment ----------
document.getElementById('postCommentBtn')?.addEventListener('click', async function() {
  const text = document.getElementById('commentText').value;
  const file = document.getElementById('commentFile').files[0];
  if (!text.trim() && !file) return alert('Enter a comment or attach a file.');

  const formData = new FormData();
  formData.append('questionId', questionId);
  if (text.trim()) formData.append('text', text);
  if (file) formData.append('file', file);

  let retried = false;

  const attempt = async function() {
    try {
      const res = await fetch(`${window.API_BASE}/comments`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (res.status === 401 && !retried) {
        retried = true;
        const refreshRes = await fetch(`${window.API_BASE}/auth/refresh-token`, {
          method: 'POST',
          credentials: 'include'
        });
        if (refreshRes.ok) {
          return attempt();
        } else {
          alert('Session expired. Please log in again.');
          window.location.href = 'login.html';
          return;
        }
      }

      if (res.ok) {
        document.getElementById('commentText').value = '';
        document.getElementById('commentFile').value = '';
        loadComments();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  attempt();
});

// ---------- Start ----------
loadPage();