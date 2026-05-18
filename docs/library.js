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

    const url = `/documents/library?${params.toString()}`;
    const data = await apiFetch(url);

    const docs = data.documents || [];
    const pagination = data.pagination;

    hasMore = currentPage < pagination.pages;

    const grid = document.getElementById('documentsGrid');
    const user = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null;

    docs.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'document-card';

      const previewUrl = doc.slug ? `/document/${doc.slug}` : `/api/documents/preview/${doc._id}`;

      const isPending = user && !doc.isApproved && doc.uploaderId === user.id;
      const pendingBadge = isPending ? '<span style="background:#FEF3C7; color:#B45309; padding:2px 8px; border-radius:20px; font-size:0.7rem; margin-left:8px; white-space:nowrap;">⏳ Pending</span>' : '';

      // Description truncation
      const fullDesc = doc.description || '';
      const descLimit = 120;
      const isLongDesc = fullDesc.length > descLimit;
      const truncatedDesc = isLongDesc ? fullDesc.substring(0, descLimit) + '…' : fullDesc;
      const descId = `desc-${doc._id}`;

      let descriptionHtml = `
        <div class="document-description" id="${descId}">
          <span class="desc-short">${escapeHtml(truncatedDesc)}</span>
          ${isLongDesc ? `<span class="desc-full" style="display:none;">${escapeHtml(fullDesc)}</span>` : ''}
        </div>
      `;
      if (isLongDesc) {
        descriptionHtml += `
          <button class="see-more-btn" data-desc-id="${descId}">See more</button>
        `;
      }

      // Build the card – unlock button now links to the preview page
      card.innerHTML = `
        <div class="card-top">
          <div class="document-title">
            ${escapeHtml(doc.title)}
            ${pendingBadge}
          </div>
          <div class="document-meta">
            ${escapeHtml(doc.subject)} • ${escapeHtml(doc.level)} • ${escapeHtml(doc.type)}<br>
            Uploaded by ${escapeHtml(doc.uploaderName)} • ${new Date(doc.createdAt).toLocaleDateString()}
          </div>
          ${descriptionHtml}
        </div>
        <div class="card-bottom">
          <div class="document-price">${formatMoney(doc.price)}</div>
          <div class="document-downloads">📥 ${doc.downloads || 0} purchases</div>
          <div class="smart-preview-group">
            <input type="text" class="smart-search" data-doc-id="${doc._id}" placeholder="Ask a question about this document...">
            <button class="btn-smart-preview" data-doc-id="${doc._id}">🔍 Smart Preview</button>
            <div class="smart-preview-result" data-doc-id="${doc._id}"></div>
          </div>
          <div class="card-actions">
            <a href="${previewUrl}" class="btn-sm btn-outline" target="_blank">Preview</a>
            <a href="${previewUrl}" class="btn-sm btn-primary">Unlock</a>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });

    // Attach "See more" event listeners
    document.querySelectorAll('.see-more-btn').forEach(btn => {
      btn.removeEventListener('click', seeMoreHandler);
      btn.addEventListener('click', seeMoreHandler);
    });

    // Attach smart preview event listeners
    document.querySelectorAll('.btn-smart-preview').forEach(btn => {
      btn.removeEventListener('click', smartPreviewHandler);
      btn.addEventListener('click', smartPreviewHandler);
    });

    // Load more button
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

// ----- "See more" handler -----
function seeMoreHandler(e) {
  const btn = e.currentTarget;
  const descId = btn.getAttribute('data-desc-id');
  const descDiv = document.getElementById(descId);
  if (!descDiv) return;
  const shortSpan = descDiv.querySelector('.desc-short');
  const fullSpan = descDiv.querySelector('.desc-full');
  if (!fullSpan) return;

  if (fullSpan.style.display === 'none') {
    shortSpan.style.display = 'none';
    fullSpan.style.display = 'inline';
    btn.textContent = 'See less';
  } else {
    shortSpan.style.display = 'inline';
    fullSpan.style.display = 'none';
    btn.textContent = 'See more';
  }
}

// ----- Smart Preview Handler -----
async function smartPreviewHandler(e) {
  const btn = e.currentTarget;
  const docId = btn.getAttribute('data-doc-id');
  const searchInput = document.querySelector(`.smart-search[data-doc-id="${docId}"]`);
  const query = searchInput?.value.trim();
  const resultDiv = document.querySelector(`.smart-preview-result[data-doc-id="${docId}"]`);

  if (!query) {
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<span style="color:#f59e0b;">Please enter a question first</span>';
    return;
  }

  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<span class="spinner"></span> Finding relevant section...';
  btn.disabled = true;

  try {
    const response = await fetch(`${window.API_BASE}/documents/smart-preview/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ query })
    });
    const data = await response.json();
    if (response.ok) {
      resultDiv.innerHTML = `<div style="background:#eef2ff; padding:0.5rem; border-radius:12px;">🔍 <strong>Preview:</strong><br>${escapeHtml(data.snippet)}</div>`;
    } else {
      resultDiv.innerHTML = `<span style="color:#dc2626;">${data.error || 'Could not generate preview'}</span>`;
    }
  } catch (err) {
    resultDiv.innerHTML = '<span style="color:#dc2626;">Network error. Try again.</span>';
  } finally {
    btn.disabled = false;
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
loadDocuments();