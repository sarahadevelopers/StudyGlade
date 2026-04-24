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

// Helper for file uploads (since apiFetch expects JSON)
async function uploadFile(endpoint, file) {
  const formData = new FormData();
  formData.append('answer', file);
  const res = await fetch(`${window.API_BASE}${endpoint}`, {
    method: 'POST',
    credentials: 'include',   // sends cookie
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

  // Pending questions (with bid input)
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
        <button onclick="acceptQuestion('${q._id}')" class="btn btn-outline">Accept at $${q.budget}</button>
      </div>
    </div>
  `).join('');

  // My assignments – includes answer upload and download
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
          <button onclick="uploadAnswer('${q._id}')" class="btn">Upload Answer</button>
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
    alert('Please enter a valid bid amount (minimum $1)');
    return;
  }
  try {
    await apiFetch(`/questions/${questionId}/bid`, {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount), message: 'Bid placed from dashboard' })
    });
    alert('Bid placed successfully!');
    amountInput.value = '';
    loadTutorDashboard();
  } catch (err) {
    alert(err.message);
  }
}

async function acceptQuestion(id) {
  try {
    await apiFetch(`/questions/${id}/accept`, { method: 'PUT' });
    alert('Question accepted!');
    loadTutorDashboard();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Answer Upload ----------
async function uploadAnswer(questionId) {
  const fileInput = document.getElementById(`answer-${questionId}`);
  const file = fileInput.files[0];
  if (!file) return alert('Please select a file');
  try {
    await uploadFile(`/questions/${questionId}/upload-answer`, file);
    alert('Answer uploaded successfully!');
    loadTutorDashboard();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Complete Question ----------
async function completeQuestion(id) {
  try {
    await apiFetch(`/questions/${id}/complete`, { method: 'PUT' });
    alert('Question marked as complete! Payment processed.');
    loadTutorDashboard();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- Withdraw ----------
async function withdrawFunds() {
  const amount = prompt('Withdraw amount (USD):');
  if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
    try {
      await apiFetch('/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount: parseFloat(amount), method: 'paypal' })
      });
      alert('Withdrawal request submitted. Funds will be sent within 3‑5 business days.');
      location.reload();
    } catch (err) {
      alert(err.message);
    }
  } else {
    alert('Invalid amount');
  }
}

// Make functions globally available for inline onclick handlers
window.placeBid = placeBid;
window.acceptQuestion = acceptQuestion;
window.uploadAnswer = uploadAnswer;
window.completeQuestion = completeQuestion;
window.withdrawFunds = withdrawFunds;

// Load dashboard
loadTutorDashboard();