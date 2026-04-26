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

// ---------- Dashboard Load ----------
async function loadTutorDashboard() {
  const user = JSON.parse(localStorage.getItem('user'));
  document.getElementById('walletBalance').innerText = `$${user.walletBalance}`;

  const pending = await apiFetch('/questions/pending');
  const pendingDiv = document.getElementById('pendingQuestions');
  pendingDiv.innerHTML = pending.map(q => `
    <div class="card" style="margin-bottom: 1rem;">
      <strong><a href="question-details.html?id=${q._id}">${escapeHtml(q.title)}</a></strong><br>
      Student budget: $${q.budget} &nbsp;|&nbsp;
      Student: ${escapeHtml(q.studentId.fullName)}
      <div style="margin-top: 0.5rem;">
        <input type="number" id="bid-${q._id}" placeholder="Your bid amount" min="1" step="1" style="width: 150px;">
        <button onclick="placeBid('${q._id}')" class="btn">Place Bid</button>
        <!-- pass event to acceptQuestion -->
        <button onclick="acceptQuestion('${q._id}', event)" class="btn btn-outline">Accept at $${q.budget}</button>
      </div>
    </div>
  `).join('');

  const assignments = await apiFetch('/questions/my-assignments');
  const assignDiv = document.getElementById('myAssignments');
  assignDiv.innerHTML = assignments.map(q => `
    <div class="card" style="margin-bottom: 1rem;">
      <strong><a href="question-details.html?id=${q._id}">${escapeHtml(q.title)}</a></strong><br>
      Status: ${escapeHtml(q.status)} &nbsp;|&nbsp;
      Student: ${escapeHtml(q.studentId.fullName)} &nbsp;|&nbsp;
      Budget: $${q.budget}
      ${q.status === 'assigned' ? `
        <div style="margin-top: 0.5rem;">
          <input type="file" id="answer-${q._id}" accept=".pdf,.doc,.docx,.zip,.jpg,.png,.txt">
          <!-- pass event to uploadAnswer -->
          <button onclick="uploadAnswer('${q._id}', event)" class="btn">Upload Answer</button>
          ${q.answerFile ? `<a href="${q.answerFile}" target="_blank" style="margin-left: 0.5rem;">Download current answer</a>` : ''}
          <button onclick="completeQuestion('${q._id}')" class="btn btn-outline" style="margin-left: 0.5rem;">Mark Complete</button>
        </div>
      ` : ''}
      ${q.status === 'completed' && q.answerFile ? `<div style="margin-top: 0.5rem;"><a href="${q.answerFile}" target="_blank">📎 Download Answer</a></div>` : ''}
    </div>
  `).join('');
}

// ---------- Bid Functions ----------
async function placeBid(questionId) {
  const amountInput = document.getElementById(`bid-${questionId}`);
  const amount = amountInput.value;
  if (!amount || amount <= 0) {
    showToast('Please enter a valid bid amount (minimum $1)', 'error');
    return;
  }
  try {
    await apiFetch(`/questions/${questionId}/bid`, {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), message: 'Bid placed from dashboard' })
    });
    showToast('Bid placed successfully!', 'success');
    amountInput.value = '';
    loadTutorDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Updated acceptQuestion with button disabling and spinner
async function acceptQuestion(questionId, event) {
  const btn = event?.target;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Accepting...';
  }
  try {
    await apiFetch(`/questions/${questionId}/accept`, { method: 'PUT' });
    showToast('Question accepted!', 'success');
    loadTutorDashboard();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `Accept at student's budget`;
    }
  }
}

// Updated uploadAnswer with button disabling and spinner
async function uploadAnswer(questionId, event) {
  const fileInput = document.getElementById(`answer-${questionId}`);
  const btn = event?.target;
  const file = fileInput.files[0];
  if (!file) {
    showToast('Please select a file', 'error');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Uploading...';
  }
  try {
    await uploadFile(`/questions/${questionId}/upload-answer`, file);
    showToast('Answer uploaded successfully!', 'success');
    loadTutorDashboard();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Upload Answer';
    }
  }
}

async function completeQuestion(id) {
  try {
    await apiFetch(`/questions/${id}/complete`, { method: 'PUT' });
    showToast('Question marked as complete! Payment processed.', 'success');
    loadTutorDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function withdrawFunds() {
  const amount = prompt('Withdraw amount (USD):');
  if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
    try {
      await apiFetch('/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount: parseFloat(amount), method: 'paypal' })
      });
      showToast('Withdrawal request submitted. Funds will be sent within 3‑5 business days.', 'success');
      location.reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  } else {
    showToast('Invalid amount', 'error');
  }
}

window.placeBid = placeBid;
window.acceptQuestion = acceptQuestion;
window.uploadAnswer = uploadAnswer;
window.completeQuestion = completeQuestion;
window.withdrawFunds = withdrawFunds;

loadTutorDashboard();