// ---------- Load Student Dashboard ----------
async function loadStudentDashboard() {
  const user = JSON.parse(localStorage.getItem('user'));
  document.getElementById('walletBalance').innerText = `$${user.walletBalance}`;
  const questions = await apiFetch('/questions/my-questions');
  const activeTable = document.getElementById('activeQuestions');
  const completedTable = document.getElementById('completedQuestions');
  activeTable.innerHTML = '';
  completedTable.innerHTML = '';

  for (const q of questions) {
    const safeTitle = escapeHtml(q.title);
    const safeTutor = escapeHtml(q.tutorId?.fullName || 'None');
    const safeStatus = escapeHtml(q.status);
    const budget = `$${q.budget}`;

    if (q.status === 'pending' || q.status === 'assigned') {
      const viewBtn = `<button class="btn-outline btn-sm" onclick="window.location.href='question-details.html?id=${q._id}'">View Question</button>`;
      const row = `<tr><td>${safeTitle}</td><td>${safeTutor}</td><td>${safeStatus}</td><td>${budget}</td><td>${viewBtn}</td></tr>`;
      activeTable.innerHTML += row;
    } else if (q.status === 'completed') {
      let viewAnswerBtn = q.answerFile ? `<button class="btn-outline btn-sm" onclick="window.location.href='answer-details.html?id=${q._id}'">View Answer</button>` : '<span class="disabled">No answer</span>';
      let rateBtn = '';
      if (!q.rating || !q.rating.score) {
        rateBtn = `<button class="btn-sm" style="margin-left:0.5rem;" onclick="showRatingModal('${q._id}', '${escapeHtml(q.tutorId?.fullName)}')">Rate Tutor</button>`;
      }
      const row = `<tr><td>${safeTitle}</td><td>${safeTutor}${rateBtn}</td><td>${safeStatus}</td><td>${budget}</td><td>${viewAnswerBtn}</td></tr>`;
      completedTable.innerHTML += row;
    }
  }

  await checkForSuggestions(questions);
  await checkForFundsRequests(questions);
}

// ---------- RATING MODAL (NEW) ----------
let currentRatingQuestionId = null;

window.showRatingModal = function(questionId, tutorName) {
  currentRatingQuestionId = questionId;
  document.getElementById('ratingModalTutorName').innerText = tutorName;
  document.getElementById('ratingModal').style.display = 'block';
  document.getElementById('ratingFeedback').value = '';
  document.querySelectorAll('.star').forEach(star => star.classList.remove('selected'));
};

window.submitRating = async function() {
  const selectedStar = document.querySelector('.star.selected');
  if (!selectedStar) { showToast('Select a star rating', 'error'); return; }
  const score = parseInt(selectedStar.dataset.value);
  const feedback = document.getElementById('ratingFeedback').value;
  try {
    await apiFetch(`/questions/${currentRatingQuestionId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ score, feedback })
    });
    showToast('Thank you for rating!', 'success');
    document.getElementById('ratingModal').style.display = 'none';
    loadStudentDashboard(); // refresh to remove rate button
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Star selection (attach after modal opens)
document.addEventListener('DOMContentLoaded', () => {
  const starContainer = document.querySelector('#ratingModal .star');
  if (starContainer) {
    document.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', function() {
        const val = this.dataset.value;
        document.querySelectorAll('.star').forEach(s => s.classList.remove('selected'));
        for (let i = 1; i <= val; i++) {
          document.querySelector(`.star[data-value='${i}']`).classList.add('selected');
        }
      });
    });
  }
});

// ---------- RESPOND TO ADDITIONAL FUNDS REQUEST (NEW) ----------
async function checkForFundsRequests(questions) {
  for (const q of questions) {
    if (q.additionalFundsRequest && q.additionalFundsRequest.status === 'pending') {
      if (document.getElementById(`funds-banner-${q._id}`)) continue;
      const banner = document.createElement('div');
      banner.id = `funds-banner-${q._id}`;
      banner.className = 'card';
      banner.style.backgroundColor = '#fff3cd';
      banner.style.borderLeft = '4px solid #ffc107';
      banner.style.marginBottom = '1rem';
      banner.innerHTML = `
        <strong>💰 Additional funds request for "${escapeHtml(q.title)}"</strong><br>
        Tutor requests <strong>$${q.additionalFundsRequest.amount}</strong> extra.<br>
        Reason: ${escapeHtml(q.additionalFundsRequest.reason)}<br>
        <button onclick="respondToFunds('${q._id}', true)" class="btn">✅ Approve & Pay</button>
        <button onclick="respondToFunds('${q._id}', false)" class="btn-outline">❌ Reject</button>
      `;
      const container = document.querySelector('.container');
      container.insertBefore(banner, container.firstChild);
    }
  }
}

window.respondToFunds = async function(questionId, accept) {
  try {
    await apiFetch(`/questions/${questionId}/respond-funds-request`, {
      method: 'POST',
      body: JSON.stringify({ accept })
    });
    showToast(accept ? 'Additional funds added' : 'Request rejected', 'success');
    location.reload();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ---------- Budget Suggestion System (unchanged from your original) ----------
async function checkForSuggestions(questions) {
  const pendingWithSuggestion = questions.filter(q => q.status === 'pending' && q.suggestedBudget && q.suggestedBudget > 0);
  for (const q of pendingWithSuggestion) {
    const extra = q.suggestedBudget - q.budget;
    if (document.getElementById(`suggestion-${q._id}`)) continue;
    const banner = document.createElement('div');
    banner.id = `suggestion-${q._id}`;
    banner.className = 'card suggestion-banner';
    banner.style.backgroundColor = '#fff3cd';
    banner.style.borderLeft = '4px solid #ffc107';
    banner.style.marginBottom = '1rem';
    banner.innerHTML = `
      <strong>💡 Budget suggestion for "${escapeHtml(q.title)}"</strong><br>
      The lowest tutor bid is $${q.suggestedBudget}. Add $${extra} to assign this tutor now.
      <button onclick="acceptSuggestion('${q._id}')" class="btn" style="margin-left: 1rem;">Add $${extra} & Assign</button>
    `;
    const walletCard = document.querySelector('.card:first-of-type');
    if (walletCard && walletCard.parentNode) {
      walletCard.parentNode.insertBefore(banner, walletCard.nextSibling);
    } else {
      document.querySelector('.container').insertBefore(banner, document.querySelector('.container').firstChild);
    }
  }
}

window.acceptSuggestion = async (questionId) => {
  try {
    const result = await apiFetch(`/questions/${questionId}/accept-suggestion`, { method: 'POST' });
    showToast(`Budget increased to $${result.newBudget} and tutor assigned!`, 'success');
    location.reload();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ---------- Add Funds with Paystack (unchanged) ----------
async function addFunds(event) {
  const amount = prompt('Enter amount to add ($):');
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    showToast('Please enter a valid positive amount.', 'error');
    return;
  }
  try {
    const btn = event?.target;
    if (btn) btn.disabled = true;
    const { url } = await apiFetch('/wallet/paystack/initialize', {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount) })
    });
    window.location.href = url;
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

// ---------- Transaction History (pagination) ----------
let transactionPage = 1;
let transactionHasMore = true;

async function loadTransactionHistory(reset = true) {
  if (reset) {
    transactionPage = 1;
    transactionHasMore = true;
    document.getElementById('transactionList').innerHTML = '';
  }
  if (!transactionHasMore) return;
  try {
    const data = await apiFetch(`/wallet?page=${transactionPage}&limit=10`);
    const list = document.getElementById('transactionList');
    if (!data.transactions || data.transactions.length === 0) {
      if (transactionPage === 1) list.innerHTML = '<p>No transactions yet.</p>';
      transactionHasMore = false;
      return;
    }
    const html = data.transactions.map(t => `
      <li style="border-bottom:1px solid #eee; padding:0.5rem 0;">
        <strong>${t.type}</strong> - $${Math.abs(t.amount)}<br>
        <small>${t.description} (${new Date(t.createdAt).toLocaleString()})</small>
      </li>
    `).join('');
    if (reset) list.innerHTML = `<ul style="list-style:none; padding-left:0;">${html}</ul>`;
    else list.innerHTML += html;
    transactionHasMore = transactionPage < data.pagination.pages;
    transactionPage++;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.showTransactionHistory = async function() {
  await loadTransactionHistory(true);
  document.getElementById('transactionModal').style.display = 'block';
};
window.closeTransactionModal = function() {
  document.getElementById('transactionModal').style.display = 'none';
};
document.getElementById('loadMoreTransactions')?.addEventListener('click', () => loadTransactionHistory(false));

// ---------- Poll for suggestions & funds requests every 30 seconds ----------
setInterval(async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (user && user.role === 'student') {
    const questions = await apiFetch('/questions/my-questions');
    await checkForSuggestions(questions);
    await checkForFundsRequests(questions);
  }
}, 30000);

// Helper: prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// Start dashboard
loadStudentDashboard();