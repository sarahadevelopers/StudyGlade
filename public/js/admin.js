async function loadAdminDashboard() {
  const analytics = await apiFetch('/admin/analytics');
  document.getElementById('analytics').innerText = JSON.stringify(analytics, null, 2);
  const users = await apiFetch('/admin/users');
  const pendingTutors = users.filter(u => u.role === 'tutor' && !u.isApproved);
  document.getElementById('pendingTutors').innerHTML = pendingTutors.map(t => `
    <div class="card">
      ${t.fullName} (${t.email})
      <button onclick="approveTutor('${t._id}', true)" class="btn">Approve</button>
      <button onclick="approveTutor('${t._id}', false)" class="btn btn-outline">Reject</button>
    </div>
  `).join('');
  document.getElementById('allUsers').innerHTML = `<pre>${JSON.stringify(users, null, 2)}</pre>`;
  const docs = await apiFetch('/admin/documents');
  const unapproved = docs.filter(d => !d.isApproved);
  document.getElementById('documents').innerHTML = unapproved.map(d => `
    <div class="card">
      ${d.title} by ${d.uploaderId?.fullName} - $${d.price}
      <button onclick="approveDoc('${d._id}')" class="btn">Approve</button>
    </div>
  `).join('');
}

async function approveTutor(id, approve) {
  await apiFetch(`/admin/users/${id}/approve`, { method: 'PUT', body: JSON.stringify({ isApproved: approve }) });
  loadAdminDashboard();
}

async function approveDoc(id) {
  await apiFetch(`/admin/documents/${id}/approve`, { method: 'PUT' });
  loadAdminDashboard();
}

loadAdminDashboard();