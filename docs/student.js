// ---------- Load Student Dashboard ----------
// ---------- Load Student Dashboard ----------
// ---------- Load Student Dashboard ----------
async function loadStudentDashboard() {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user || !user.id) {
    window.location.href = 'login.html';
    return;
  }

  // Update wallet balance
  const walletEl = document.getElementById('walletBalance');
  if (walletEl) walletEl.innerText = `$${user.walletBalance?.toFixed(2) || '0.00'}`;

  const questions = await apiFetch('/questions/my-questions');
  
  const activeTable = document.getElementById('activeQuestions');
  const completedTable = document.getElementById('completedQuestions');
  if (activeTable) activeTable.innerHTML = '';
  if (completedTable) completedTable.innerHTML = '';

  let activeCount = 0;
  let completedCount = 0;

  for (const q of questions) {
    const isActive = (q.status === 'pending' || q.status === 'assigned' || q.status === 'in_progress');
    if (isActive) activeCount++;
    else if (q.status === 'completed') completedCount++;

    // Common data
    const safeTitle = escapeHtml(q.title);
    const subject = escapeHtml(q.subject || 'General');
    const budget = `$${q.budget}`;
    const tutor = q.tutorId || null;
    const tutorName = tutor ? escapeHtml(tutor.fullName) : 'Not assigned';
    const tutorRating = tutor?.tutorProfile?.rating ? tutor.tutorProfile.rating.toFixed(1) : '0.0';
    const tutorAvatar = tutor?.avatar || 'https://randomuser.me/api/portraits/lego/1.jpg';

    // Determine status badge
    let statusText = '';
    let statusClass = '';
    if (q.status === 'pending') {
      statusText = 'Awaiting Response';
      statusClass = 'status-awaiting';
    } else if (q.status === 'assigned') {
      statusText = 'Assigned';
      statusClass = 'status-progress';
    } else if (q.status === 'in_progress') {
      statusText = 'In Progress';
      statusClass = 'status-progress';
    } else if (q.status === 'overdue') {
      statusText = 'Overdue';
      statusClass = 'status-payment'; // using purple for urgent
    } else if (q.status === 'completed') {
      statusText = 'Completed';
      statusClass = 'status-completed';
    } else {
      statusText = escapeHtml(q.status);
      statusClass = 'status-awaiting';
    }

    if (isActive) {
      const tutorHtml = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <img src="${tutorAvatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
          <div>
            <div><strong>${tutorName}</strong></div>
            <div style="font-size: 0.7rem; color: #F59E0B;"><i class="fas fa-star"></i> ${tutorRating}</div>
          </div>
        </div>
      `;
      const actionBtn = `<button class="btn-sm" onclick="window.location.href='question-details.html?id=${q._id}'">View Details</button>`;
      const row = `
        <tr>
          <td><i class="fas fa-file-alt" style="margin-right: 8px; color: #005BFF;"></i> ${safeTitle}</td>
          <td>${tutorHtml}</td>
          <td>${subject}</td>
          <td>${budget}</td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
          <td>${actionBtn}</td>
        </tr>
      `;
      activeTable.innerHTML += row;
    } else if (q.status === 'completed') {
      const viewAnswerBtn = q.answerFile
        ? `<button class="btn-sm btn-outline-sm" onclick="window.location.href='answer-details.html?id=${q._id}'">View Answer</button>`
        : '<span class="disabled">No answer</span>';
      const rateBtn = `<button class="btn-sm" style="margin-left:0.5rem;" onclick="showRatingModal('${q._id}', '${tutorName}')">${q.rating && q.rating.score ? 'Change Rating' : 'Rate Tutor'}</button>`;
      const tutorHtml = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <img src="${tutorAvatar}" style="width: 32px; height: 32px; border-radius: 50%;">
          <div>
            <div><strong>${tutorName}</strong></div>
            <div style="font-size: 0.7rem; color: #F59E0B;"><i class="fas fa-star"></i> ${tutorRating}</div>
          </div>
        </div>
      `;
      const ratingStars = q.rating && q.rating.score
        ? `<span style="color: #F59E0B;">${'★'.repeat(q.rating.score)}${'☆'.repeat(5 - q.rating.score)}</span>`
        : 'Not rated';
      const row = `
        <tr>
          <td><i class="fas fa-file-alt" style="margin-right: 8px; color: #005BFF;"></i> ${safeTitle}</td>
          <td>${subject}</td>
          <td>${tutorHtml}</td>
          <td>${budget}</td>
          <td>${ratingStars}</td>
          <td>${viewAnswerBtn} ${rateBtn}</td>
        </tr>
      `;
      completedTable.innerHTML += row;
    }
  }

  // Update statistics cards
  document.getElementById('activeCount').innerText = activeCount;
  document.getElementById('completedCount').innerText = completedCount;
  document.getElementById('activeBadge').innerText = activeCount;

  const totalQuestions = activeCount + completedCount;
  const successRate = totalQuestions === 0 ? 0 : Math.round((completedCount / totalQuestions) * 100);
  document.getElementById('successRate').innerText = `${successRate}%`;

  await checkForSuggestions(questions);
  await checkForFundsRequests(questions);
}

// Make sure the rest of your student.js (rating modal, add funds, etc.) remains unchanged.

// ... (the rest of student.js remains unchanged, but ensure escapeHtml is defined)

// ---------- RATING MODAL (Reliable: stores selected value, event delegation) ----------
let currentRatingQuestionId = null;
let selectedRatingValue = 0;

window.showRatingModal = function(questionId, tutorName) {
  currentRatingQuestionId = questionId;
  selectedRatingValue = 0;
  document.getElementById('ratingModalTutorName').innerText = tutorName;
  document.getElementById('ratingModal').style.display = 'block';
  document.getElementById('ratingFeedback').value = '';
  // Reset all stars
  document.querySelectorAll('#ratingModal .star').forEach(star => star.classList.remove('selected'));
};

// Event delegation for star clicks – attached once to the modal
document.getElementById('ratingModal')?.addEventListener('click', (e) => {
  const star = e.target.closest('.star');
  if (!star) return;
  const value = parseInt(star.getAttribute('data-value'));
  selectedRatingValue = value;
  // Highlight stars up to the clicked value
  const allStars = document.querySelectorAll('#ratingModal .star');
  allStars.forEach((s, idx) => {
    if (idx < value) s.classList.add('selected');
    else s.classList.remove('selected');
  });
});

window.submitRating = async function() {
  if (selectedRatingValue === 0) {
    showToast('Select a star rating', 'error');
    return;
  }
  const feedback = document.getElementById('ratingFeedback').value;
  const score = selectedRatingValue;
  
  console.log('⭐ Submitting rating:', score, 'for question:', currentRatingQuestionId);
  
  try {
    const response = await apiFetch(`/questions/${currentRatingQuestionId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ score, feedback })
    });
    console.log('✅ Rating API response:', response);
    showToast('Rating submitted!', 'success');
    document.getElementById('ratingModal').style.display = 'none';
    loadStudentDashboard();  // refresh to update the button text
  } catch (err) {
    console.error('❌ Rating error:', err);
    showToast(err.message, 'error');
  }
};

window.closeRatingModal = function() {
  document.getElementById('ratingModal').style.display = 'none';
};

// ---------- Additional Funds Request ----------
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

// ---------- Budget Suggestion System ----------
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

// ---------- Add Funds with Paystack ----------
// ---------- Add Funds with Paystack (with returnTo support) ----------
async function addFunds(event) {
  const amount = prompt('Enter amount to add ($):');
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    showToast('Please enter a valid positive amount.', 'error');
    return;
  }
  try {
    const btn = event?.target;
    if (btn) btn.disabled = true;

    // Capture returnTo from current URL (e.g., ?returnTo=/document/sudah)
    const urlParams = new URLSearchParams(window.location.search);
    const returnTo = urlParams.get('returnTo');
    if (returnTo) {
      sessionStorage.setItem('pendingReturnTo', returnTo);
    }

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

// ---------- Handle Payment Return (called on dashboard load) ----------
async function handlePaymentReturn() {
  const urlParams = new URLSearchParams(window.location.search);
  const reference = urlParams.get('reference');
  const trxref = urlParams.get('trxref');
  const pendingReturnTo = sessionStorage.getItem('pendingReturnTo');

  if ((reference || trxref) && pendingReturnTo) {
    // Payment likely completed – wait a moment for backend webhook to process
    showToast('Payment successful! Redirecting...', 'success');
    // Clear flag
    sessionStorage.removeItem('pendingReturnTo');
    // Remove query params from URL without reload (clean)
    window.history.replaceState({}, document.title, window.location.pathname);
    // Redirect back to the document page
    setTimeout(() => {
      window.location.href = pendingReturnTo;
    }, 1500);
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

// ---------- Polling for suggestions & funds requests (every 30s) ----------
setInterval(async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (user && user.role === 'student') {
    try {
      const questions = await apiFetch('/questions/my-questions');
      await checkForSuggestions(questions);
      await checkForFundsRequests(questions);
    } catch (err) {
      console.error('Polling error:', err);
    }
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

// Start dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  loadStudentDashboard();
   handlePaymentReturn();
});