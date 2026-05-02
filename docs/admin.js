// Helper: format money
function formatMoney(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

// Helper: escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ----- Notification last viewed helpers -----
function getLastNotificationView() {
  const last = localStorage.getItem('lastNotificationView');
  return last ? new Date(last).toISOString() : new Date(0).toISOString();
}

function updateLastNotificationView() {
  localStorage.setItem('lastNotificationView', new Date().toISOString());
}

// ----- Export CSV -----
function exportTableToCSV(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const rows = table.querySelectorAll('tr');
  let csv = [];
  rows.forEach(row => {
    const cols = row.querySelectorAll('td, th');
    const rowData = Array.from(cols).map(col => `"${col.innerText.replace(/"/g, '""')}"`).join(',');
    csv.push(rowData);
  });
  const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// ----- PDF Reports -----
async function downloadReport(type) {
  window.open(`/api/admin/reports/${type}`, '_blank');
}
window.downloadReport = downloadReport;

// ----- Charts -----
let revenueChart, topTutorsChart;

async function loadCharts() {
  try {
    const revenueData = await apiFetch('/admin/revenue-timeline');
    const labels = revenueData.map(r => `${r._id.month}/${r._id.year}`);
    const amounts = revenueData.map(r => r.total);
    if (revenueChart) revenueChart.destroy();
    const ctx = document.getElementById('revenueChart')?.getContext('2d');
    if (ctx) {
      revenueChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Revenue ($)', data: amounts, borderColor: '#2563eb', fill: false }] }
      });
    }

    const topTutors = await apiFetch('/admin/top-tutors');
    const tutorNames = topTutors.map(t => t.fullName);
    const tutorEarnings = topTutors.map(t => t.tutorProfile?.totalEarnings || 0);
    if (topTutorsChart) topTutorsChart.destroy();
    const ctx2 = document.getElementById('topTutorsChart')?.getContext('2d');
    if (ctx2) {
      topTutorsChart = new Chart(ctx2, {
        type: 'bar',
        data: { labels: tutorNames, datasets: [{ label: 'Earnings ($)', data: tutorEarnings, backgroundColor: '#10b981' }] }
      });
    }
  } catch (err) { console.error('Chart error:', err); }
}

// ----- Load all dashboard sections -----
async function loadAdminDashboard() {
  await loadOverview();
  await loadTutorApplications();
  await loadUsers();
  await loadAllQuestions();
  await loadDocuments();
  await loadWithdrawals();
  await loadBreaches();
  await loadAnnouncements();
  await loadCharts();
}

// ----- Overview Section -----
async function loadOverview() {
  try {
    const analytics = await apiFetch('/admin/analytics');
    const users = await apiFetch('/admin/users');
    const withdrawals = await apiFetch('/admin/withdrawals');
    const pendingWithdrawals = withdrawals.filter(w => w.status === 'pending').length;
    const pendingTutors = users.filter(u => u.role === 'tutor' && u.tutorApplication?.status === 'pending').length;

    const stats = [
      { label: 'Total Users', value: analytics.totalUsers || 0 },
      { label: 'Tutors', value: analytics.totalTutors || 0 },
      { label: 'Students', value: analytics.totalStudents || 0 },
      { label: 'Questions', value: analytics.totalQuestions || 0 },
      { label: 'Completed', value: analytics.completedQuestions || 0 },
      { label: 'Documents', value: analytics.totalDocuments || 0 },
      { label: 'Revenue', value: formatMoney(analytics.totalRevenue || 0) },
      { label: 'Pending Tutors', value: pendingTutors },
      { label: 'Pending Withdrawals', value: pendingWithdrawals }
    ];

    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = stats.map(s => `
      <div class="stat-card">
        <h4>${s.label}</h4>
        <div class="value">${s.value}</div>
      </div>
    `).join('');

    const recent = users.slice(-5).reverse().map(u => `
      <div style="padding: 0.5rem 0; border-bottom: 1px solid #e5e7eb;">
        ${u.fullName} (${u.role}) joined ${new Date(u.createdAt).toLocaleDateString()}
      </div>
    `).join('');
    document.getElementById('recentActivity').innerHTML = recent || 'No recent activity.';
  } catch (err) {
    console.error('Overview error:', err);
    document.getElementById('statsGrid').innerHTML = '<p>Error loading stats</p>';
  }
}

// ----- Tutor Applications Section -----
async function loadTutorApplications() {
  try {
    const users = await apiFetch('/admin/users');
    const pendingApps = users.filter(u => u.role === 'tutor' && u.tutorApplication?.status === 'pending');
    const container = document.getElementById('tutorApplicationsList');
    if (!pendingApps.length) {
      container.innerHTML = '<div class="card">No pending tutor applications.</div>';
      return;
    }
    container.innerHTML = `
      <table class="data-table" id="tutorAppsTable">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Applied On</th><th>Subjects</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${pendingApps.map(t => `
            <tr>
              <td>${escapeHtml(t.fullName)}</td>
              <td>${escapeHtml(t.email)}</td>
              <td>${new Date(t.tutorApplication.appliedAt).toLocaleDateString()}</td>
              <td>${escapeHtml(t.tutorApplication.subjects?.join(', ') || '—')}</td>
              <td><button class="btn-sm btn-primary" onclick="showTutorReview('${t._id}')">Review</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) { console.error(err); }
}

let currentReviewUserId = null;
async function showTutorReview(userId) {
  const users = await apiFetch('/admin/users');
  const tutor = users.find(u => u._id === userId);
  if (!tutor) return;
  currentReviewUserId = userId;
  const app = tutor.tutorApplication;
  const modalBody = document.getElementById('tutorReviewBody');
  modalBody.innerHTML = `
    <p><strong>Full Name:</strong> ${escapeHtml(tutor.fullName)}</p>
    <p><strong>Email:</strong> ${escapeHtml(tutor.email)}</p>
    <p><strong>Qualifications:</strong><br>${escapeHtml(app.qualifications || 'Not provided')}</p>
    <p><strong>Subjects:</strong> ${escapeHtml(app.subjects?.join(', ') || '—')}</p>
    <p><strong>Essay Format:</strong> ${app.essayFormat || 'APA'}</p>
    <p><strong>Essay (500-1000 words):</strong></p>
    <div style="background:#f9fafb; padding:1rem; border-radius:0.5rem; white-space:pre-wrap;">${escapeHtml(app.essay || '')}</div>
    <p><strong>Quiz Answers:</strong> Q1: ${app.quizAnswers?.q1 || '?'}, Q2: ${app.quizAnswers?.q2 || '?'}, Q3: ${app.quizAnswers?.q3 || '?'}</p>
    ${app.portfolioUrl ? `<p><strong>Portfolio:</strong> <a href="${app.portfolioUrl}" target="_blank">Download file</a></p>` : ''}
  `;
  document.getElementById('tutorReviewModal').style.display = 'flex';
}

async function approveTutorApplication() {
  if (!currentReviewUserId) return;
  try {
    await apiFetch(`/admin/users/${currentReviewUserId}/approve-tutor`, {
      method: 'PUT',
      body: JSON.stringify({ approved: true })
    });
    alert('Tutor approved. They can now log in.');
    closeTutorModal();
    loadAdminDashboard();
  } catch (err) { alert('Error: ' + err.message); }
}

async function rejectTutorApplication() {
  if (!currentReviewUserId) return;
  const feedback = prompt('Reason for rejection (will be sent to tutor):');
  if (feedback === null) return;
  try {
    await apiFetch(`/admin/users/${currentReviewUserId}/approve-tutor`, {
      method: 'PUT',
      body: JSON.stringify({ approved: false, feedback })
    });
    alert('Tutor rejected.');
    closeTutorModal();
    loadAdminDashboard();
  } catch (err) { alert('Error: ' + err.message); }
}

function closeTutorModal() {
  document.getElementById('tutorReviewModal').style.display = 'none';
  currentReviewUserId = null;
}

// ----- Users Management -----
async function loadUsers() {
  try {
    const users = await apiFetch('/admin/users');
    const container = document.getElementById('usersList');
    container.innerHTML = `
      <table class="data-table" id="usersTable">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Approved</th><th>Suspended</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td>${escapeHtml(u.fullName)}</td>
              <td>${escapeHtml(u.email)}</td>
              <td>${u.role}</td>
              <td>${u.isApproved ? '✅' : '❌'}</td>
              <td>${u.isSuspended ? '🚫' : '✅'}</td>
              <td>
                <button class="btn-sm btn-primary" onclick="showUserDashboard('${u._id}')">View Dashboard</button>
                <button class="btn-sm ${u.isSuspended ? 'btn-secondary' : 'btn-danger'}" onclick="toggleSuspend('${u._id}', ${!u.isSuspended})">
                  ${u.isSuspended ? 'Unsuspend' : 'Suspend'}
                </button>
                ${u.role === 'tutor' ? `<button class="btn-sm btn-secondary" onclick="setTutorLevel('${u._id}', '${u.tutorProfile?.level || 'Entry-Level'}')">Set Level</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) { console.error(err); }
}

async function toggleSuspend(userId, suspend) {
  try {
    await apiFetch(`/admin/users/${userId}/suspend`, {
      method: 'PUT',
      body: JSON.stringify({ isSuspended: suspend })
    });
    loadUsers();
  } catch (err) { alert('Error: ' + err.message); }
}

async function setTutorLevel(userId, currentLevel) {
  const newLevel = prompt(`Current level: ${currentLevel}\nEnter new level: Entry-Level, Skilled, Expert, Premium`, currentLevel);
  if (!newLevel) return;
  const reason = prompt('Reason for manual override:');
  if (!reason) return;
  try {
    await apiFetch(`/admin/tutors/${userId}/level`, {
      method: 'PUT',
      body: JSON.stringify({ level: newLevel, reason })
    });
    loadUsers();
  } catch (err) { alert('Error: ' + err.message); }
}
window.setTutorLevel = setTutorLevel;

// ----- All Questions Section -----
async function loadAllQuestions() {
  try {
    const questions = await apiFetch('/admin/questions');
    const container = document.getElementById('questionsList');
    if (!questions.length) {
      container.innerHTML = '<div class="card">No questions found.</div>';
      return;
    }
    container.innerHTML = `
      <table class="data-table" id="questionsTable">
        <thead>
          <tr><th>Title</th><th>Student</th><th>Tutor</th><th>Budget</th><th>Status</th><th>Deadline</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${questions.map(q => `
            <tr>
              <td>${escapeHtml(q.title)}</td>
              <td>${escapeHtml(q.studentId?.fullName || '—')}</td>
              <td>${escapeHtml(q.tutorId?.fullName || '—')}</td>
              <td>$${q.budget}</td>
              <td><span class="badge ${q.status === 'completed' ? 'badge-approved' : q.status === 'pending' ? 'badge-pending' : 'badge-rejected'}">${q.status}</span></td>
              <td>${q.deadline ? new Date(q.deadline).toLocaleDateString() : '—'}</td>
              <td><button class="btn-sm btn-primary" onclick="viewFullQuestion('${q._id}')">View Full</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) { console.error(err); }
}

// ----- Document Approval (shows ALL documents with Edit/Preview buttons) -----
async function loadDocuments() {
  try {
    const docs = await apiFetch('/admin/documents');
    const container = document.getElementById('documentsList');
    if (!docs.length) {
      container.innerHTML = '<div class="card">No documents found.</div>';
      return;
    }
    container.innerHTML = `
      <table class="data-table" id="allDocumentsTable">
        <thead>
          <tr><th>Title</th><th>Uploader</th><th>Price</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${docs.map(d => `
            <tr>
              <td>${escapeHtml(d.title)}</td>
              <td>${escapeHtml(d.uploaderId?.fullName || 'Unknown')}</td>
              <td>${formatMoney(d.price)}</td>
              <td><span style="color:${d.isApproved ? 'green' : 'orange'}">${d.isApproved ? 'Approved' : 'Pending'}</span></td>
              <td>
                <button class="btn-sm btn-primary" onclick="editDocument(${JSON.stringify(d._id)}, ${JSON.stringify(d.title)}, ${d.price}, ${JSON.stringify(d.description)})">Edit</button>
                <button class="btn-sm btn-secondary" onclick="showPreviewModal(${JSON.stringify(d._id)}, ${JSON.stringify(d.previewText || '')})">Edit Preview</button>
                ${!d.isApproved ? `<button class="btn-sm btn-success" onclick="approveDoc('${d._id}')">Approve</button>` : ''}
                <button class="btn-sm btn-danger" onclick="deleteDocument('${d._id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) { console.error(err); }
}

// ----- Document edit modals -----
async function approveDoc(docId) {
  try {
    await apiFetch(`/admin/documents/${docId}/approve`, { method: 'PUT' });
    loadDocuments();
  } catch (err) { alert(err.message); }
}

async function deleteDocument(docId) {
  if (confirm('Delete this document permanently?')) {
    await apiFetch(`/admin/documents/${docId}`, { method: 'DELETE' });
    loadDocuments();
  }
}

// ----- Edit Document Modal functions (global) -----
window.editDocument = async function(docId, currentTitle, currentPrice, currentDescription) {
  console.log("editDocument called", docId, currentTitle);
  document.getElementById('editDocId').value = docId;
  document.getElementById('editDocTitle').value = currentTitle;
  document.getElementById('editDocPrice').value = currentPrice;
  document.getElementById('editDocDescription').value = currentDescription;
  document.getElementById('editDocumentModal').style.display = 'flex';
};

window.saveDocumentEdit = async function() {
  const docId = document.getElementById('editDocId').value;
  const title = document.getElementById('editDocTitle').value;
  const price = parseFloat(document.getElementById('editDocPrice').value);
  const description = document.getElementById('editDocDescription').value;
  try {
    await apiFetch(`/admin/documents/${docId}`, {
      method: 'PUT',
      body: JSON.stringify({ title, price, description })
    });
    closeEditDocModal();
    loadDocuments();
    showToast('Document updated', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.closeEditDocModal = function() {
  document.getElementById('editDocumentModal').style.display = 'none';
};

// ----- Edit Preview Modal functions (global) -----
window.showPreviewModal = function(docId, currentPreviewText) {
  console.log("showPreviewModal called", docId);
  document.getElementById('editPreviewDocId').value = docId;
  const textarea = document.getElementById('editPreviewText');
  textarea.value = currentPreviewText || '';
  document.getElementById('previewCharCount').innerText = textarea.value.length;
  document.getElementById('editPreviewModal').style.display = 'flex';
};

window.closePreviewModal = function() {
  document.getElementById('editPreviewModal').style.display = 'none';
};

window.savePreviewText = async function() {
  const docId = document.getElementById('editPreviewDocId').value;
  const newPreviewText = document.getElementById('editPreviewText').value.trim();
  if (!docId) return;
  const saveBtn = document.querySelector('#editPreviewForm button[type="submit"]');
  const originalText = saveBtn.innerText;
  saveBtn.disabled = true;
  saveBtn.innerText = 'Saving...';
  try {
    await apiFetch(`/api/documents/${docId}/preview`, {
      method: 'PUT',
      body: JSON.stringify({ previewText: newPreviewText })
    });
    showToast('Preview text updated', 'success');
    closePreviewModal();
    loadDocuments();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerText = originalText;
  }
};

// ----- Withdrawal Requests -----
async function loadWithdrawals() {
  try {
    const withdrawals = await apiFetch('/admin/withdrawals');
    const pending = withdrawals.filter(w => w.status === 'pending');
    const container = document.getElementById('withdrawalsList');
    if (!pending.length) {
      container.innerHTML = '<div class="card">No pending withdrawals.</div>';
      return;
    }
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>User</th><th>Amount</th><th>Method</th><th>Requested</th><th>Actions</th></tr></thead>
        <tbody>
          ${pending.map(w => `
            <tr>
              <td>${escapeHtml(w.userId?.fullName || 'Unknown')}</td>
              <td>${formatMoney(w.amount)}</td>
              <td>${w.method}</td>
              <td>${new Date(w.createdAt).toLocaleDateString()}</td>
              <td>
                <button class="btn-sm btn-primary" onclick="approveWithdrawal('${w._id}')">Approve</button>
                <button class="btn-sm btn-danger" onclick="rejectWithdrawal('${w._id}')">Reject</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) { console.error(err); }
}

async function approveWithdrawal(withdrawalId) {
  try {
    await apiFetch(`/admin/withdrawals/${withdrawalId}/approve`, { method: 'PUT' });
    loadWithdrawals();
    loadOverview();
  } catch (err) { alert(err.message); }
}

async function rejectWithdrawal(withdrawalId) {
  if (!confirm('Reject this withdrawal? Funds will be refunded to user wallet.')) return;
  try {
    await apiFetch(`/admin/withdrawals/${withdrawalId}/reject`, { method: 'PUT' });
    loadWithdrawals();
    loadOverview();
  } catch (err) { alert(err.message); }
}

// ----- Breach Management -----
async function loadBreaches() {
  try {
    const breaches = await apiFetch('/admin/breaches');
    const container = document.getElementById('breachesList');
    container.innerHTML = `
      <table class="data-table" id="breachesTable">
        <thead>
          <tr><th>User</th><th>Type</th><th>Reason</th><th>Severity</th><th>Date</th><th>Expires</th><th>Resolved</th></tr>
        </thead>
        <tbody>
          ${breaches.map(b => `
            <tr>
              <td>${escapeHtml(b.userId?.fullName || 'Deleted')}</td>
              <td>${b.type}</td>
              <td>${escapeHtml(b.reason)}</td>
              <td>${b.severity}</td>
              <td>${new Date(b.createdAt).toLocaleDateString()}</td>
              <td>${b.expiresAt ? new Date(b.expiresAt).toLocaleDateString() : '—'}</td>
              <td>${b.resolved ? '✅' : `<button class="btn-sm btn-primary" onclick="resolveBreach('${b._id}')">Resolve</button>`}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) { console.error(err); }
}

async function resolveBreach(breachId) {
  try {
    await apiFetch(`/admin/breaches/${breachId}/resolve`, { method: 'PUT' });
    loadBreaches();
  } catch (err) { alert(err.message); }
}
window.resolveBreach = resolveBreach;

// ----- Announcements -----
async function loadAnnouncements() {
  try {
    const announcements = await apiFetch('/admin/announcements');
    const container = document.getElementById('announcementsList');
    container.innerHTML = `
      <table class="data-table" id="announcementsTable">
        <thead>
          <tr><th>Title</th><th>Message</th><th>Active</th><th>Expires</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${announcements.map(a => `
            <tr>
              <td>${escapeHtml(a.title)}</td>
              <td>${escapeHtml(a.message)}</td>
              <td>${a.isActive ? '✅' : '❌'}</td>
              <td>${a.expiresAt ? new Date(a.expiresAt).toLocaleDateString() : '—'}</td>
              <td>${new Date(a.createdAt).toLocaleDateString()}</td>
              <td>
                <button class="btn-sm btn-primary" onclick="editAnnouncement('${a._id}', '${escapeHtml(a.title)}', '${escapeHtml(a.message)}', '${a.expiresAt || ''}', ${a.isActive})">Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteAnnouncement('${a._id}')">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) { console.error(err); }
}

function showCreateAnnouncementModal() {
  document.getElementById('announcementModalTitle').innerText = 'Create Announcement';
  document.getElementById('announcementId').value = '';
  document.getElementById('announcementTitle').value = '';
  document.getElementById('announcementMessage').value = '';
  document.getElementById('announcementExpires').value = '';
  document.getElementById('announcementActive').checked = true;
  document.getElementById('announcementModal').style.display = 'flex';
}

async function editAnnouncement(id, title, message, expires, isActive) {
  document.getElementById('announcementModalTitle').innerText = 'Edit Announcement';
  document.getElementById('announcementId').value = id;
  document.getElementById('announcementTitle').value = title;
  document.getElementById('announcementMessage').value = message;
  document.getElementById('announcementExpires').value = expires ? expires.split('T')[0] + 'T' + expires.split('T')[1]?.slice(0,5) : '';
  document.getElementById('announcementActive').checked = isActive;
  document.getElementById('announcementModal').style.display = 'flex';
}

async function saveAnnouncement() {
  const id = document.getElementById('announcementId').value;
  const title = document.getElementById('announcementTitle').value;
  const message = document.getElementById('announcementMessage').value;
  const expiresAt = document.getElementById('announcementExpires').value || null;
  const isActive = document.getElementById('announcementActive').checked;
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/admin/announcements/${id}` : '/admin/announcements';
  try {
    await apiFetch(url, {
      method,
      body: JSON.stringify({ title, message, expiresAt, isActive })
    });
    closeAnnouncementModal();
    loadAnnouncements();
  } catch (err) { alert(err.message); }
}

async function deleteAnnouncement(id) {
  if (confirm('Delete this announcement?')) {
    await apiFetch(`/admin/announcements/${id}`, { method: 'DELETE' });
    loadAnnouncements();
  }
}

function closeAnnouncementModal() {
  document.getElementById('announcementModal').style.display = 'none';
}
window.editAnnouncement = editAnnouncement;
window.deleteAnnouncement = deleteAnnouncement;
window.saveAnnouncement = saveAnnouncement;
window.showCreateAnnouncementModal = showCreateAnnouncementModal;
window.closeAnnouncementModal = closeAnnouncementModal;

// ----- User Dashboard Modal -----
async function showUserDashboard(userId) {
  try {
    const data = await apiFetch(`/admin/users/${userId}/dashboard`);
    const user = data.user;
    const questions = data.questions;
    const transactions = data.transactions;
    const bids = data.bids || [];

    let html = `
      <div style="margin-bottom: 1rem;">
        <h4>Profile</h4>
        <p><strong>Name:</strong> ${escapeHtml(user.fullName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
        <p><strong>Role:</strong> ${user.role}</p>
        <p><strong>Wallet Balance:</strong> ${formatMoney(user.walletBalance)}</p>
        ${user.role === 'tutor' ? `
          <p><strong>Tutor Level:</strong> ${user.tutorProfile?.level || 'Entry-Level'}</p>
          <p><strong>Rating:</strong> ${user.tutorProfile?.rating || 0} ⭐</p>
          <p><strong>Completed Questions:</strong> ${user.tutorProfile?.completedQuestions || 0}</p>
          <p><strong>Total Earnings:</strong> ${formatMoney(user.tutorProfile?.totalEarnings || 0)}</p>
          ${user.paymentDetails ? `
            <hr>
            <h5>Payment Details (for payouts)</h5>
            <p><strong>Preferred Method:</strong> ${user.paymentDetails.preferredMethod}</p>
            ${user.paymentDetails.preferredMethod === 'paypal' ? `<p><strong>PayPal Email:</strong> ${escapeHtml(user.paymentDetails.paypalEmail)}</p>` : ''}
            ${user.paymentDetails.preferredMethod === 'mpesa' ? `<p><strong>Mpesa Phone:</strong> ${escapeHtml(user.paymentDetails.mpesaPhone)}</p>` : ''}
            ${user.paymentDetails.preferredMethod === 'bank' && user.paymentDetails.bankAccount ? `
              <p><strong>Bank Name:</strong> ${escapeHtml(user.paymentDetails.bankAccount.bankName)}</p>
              <p><strong>Account Name:</strong> ${escapeHtml(user.paymentDetails.bankAccount.accountName)}</p>
              <p><strong>Account Number:</strong> ${escapeHtml(user.paymentDetails.bankAccount.accountNumber)}</p>
            ` : ''}
          ` : ''}
        ` : ''}
      </div>
    `;

    if (questions.length) {
      html += `<h4>Questions ${user.role === 'tutor' ? '(As Tutor)' : '(Posted by Student)'}</h4>
      <table class="data-table">
        <thead><tr><th>Title</th><th>Budget</th><th>Status</th><th>Deadline</th></tr></thead>
        <tbody>
          ${questions.map(q => `
            <tr>
              <td>${escapeHtml(q.title)}</td>
              <td>$${q.budget}</td>
              <td>${q.status}</td>
              <td>${q.deadline ? new Date(q.deadline).toLocaleDateString() : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
    } else {
      html += `<p>No questions found.</p>`;
    }

    if (transactions.length) {
      html += `<h4>Recent Transactions</h4>
      <table class="data-table">
        <thead><tr><th>Type</th><th>Amount</th><th>Description</th><th>Date</th></tr></thead>
        <tbody>
          ${transactions.slice(0, 10).map(t => `
            <tr>
              <td>${t.type}</td>
              <td>${formatMoney(Math.abs(t.amount))}</td>
              <td>${escapeHtml(t.description)}</td>
              <td>${new Date(t.createdAt).toLocaleDateString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
    }

    if (bids.length) {
      html += `<h4>Bids Placed</h4>
      <table class="data-table">
        <thead><tr><th>Question</th><th>Bid Amount</th></tr></thead>
        <tbody>
          ${bids.map(b => `
            <tr>
              <td>${escapeHtml(b.questionId?.title || 'Deleted question')}</td>
              <td>${formatMoney(b.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
    }

    document.getElementById('userDashboardBody').innerHTML = html;
    document.getElementById('userDashboardModal').style.display = 'flex';
  } catch (err) {
    alert('Error loading dashboard: ' + err.message);
  }
}

function closeUserDashboardModal() {
  document.getElementById('userDashboardModal').style.display = 'none';
}

// ----- Full Question Modal -----
async function viewFullQuestion(questionId) {
  try {
    const data = await apiFetch(`/admin/questions/${questionId}/full`);
    const { question, comments } = data;

    let html = `
      <div style="margin-bottom: 1rem;">
        <h4>${escapeHtml(question.title)}</h4>
        <p><strong>Student:</strong> ${escapeHtml(question.studentId?.fullName)} (${escapeHtml(question.studentId?.email)})</p>
        <p><strong>Tutor:</strong> ${escapeHtml(question.tutorId?.fullName || 'Not assigned')}</p>
        <p><strong>Description:</strong> ${escapeHtml(question.description)}</p>
        <p><strong>Budget:</strong> $${question.budget} | <strong>Status:</strong> ${question.status} | <strong>Deadline:</strong> ${new Date(question.deadline).toLocaleString()}</p>
        ${question.files?.length ? `<p><strong>Attached files:</strong> ${question.files.map(f => `<a href="${f}" target="_blank">Download</a>`).join(', ')}</p>` : ''}
        ${question.answerFile ? `<p><strong>Answer:</strong> <a href="${question.answerFile}" target="_blank">Download answer</a></p>` : ''}
      </div>
      <hr>
      <h5>Discussion Thread</h5>
      <div style="max-height: 400px; overflow-y: auto;">
    `;

    comments.forEach(c => {
      const deletedBadge = c.deleted ? '<span class="badge" style="background:#e2e3e5;">Deleted</span>' : '';
      html += `
        <div style="border-left: 2px solid #ccc; padding-left: 0.5rem; margin-bottom: 1rem;">
          <strong>${escapeHtml(c.userName)} (${c.userRole})</strong> <small>${new Date(c.createdAt).toLocaleString()}</small> ${deletedBadge}
          ${c.deleted ? `<p><em>This comment was deleted by the user on ${new Date(c.deletedAt).toLocaleString()}</em></p>` : `<p>${escapeHtml(c.text)}</p>`}
          ${c.fileUrl ? `<p><a href="${c.fileUrl}" target="_blank">📎 View attached file</a></p>` : ''}
        </div>
      `;
    });

    html += `
      </div>
      <hr>
      <div>
        <textarea id="adminCommentText" rows="3" placeholder="Write a comment as admin..."></textarea>
        <button class="btn-sm btn-primary" onclick="postAdminComment('${question._id}')">Post Comment</button>
      </div>
    `;

    document.getElementById('fullQuestionBody').innerHTML = html;
    document.getElementById('fullQuestionModal').style.display = 'flex';
  } catch (err) {
    alert('Error loading question: ' + err.message);
  }
}

async function postAdminComment(questionId) {
  const text = document.getElementById('adminCommentText').value;
  if (!text) return;
  try {
    await apiFetch('/comments', {
      method: 'POST',
      body: JSON.stringify({ questionId, text })
    });
    document.getElementById('adminCommentText').value = '';
    viewFullQuestion(questionId);
    showToast('Comment posted as admin', 'success');
  } catch (err) {
    alert(err.message);
  }
}

function closeFullQuestionModal() {
  document.getElementById('fullQuestionModal').style.display = 'none';
}

// ----- Notifications (Polling) -----
let notificationInterval;
async function loadNotifications() {
  try {
    const since = getLastNotificationView();
    const notifs = await apiFetch(`/admin/notifications?since=${encodeURIComponent(since)}`);
    const badge = document.getElementById('notificationBadge');
    if (badge) badge.textContent = notifs.length > 9 ? '9+' : notifs.length;
    const listDiv = document.getElementById('notificationList');
    if (listDiv) {
      listDiv.innerHTML = notifs.map(n => `
        <div style="border-bottom: 1px solid #e5e7eb; padding: 0.5rem;">
          <div>${escapeHtml(n.message)}</div>
          <small>${new Date(n.createdAt).toLocaleString()}</small>
          <a href="#" onclick="handleNotificationClick('${n.link}'); return false;">View</a>
        </div>
      `).join('');
      if (notifs.length === 0) listDiv.innerHTML = '<p>No new notifications.</p>';
    }
  } catch (err) { console.error(err); }
}

function handleNotificationClick(link) {
  closeNotificationModal();
  const sectionId = link.substring(1);
  const menuItem = document.querySelector(`.sidebar-menu li[data-section="${sectionId}"]`);
  if (menuItem) menuItem.click();
}

function openNotificationModal() {
  document.getElementById('notificationModal').style.display = 'flex';
  loadNotifications().then(() => {
    updateLastNotificationView();
    loadNotifications();
  });
}
function closeNotificationModal() {
  document.getElementById('notificationModal').style.display = 'none';
}

// ----- Financial Report -----
let currentTransactionPage = 1;
let totalTransactionPages = 1;

async function loadFinancialReport(page = 1) {
  const from = document.getElementById('reportFrom')?.value || '';
  const to = document.getElementById('reportTo')?.value || '';
  let url = `/admin/financial-report?page=${page}&limit=20`;
  if (from) url += `&from=${from}`;
  if (to) url += `&to=${to}`;
  try {
    const data = await apiFetch(url);
    currentTransactionPage = data.pagination.page;
    totalTransactionPages = data.pagination.pages;
    renderFinancialReport(data);
    renderTransactionPagination();
  } catch (err) {
    console.error(err);
    document.getElementById('financialContent').innerHTML = '<p>Error loading financial report.</p>';
  }
}

function renderTransactionPagination() {
  const container = document.getElementById('transactionsPagination');
  if (!container) return;
  let html = '<div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 1rem;">';
  if (currentTransactionPage > 1) {
    html += `<button class="btn-sm btn-secondary" onclick="loadFinancialReport(${currentTransactionPage - 1})">Previous</button>`;
  }
  html += `<span>Page ${currentTransactionPage} of ${totalTransactionPages}</span>`;
  if (currentTransactionPage < totalTransactionPages) {
    html += `<button class="btn-sm btn-secondary" onclick="loadFinancialReport(${currentTransactionPage + 1})">Next</button>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

function getTransactionColorClass(type, amount) {
  if (type === 'withdraw') return 'text-danger';
  if (type === 'deposit' || type === 'tutor_payment') return 'text-success';
  if (type === 'refund') return 'text-warning';
  return '';
}

function renderFinancialReport(data) {
  const { summary, students, tutors, withdrawalHistory, refunds, transactions } = data;
  let html = `
    <div class="stats-grid">
      <div class="stat-card"><h4>Total Deposits</h4><div class="value">${formatMoney(summary.totalDeposits)}</div></div>
      <div class="stat-card"><h4>Total Withdrawals</h4><div class="value">${formatMoney(summary.totalWithdrawals)}</div></div>
      <div class="stat-card"><h4>Platform Revenue</h4><div class="value">${formatMoney(summary.platformRevenue)}</div></div>
      <div class="stat-card"><h4>Pending Withdrawals</h4><div class="value">${summary.pendingWithdrawals}</div></div>
      <div class="stat-card"><h4>Pending Amount</h4><div class="value">${formatMoney(summary.pendingWithdrawalsAmount)}</div></div>
    </div>

    <h3>Students</h3>
    <table class="data-table" id="studentsTable">
      <thead><tr><th>Name</th><th>Email</th><th>Funded</th><th>Spent</th><th>Balance</th></tr></thead>
      <tbody>
        ${students.map(s => `
          <tr>
            <td>${escapeHtml(s.fullName)}</td>
            <td>${escapeHtml(s.email)}</td>
            <td>${formatMoney(s.funded)}</td>
            <td>${formatMoney(s.spent)}</td>
            <td>${formatMoney(s.balance)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h3>Tutors</h3>
    <table class="data-table" id="tutorsTable">
      <thead><tr><th>Name</th><th>Email</th><th>Earnings</th><th>Commission Deducted</th><th>Withdrawals</th><th>Balance</th><th>Level</th><th>Rating</th></tr></thead>
      <tbody>
        ${tutors.map(t => `
          <tr>
            <td>${escapeHtml(t.fullName)}</td>
            <td>${escapeHtml(t.email)}</td>
            <td>${formatMoney(t.earnings)}</td>
            <td>${formatMoney(t.commissionDeducted)}<tr>
            <td>${formatMoney(t.withdrawals)}</td>
            <td>${formatMoney(t.balance)}</td>
            <td>${t.tutorProfile.level}</td>
            <td>${t.tutorProfile.rating} ⭐</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h3>Withdrawal History (approved)</h3>
    <table class="data-table" id="withdrawalsTable">
      <thead><tr><th>User</th><th>Email</th><th>Amount</th><th>Method</th><th>Date</th></tr></thead>
      <tbody>
        ${withdrawalHistory.map(w => `
          <tr>
            <td>${escapeHtml(w.name)}</td>
            <td>${escapeHtml(w.email)}</td>
            <td class="${getTransactionColorClass('withdraw', w.amount)}">${formatMoney(w.amount)}</td>
            <td>${w.method}</td>
            <td>${new Date(w.date).toLocaleDateString()}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h3>Refunds</h3>
    <table class="data-table" id="refundsTable">
      <thead><tr><th>User</th><th>Email</th><th>Amount</th><th>Description</th><th>Date</th></tr></thead>
      <tbody>
        ${refunds.map(r => `
          <tr>
            <td>${escapeHtml(r.name)}</td>
            <td>${escapeHtml(r.email)}</td>
            <td class="${getTransactionColorClass('refund', r.amount)}">${formatMoney(r.amount)}</td>
            <td>${escapeHtml(r.description)}</td>
            <td>${new Date(r.date).toLocaleDateString()}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <h3>All Transactions</h3>
    <table class="data-table" id="transactionsTable">
      <thead><tr><th>User</th><th>Email</th><th>Type</th><th>Amount</th><th>Description</th><th>Date</th></tr></thead>
      <tbody>
        ${transactions.map(t => `
          <tr>
            <td>${escapeHtml(t.user)}</td>
            <td>${escapeHtml(t.email)}</td>
            <td>${t.type}</td>
            <td class="${getTransactionColorClass(t.type, t.amount)}">${formatMoney(t.amount)}</td>
            <td>${escapeHtml(t.description)}</td>
            <td>${new Date(t.date).toLocaleDateString()}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div id="transactionsPagination"></div>
  `;
  document.getElementById('financialContent').innerHTML = html;
}

function exportFinancialCSV() {
  exportTableToCSV('studentsTable', 'students.csv');
  exportTableToCSV('tutorsTable', 'tutors.csv');
  exportTableToCSV('withdrawalsTable', 'withdrawals.csv');
  exportTableToCSV('refundsTable', 'refunds.csv');
  exportTableToCSV('transactionsTable', 'transactions.csv');
  alert('CSV exports have been initiated. Check your downloads folder.');
}

async function downloadFinancialPDF() {
  const from = document.getElementById('reportFrom')?.value || '';
  const to = document.getElementById('reportTo')?.value || '';
  let url = `/api/admin/reports/financial?`;
  if (from) url += `from=${from}&`;
  if (to) url += `to=${to}`;
  window.open(url, '_blank');
}

// ----- Expose remaining global functions for inline buttons -----
window.loadFinancialReport = loadFinancialReport;
window.exportFinancialCSV = exportFinancialCSV;
window.downloadFinancialPDF = downloadFinancialPDF;
window.approveDoc = approveDoc;
window.approveWithdrawal = approveWithdrawal;
window.rejectWithdrawal = rejectWithdrawal;
window.showTutorReview = showTutorReview;
window.approveTutorApplication = approveTutorApplication;
window.rejectTutorApplication = rejectTutorApplication;
window.toggleSuspend = toggleSuspend;
window.closeTutorModal = closeTutorModal;
window.showUserDashboard = showUserDashboard;
window.closeUserDashboardModal = closeUserDashboardModal;
window.deleteDocument = deleteDocument;
window.exportTableToCSV = exportTableToCSV;
window.openNotificationModal = openNotificationModal;
window.closeNotificationModal = closeNotificationModal;
window.handleNotificationClick = handleNotificationClick;
window.downloadReport = downloadReport;
window.viewFullQuestion = viewFullQuestion;
window.postAdminComment = postAdminComment;
window.closeFullQuestionModal = closeFullQuestionModal;
window.setTutorLevel = setTutorLevel;

// ----- Event listeners -----
document.getElementById('editDocForm')?.addEventListener('submit', (e) => { e.preventDefault(); saveDocumentEdit(); });
document.getElementById('announcementForm')?.addEventListener('submit', (e) => { e.preventDefault(); saveAnnouncement(); });
document.getElementById('editPreviewForm')?.addEventListener('submit', (e) => { e.preventDefault(); savePreviewText(); });
document.querySelector('.notification-icon')?.addEventListener('click', openNotificationModal);
document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
  localStorage.clear();
  window.location.href = 'login.html';
});

// ----- Character counter for preview modal -----
document.getElementById('editPreviewText')?.addEventListener('input', function() {
  const length = this.value.length;
  document.getElementById('previewCharCount').innerText = length;
});

// ----- Sidebar navigation -----
function initSidebar() {
  const menuItems = document.querySelectorAll('.sidebar-menu li');
  const sections = document.querySelectorAll('.section');
  menuItems.forEach(item => {
    item.addEventListener('click', () => {
      const sectionId = item.getAttribute('data-section');
      menuItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      sections.forEach(s => s.classList.remove('active-section'));
      document.getElementById(sectionId).classList.add('active-section');

      if (sectionId === 'financial') loadFinancialReport();
    });
  });
}

// ----- Start -----
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  loadAdminDashboard();
  loadNotifications();
  if (notificationInterval) clearInterval(notificationInterval);
  notificationInterval = setInterval(loadNotifications, 30000);
});