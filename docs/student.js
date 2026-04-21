async function loadStudentDashboard() {
  const user = JSON.parse(localStorage.getItem('user'));
  document.getElementById('walletBalance').innerText = `$${user.walletBalance}`;
  const questions = await apiFetch('/questions/my-questions');
  const activeTable = document.getElementById('activeQuestions');
  const completedTable = document.getElementById('completedQuestions');
  activeTable.innerHTML = '';
  completedTable.innerHTML = '';
  questions.forEach(q => {
    const row = `<tr><td>${q.title}</td><td>${q.tutorId?.fullName || 'None'}</td><td>${q.status}</td><td>$${q.budget}</td></tr>`;
    if (q.status === 'pending' || q.status === 'assigned') activeTable.innerHTML += row;
    else completedTable.innerHTML += row;
  });
}

async function addFunds() {
  const amount = prompt('Enter amount to add ($):');
  if (amount && !isNaN(amount)) {
    await apiFetch('/wallet/add-funds', { method: 'POST', body: JSON.stringify({ amount: parseFloat(amount) }) });
    const user = JSON.parse(localStorage.getItem('user'));
    user.walletBalance += parseFloat(amount);
    localStorage.setItem('user', JSON.stringify(user));
    loadStudentDashboard();
  }
}

loadStudentDashboard();