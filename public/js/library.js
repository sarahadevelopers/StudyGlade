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
      <h3>${doc.title}</h3>
      <p>${doc.description?.substring(0,100)}</p>
      <p><strong>Subject:</strong> ${doc.subject} | <strong>Level:</strong> ${doc.level}</p>
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
    loadDocuments();
  } catch(err) {
    alert(err.message);
  }
}

document.getElementById('searchBtn').addEventListener('click', loadDocuments);
loadDocuments();