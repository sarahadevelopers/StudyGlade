// find-tutors.js – Load and display tutors with pagination & filters

let currentPage = 1;
let totalPages = 1;
let currentFilters = {
  search: '',
  subject: '',
  level: ''
};

async function loadTutors() {
  const tutorsGrid = document.getElementById('tutorsGrid');
  tutorsGrid.innerHTML = '<div class="loading-state">Loading tutors...</div>';
  
  try {
    // Build query string
    const params = new URLSearchParams();
    params.append('role', 'tutor');
    params.append('isApproved', 'true');
    params.append('page', currentPage);
    params.append('limit', '12');
    if (currentFilters.search) params.append('search', currentFilters.search);
    if (currentFilters.subject) params.append('subject', currentFilters.subject);
    if (currentFilters.level) params.append('level', currentFilters.level);
    
   const res = await apiFetch(`/api/admin/public/tutors?${params.toString()}`);
    const tutors = res.users || [];
    totalPages = res.pagination?.pages || 1;
    
    if (tutors.length === 0) {
      tutorsGrid.innerHTML = '<div class="no-results">No tutors found. Try adjusting your filters.</div>';
      document.getElementById('paginationContainer').innerHTML = '';
      return;
    }
    
    tutorsGrid.innerHTML = '';
    tutors.forEach(tutor => {
      const card = document.createElement('div');
      card.className = 'tutor-card';
      
      // Generate avatar
      let avatar = tutor.avatar;
      if (!avatar) {
        const id = Math.floor(Math.random() * 100);
        if (tutor.gender === 'female') avatar = `https://randomuser.me/api/portraits/women/${id}.jpg`;
        else if (tutor.gender === 'male') avatar = `https://randomuser.me/api/portraits/men/${id}.jpg`;
        else avatar = `https://randomuser.me/api/portraits/lego/${id}.jpg`;
      }
      
      const rating = tutor.tutorProfile?.rating?.toFixed(1) || '0.0';
      const subjects = tutor.tutorProfile?.subjects || [];
      const bio = tutor.tutorProfile?.bio || 'Experienced tutor passionate about helping students succeed.';
      
      card.innerHTML = `
        <div class="tutor-header">
          <img src="${avatar}" alt="${escapeHtml(tutor.fullName)}" class="tutor-avatar">
          <div class="tutor-info">
            <div class="tutor-name">${escapeHtml(tutor.fullName)}</div>
            <div class="tutor-rating">
              <i class="fas fa-star"></i> <span>${rating} (${tutor.tutorProfile?.completedQuestions || 0} lessons)</span>
            </div>
          </div>
        </div>
        <div class="tutor-subjects">
          ${subjects.slice(0, 3).map(s => `<span class="subject-badge">${escapeHtml(s)}</span>`).join('')}
          ${subjects.length > 3 ? `<span class="subject-badge">+${subjects.length - 3}</span>` : ''}
        </div>
        <div class="tutor-bio">${escapeHtml(bio.substring(0, 100))}${bio.length > 100 ? '...' : ''}</div>
        <div class="tutor-contact">
          <button class="contact-btn" data-id="${tutor._id}"><i class="fas fa-comment"></i> Contact</button>
        </div>
      `;
      tutorsGrid.appendChild(card);
    });
    
    // Attach contact button events (placeholder)
    document.querySelectorAll('.contact-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tutorId = btn.getAttribute('data-id');
        // For now, show a toast – later you can implement a chat modal or redirect to messages page
        showToast('Messaging system coming soon!', 'info');
      });
    });
    
    renderPagination();
  } catch (err) {
    console.error(err);
    tutorsGrid.innerHTML = '<div class="no-results">Failed to load tutors. Please try again later.</div>';
  }
}

function renderPagination() {
  const container = document.getElementById('paginationContainer');
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  container.innerHTML = html;
  document.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.getAttribute('data-page'));
      loadTutors();
    });
  });
}

// Filter event listeners
document.getElementById('searchInput')?.addEventListener('input', (e) => {
  currentFilters.search = e.target.value;
  currentPage = 1;
  loadTutors();
});
document.getElementById('subjectFilter')?.addEventListener('change', (e) => {
  currentFilters.subject = e.target.value;
  currentPage = 1;
  loadTutors();
});
document.getElementById('levelFilter')?.addEventListener('change', (e) => {
  currentFilters.level = e.target.value;
  currentPage = 1;
  loadTutors();
});
document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
  currentFilters = { search: '', subject: '', level: '' };
  document.getElementById('searchInput').value = '';
  document.getElementById('subjectFilter').value = '';
  document.getElementById('levelFilter').value = '';
  currentPage = 1;
  loadTutors();
});

// Initial load
document.addEventListener('DOMContentLoaded', () => {
  loadTutors();
  // Update user name/avatar if logged in
  const user = JSON.parse(localStorage.getItem('user'));
  if (user && user.fullName) {
    document.querySelector('.user-name').innerText = user.fullName;
    let avatar = user.avatar;
    if (!avatar) {
      const id = Math.floor(Math.random() * 100);
      if (user.gender === 'female') avatar = `https://randomuser.me/api/portraits/women/${id}.jpg`;
      else if (user.gender === 'male') avatar = `https://randomuser.me/api/portraits/men/${id}.jpg`;
      else avatar = `https://randomuser.me/api/portraits/lego/${id}.jpg`;
    }
    document.querySelector('.user-avatar').src = avatar;
  }
});

// Helper function (already in api.js, but just in case)
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}