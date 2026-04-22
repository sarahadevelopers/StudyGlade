async function loadTutorDashboard() {
  const user = JSON.parse(localStorage.getItem('user'));
  document.getElementById('walletBalance').innerText = `$${user.walletBalance}`;
  
  // pending questions
  const pending = await apiFetch('/questions/pending');
  const pendingDiv = document.getElementById('pendingQuestions');
  pendingDiv.innerHTML = pending.map(q => `
    <div class="card" style="margin-bottom:0.5rem">
      <strong><a href="question-details.html?id=${q._id}">${escapeHtml(q.title)}</a></strong> - $${q.budget} - Student: ${escapeHtml(q.studentId.fullName)}
      <button onclick="acceptQuestion('${q._id}')" class="btn">Accept</button>
    </div>
  `).join('');
  
  // my assignments
  const assignments = await apiFetch('/questions/my-assignments');
  const assignDiv = document.getElementById('myAssignments');
  assignDiv.innerHTML = assignments.map(q => `
    <div class="card">
      <strong><a href="question-details.html?id=${q._id}">${escapeHtml(q.title)}</a></strong> - Status: ${escapeHtml(q.status)}
      ${q.status === 'assigned' ? `<button onclick="completeQuestion('${q._id}')" class="btn">Mark Complete</button>` : ''}
    </div>
  `).join('');
}

async function acceptQuestion(id) {
  await apiFetch(`/questions/${id}/accept`, { method: 'PUT' });
  loadTutorDashboard();
}

async function completeQuestion(id) {
  await apiFetch(`/questions/${id}/complete`, { method: 'PUT' });
  loadTutorDashboard();
}

async function withdrawFunds() {
  const amount = prompt('Withdraw amount:');
  if (amount) {
    await apiFetch('/wallet/withdraw', { method: 'POST', body: JSON.stringify({ amount: parseFloat(amount), method: 'paypal' }) });
    alert('Withdrawal request submitted.');
    location.reload();
  }
}

// Helper function to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

loadTutorDashboard();