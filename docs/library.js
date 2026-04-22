async function loadDocuments() {
  const search = document.getElementById('search').value;
  const subject = document.getElementById('subjectFilter').value;
  const level = document.getElementById('levelFilter').value;
  let url = `/documents?search=${encodeURIComponent(search)}`;
  if (subject) url += `&subject=${subject}`;
  if (level) url += `&level=${level}`;
  const docs = await apiFetch(url);
  const grid = document.getElementById('documentsGrid');
  grid.innerHTML = docs.map(doc => `
    <div class="card">
      <a href="${window.API_BASE}/documents/preview/${doc._id}" target="_blank" style="text-decoration:none; color:inherit;">
        <h3>${escapeHtml(doc.title)}</h3>
      </a>
      <p>${escapeHtml(doc.description?.substring(0,100))}</p>
      <p><strong>Subject:</strong> ${escapeHtml(doc.subject)} | <strong>Level:</strong> ${escapeHtml(doc.level)}</p>
      <p><strong>Price:</strong> $${doc.price}</p>
      <button onclick="unlockDoc('${doc._id}', ${doc.price})" class="btn">Unlock</button>
    </div>
  `).join('');
}

async function unlockDoc(id, price) {
  if (!localStorage.getItem('token')) {
    if (confirm('You need to login to unlock documents. Go to login?')) window.location.href = '/login';
    return;
  }
  try {
    const res = await apiFetch(`/documents/${id}/unlock`, { method: 'POST' });
    alert('Document unlocked! Download will start shortly.');
    window.open(res.fileUrl, '_blank');
    loadDocuments(); // refresh to update downloads count
  } catch(err) {
    alert(err.message);
  }
}

// Simple XSS prevention
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

document.getElementById('searchBtn').addEventListener('click', loadDocuments);
loadDocuments();