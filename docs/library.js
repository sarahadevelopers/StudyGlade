// ----- Helper: format money -----
function formatMoney(amount) {
  return `$${parseFloat(amount).toFixed(2)}`;
}

// ----- Helper: escape HTML -----
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

let currentPage = 1;
let isLoading = false;
let hasMore = true;
let currentFilters = {
  subject: '',
  level: '',
  type: '',
  search: '',
  minPrice: '',
  maxPrice: '',
  sortBy: 'newest'
};

// ----- Load documents with current filters and page -----
async function loadDocuments(reset = true) {
  if (isLoading) return;
  if (reset) {
    currentPage = 1;
    hasMore = true;
    document.getElementById('documentsGrid').innerHTML = '';
    document.getElementById('loadMoreContainer').innerHTML = '';
  }
  if (!hasMore && !reset) return;

  isLoading = true;
  document.getElementById('loadingMessage').style.display = 'block';

  try {
    const params = new URLSearchParams();
    params.append('page', currentPage);
    params.append('limit', 20);
    if (currentFilters.search) params.append('search', currentFilters.search);
    if (currentFilters.subject) params.append('subject', currentFilters.subject);
    if (currentFilters.level) params.append('level', currentFilters.level);
    if (currentFilters.type) params.append('type', currentFilters.type);
    if (currentFilters.minPrice) params.append('minPrice', currentFilters.minPrice);
    if (currentFilters.maxPrice) params.append('maxPrice', currentFilters.maxPrice);
    if (currentFilters.sortBy) params.append('sort', currentFilters.sortBy);

    const url = `/api/documents?${params.toString()}`;
    const data = await apiFetch(url);
    
    // Backend returns { documents, pagination }
    const docs = data.documents || [];
    const pagination = data.pagination;
    
    hasMore = currentPage < pagination.pages;
    
    // Render documents
    const grid = document.getElementById('documentsGrid');
    docs.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'document-card';
      card.innerHTML = `
        <div>
          <div class="document-title">${escapeHtml(doc.title)}</div>
          <div class="document-meta">
            ${escapeHtml(doc.subject)} • ${escapeHtml(doc.level)} • ${escapeHtml(doc.type)}<br>
            Uploaded by ${escapeHtml(doc.uploaderName)} • ${new Date(doc.createdAt).toLocaleDateString()}
          </div>
          <div class="document-price">${formatMoney(doc.price)}</div>
          <div class="document-downloads">📥 ${doc.downloads || 0} purchases</div>
        </div>
        <div>
          <a href="/api/documents/preview/${doc._id}" class="btn-sm btn-outline" target="_blank">Preview</a>
          ${user ? `<button class="btn-sm btn-primary btn-unlock" data-id="${doc._id}" data-price="${doc.price}">Unlock</button>` : ''}
        </div>
      `;
      grid.appendChild(card);
    });
    
    // Attach unlock event listeners
    document.querySelectorAll('.btn-unlock').forEach(btn => {
      btn.removeEventListener('click', unlockHandler);
      btn.addEventListener('click', unlockHandler);
    });
    
    // Add load more button if more pages
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (hasMore) {
      loadMoreContainer.innerHTML = `<button id="loadMoreBtn" class="btn btn-outline load-more-btn">Load More</button>`;
      document.getElementById('loadMoreBtn')?.addEventListener('click', () => {
        currentPage++;
        loadDocuments(false);
      });
    } else {
      loadMoreContainer.innerHTML = '';
    }
    
  } catch (err) {
    console.error('Error loading documents:', err);
    showToast('Failed to load documents', 'error');
  } finally {
    isLoading = false;
    document.getElementById('loadingMessage').style.display = 'none';
  }
}

// ----- Unlock document handler -----
async function unlockHandler(e) {
  const btn = e.currentTarget;
  const docId = btn.getAttribute('data-id');
  const price = parseFloat(btn.getAttribute('data-price'));
  if (!confirm(`Unlock this document for ${formatMoney(price)}? Amount will be deducted from your wallet.`)) return;
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Unlocking...';
  try {
    const result = await apiFetch(`/api/documents/${docId}/unlock`, { method: 'POST' });
    showToast('Document unlocked! Download will start shortly.', 'success');
    // Trigger download
    window.open(result.fileUrl, '_blank');
    // Refresh wallet balance (if dashboard shows it)
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      const freshUser = await apiFetch('/auth/me');
      localStorage.setItem('user', JSON.stringify(freshUser));
    }
    // Optionally reload the library to update download count
    location.reload();
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Unlock';
  }
}

// ----- Apply filters (reset page) -----
function applyFilters() {
  currentFilters = {
    subject: document.getElementById('subjectFilter').value,
    level: document.getElementById('levelFilter').value,
    type: document.getElementById('typeFilter').value,
    search: document.getElementById('searchInput').value,
    minPrice: document.getElementById('minPrice').value,
    maxPrice: document.getElementById('maxPrice').value,
    sortBy: document.getElementById('sortBy').value
  };
  loadDocuments(true);
}

// ----- Event listeners -----
document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
document.getElementById('searchInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') applyFilters();
});

// Initial load
let user = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null;
loadDocuments();