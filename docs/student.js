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

// ---------- Add Funds with Stripe ----------
// ---------- Add Funds with Paystack ----------
async function addFunds() {
  const amount = prompt('Enter amount to add ($):');
  if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
    alert('Please enter a valid positive amount.');
    return;
  }
  try {
    const { url } = await apiFetch('/wallet/paystack/initialize', {
      method: 'POST',
      body: JSON.stringify({ amount: parseFloat(amount) })
    });
    // Redirect to Paystack payment page
    window.location.href = url;
  } catch (err) {
    alert('Failed to initiate payment: ' + err.message);
  }
}
// ---------- Budget Suggestion System ----------
async function checkForSuggestions(questions) {
  // Filter pending questions that have a suggestedBudget > 0
  const pendingWithSuggestion = questions.filter(q => q.status === 'pending' && q.suggestedBudget && q.suggestedBudget > 0);
  for (const q of pendingWithSuggestion) {
    const extra = q.suggestedBudget - q.budget;
    // Avoid duplicate banners
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
    // Insert at the top of the dashboard (after wallet card)
    const walletCard = document.querySelector('.card:first-of-type');
    if (walletCard && walletCard.parentNode) {
      walletCard.parentNode.insertBefore(banner, walletCard.nextSibling);
    } else {
      document.querySelector('.container').insertBefore(banner, document.querySelector('.container').firstChild);
    }
  }
}

// Make acceptSuggestion globally available for the button onclick
window.acceptSuggestion = async (questionId) => {
  try {
    const result = await apiFetch(`/questions/${questionId}/accept-suggestion`, { method: 'POST' });
    alert(`Budget increased to $${result.newBudget} and tutor assigned!`);
    location.reload(); // refresh dashboard
  } catch (err) {
    alert(err.message);
  }
};

// Poll for suggestions every 30 seconds (in case new suggestions appear)
setInterval(async () => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (user && (user.role === 'student')) {
    const questions = await apiFetch('/questions/my-questions');
    await checkForSuggestions(questions);
  }
}, 30000);

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

loadStudentDashboard();