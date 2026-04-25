// ---------- Load Student Dashboard ----------
async function loadStudentDashboard() {
  const user = JSON.parse(localStorage.getItem('user'));
  document.getElementById('walletBalance').innerText = `$${user.walletBalance}`;
  const questions = await apiFetch('/questions/my-questions');
  const activeTable = document.getElementById('activeQuestions');
  const completedTable = document.getElementById('completedQuestions');
  activeTable.innerHTML = '';
  completedTable.innerHTML = '';
  questions.forEach(q => {
    const titleLink = `<a href="question-details.html?id=${q._id}">${escapeHtml(q.title)}</a>`;
    const row = `<tr>
      <td>${titleLink}</td>
      <td>${escapeHtml(q.tutorId?.fullName || 'None')}</td>
      <td>${escapeHtml(q.status)}</td>
      <td>$${q.budget}</td>
    </tr>`;
    if (q.status === 'pending' || q.status === 'assigned') {
      activeTable.innerHTML += row;
    } else {
      completedTable.innerHTML += row;
    }
  });

  // Check for budget suggestions (after table is loaded)
  await checkForSuggestions(questions);
}

// ---------- Add Funds with Paystack ----------
async function addFunds() {
  const amount = prompt('Enter amount to add ($):');
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    showToast('Please enter a valid positive amount.', 'error');
    return;
  }
  try {
    const btn = event?.target;
    if (btn) showSpinner(btn);
    const { url } = await apiFetch('/wallet/paystack/initialize', {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount) })
    });
    window.location.href = url;
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) hideSpinner(btn);
  }
}

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

// ---------- Transaction History ----------
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

// Replace the old showTransactionHistory:
window.showTransactionHistory = async function() {
  await loadTransactionHistory(true);
  document.getElementById('transactionModal').style.display = 'block';
};

// Event listener for "Load More" (add in DOMContentLoaded or after modal creation)
document.getElementById('loadMoreTransactions')?.addEventListener('click', () => loadTransactionHistory(false));
window.closeTransactionModal = function() {
  const modal = document.getElementById('transactionModal');
  if (modal) modal.style.display = 'none';
};

// ---------- Poll for suggestions every 30 seconds ----------
setInterval(async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (user && user.role === 'student') {
    const questions = await apiFetch('/questions/my-questions');
    await checkForSuggestions(questions);
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