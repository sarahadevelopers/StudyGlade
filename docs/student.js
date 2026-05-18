// Guard to prevent duplicate execution
if (window.studentDashboardLoaded) {
  console.warn('student.js already loaded, skipping duplicate');
} else {
  window.studentDashboardLoaded = true;

  // ---------- Helper: escape HTML ----------
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  // ---------- Update User Menu (avatar, name, dropdown) ----------
  function updateUserMenu(user) {
    const userNameSpan = document.querySelector('.user-name');
    const userAvatarImg = document.querySelector('.user-avatar');
    if (userNameSpan) userNameSpan.innerText = user.fullName;
    if (userAvatarImg) {
      let avatarUrl = user.avatar;
      if (!avatarUrl) {
        const id = Math.floor(Math.random() * 100);
        if (user.gender === 'female') avatarUrl = `https://randomuser.me/api/portraits/women/${id}.jpg`;
        else if (user.gender === 'male') avatarUrl = `https://randomuser.me/api/portraits/men/${id}.jpg`;
        else avatarUrl = `https://randomuser.me/api/portraits/lego/${id}.jpg`;
      }
      userAvatarImg.src = avatarUrl;
    }
  }

  // ---------- User Dropdown Toggle ----------
  function ensureUserDropdown() {
    let dropdown = document.querySelector('.user-dropdown');
    if (!dropdown) {
      const menu = document.querySelector('.user-menu');
      if (!menu) return;
      dropdown = document.createElement('div');
      dropdown.className = 'user-dropdown';
      dropdown.innerHTML = `
        <a href="#" onclick="openAvatarModal(); return false;">Change Avatar</a>
        <a href="#" onclick="logoutUser(); return false;">Logout</a>
      `;
      menu.appendChild(dropdown);
    }
    return dropdown;
  }

  function toggleUserMenu(event) {
    event.stopPropagation();
    ensureUserDropdown();
    const menu = document.querySelector('.user-menu');
    if (menu) menu.classList.toggle('active');
  }

  function logoutUser() {
    localStorage.clear();
    window.location.href = 'login.html';
  }

  document.addEventListener('click', function(e) {
    const menu = document.querySelector('.user-menu');
    if (menu && !menu.contains(e.target)) {
      menu.classList.remove('active');
    }
  });

  // ---------- Global variables for pagination ----------
  let allCompletedQuestions = [];
  let completedDisplayCount = 10;

  // ---------- Load Student Dashboard ----------
  async function loadStudentDashboard() {
    if (window.location.search.includes('walletUpdated=true')) {
      window.history.replaceState({}, document.title, window.location.pathname);
      window.location.reload();
      return;
    }

    let user;
    try {
      user = await apiFetch('/auth/me?_=' + Date.now());
      console.log('🔍 /auth/me response:', user);
      if (user && user.id) {
        localStorage.setItem('user', JSON.stringify(user));
      } else {
        throw new Error('Invalid user response');
      }
    } catch (err) {
      console.warn('Failed to fetch user, using localStorage fallback:', err);
      user = JSON.parse(localStorage.getItem('user'));
      if (!user || !user.id) {
        localStorage.clear();
        window.location.href = 'login.html';
        return;
      }
    }

    updateUserMenu(user);
    if (typeof window.initSocket === 'function') window.initSocket();

    const walletEl = document.getElementById('walletBalance');
    if (walletEl) walletEl.innerText = `$${user.walletBalance?.toFixed(2) || '0.00'}`;

    const questions = await apiFetch('/questions/my-questions');
    const active = questions.filter(q => q.status !== 'completed');
    const completed = questions.filter(q => q.status === 'completed');
    allCompletedQuestions = completed;

    document.getElementById('activeCount').innerText = active.length;
    document.getElementById('completedCount').innerText = completed.length;
    document.getElementById('activeBadge').innerText = active.length;

    const totalQuestions = active.length + completed.length;
    const successRate = totalQuestions === 0 ? 0 : Math.round((completed.length / totalQuestions) * 100);
    document.getElementById('successRate').innerText = `${successRate}%`;

    renderActiveQuestions(active);
    renderCompletedQuestions();
    const loadMoreBtn = document.getElementById('loadMoreCompletedBtn');
    if (loadMoreBtn) {
      loadMoreBtn.style.display = completedDisplayCount < allCompletedQuestions.length ? 'inline-block' : 'none';
    }

    await checkForSuggestions(questions);
    await checkForFundsRequests(questions);
  }

  window.addEventListener('pageshow', function(event) {
    if (event.persisted) {
      console.log('Page restored from bfcache – reloading dashboard');
      loadStudentDashboard();
    }
  });

  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      apiFetch('/auth/me').then(user => {
        if (user && user.walletBalance !== undefined) {
          const storedUser = JSON.parse(localStorage.getItem('user'));
          if (storedUser) {
            storedUser.walletBalance = user.walletBalance;
            localStorage.setItem('user', JSON.stringify(storedUser));
            const walletSpan = document.getElementById('walletBalance');
            if (walletSpan) walletSpan.innerText = `$${user.walletBalance.toFixed(2)}`;
          }
        }
      }).catch(err => console.warn('Failed to refresh wallet:', err));
    }
  });

  // ---------- Render Active Questions ----------
  function renderActiveQuestions(active) {
    const activeTable = document.getElementById('activeQuestions');
    if (!activeTable) return;
    activeTable.innerHTML = '';
    for (const q of active) {
      const row = createQuestionRow(q, false);
      activeTable.innerHTML += row;
    }
  }

  // ---------- Render Completed Questions (paginated) ----------
  function renderCompletedQuestions(reset = true) {
    const completedTable = document.getElementById('completedQuestions');
    if (!completedTable) return;
    if (reset) completedTable.innerHTML = '';
    const toShow = allCompletedQuestions.slice(0, completedDisplayCount);
    for (const q of toShow) {
      const row = createQuestionRow(q, true);
      completedTable.innerHTML += row;
    }
    const loadMoreBtn = document.getElementById('loadMoreCompletedBtn');
    if (loadMoreBtn) {
      loadMoreBtn.style.display = completedDisplayCount < allCompletedQuestions.length ? 'inline-block' : 'none';
    }
  }

  function loadMoreCompleted() {
    completedDisplayCount += 10;
    renderCompletedQuestions(false);
  }

  // ---------- Create a single table row ----------
  function createQuestionRow(q, isCompleted) {
    const safeTitle = escapeHtml(q.title);
    let subject = 'General';
    if (q.subcategory && q.subcategory !== 'Other') {
      subject = escapeHtml(q.subcategory);
    } else if (q.category && q.category !== 'Other') {
      subject = escapeHtml(q.category);
    } else if (q.subject) {
      subject = escapeHtml(q.subject);
    }
    const budget = `$${q.budget}`;
    const tutor = q.tutorId || null;
    const tutorName = tutor ? escapeHtml(tutor.fullName) : 'Not assigned';
    const tutorRating = tutor?.tutorProfile?.rating ? tutor.tutorProfile.rating.toFixed(1) : '0.0';
    let tutorAvatar = tutor?.avatar;
    if (!tutorAvatar) {
      const id = Math.floor(Math.random() * 100);
      if (tutor?.gender === 'female') tutorAvatar = `https://randomuser.me/api/portraits/women/${id}.jpg`;
      else if (tutor?.gender === 'male') tutorAvatar = `https://randomuser.me/api/portraits/men/${id}.jpg`;
      else tutorAvatar = `https://randomuser.me/api/portraits/lego/${id}.jpg`;
    }

    let statusText = '', statusClass = '';
    if (q.status === 'pending') {
      statusText = 'Awaiting Response';
      statusClass = 'status-awaiting';
    } else if (q.status === 'assigned') {
      statusText = 'Assigned';
      statusClass = 'status-progress';
    } else if (q.status === 'in_progress') {
      statusText = 'In Progress';
      statusClass = 'status-progress';
    } else if (q.status === 'overdue') {
      statusText = 'Overdue';
      statusClass = 'status-overdue';
    } else if (q.status === 'completed') {
      statusText = 'Completed';
      statusClass = 'status-completed';
    } else {
      statusText = escapeHtml(q.status);
      statusClass = 'status-awaiting';
    }

    const tutorHtml = `
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <img src="${tutorAvatar}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
        <div>
          <div><strong>${tutorName}</strong></div>
          <div style="font-size: 0.7rem; color: #F59E0B;"><i class="fas fa-star"></i> ${tutorRating}</div>
        </div>
      </div>
    `;

    if (!isCompleted) {
      const actionBtn = `<button class="btn-sm" onclick="window.location.href='question-details.html?id=${q._id}'">View Details</button>`;
      return `<tr><td><i class="fas fa-file-alt" style="margin-right: 8px; color: #005BFF;"></i> ${safeTitle}</td><td>${tutorHtml}</td><td>${subject}</td><td>${budget}</td><td><span class="status-badge ${statusClass}">${statusText}</span></td><td>${actionBtn}</td></tr>`;
    } else {
      // Handle answer files (multiple or single)
      let answerButtons = '';
      if (q.answerFiles && q.answerFiles.length > 0) {
        // Multiple files – display all as download links
        answerButtons = `<div class="answer-files" style="display: flex; flex-wrap: wrap; gap: 0.5rem;">`;
        q.answerFiles.forEach((fileUrl, idx) => {
          const fileName = q.answerFileNames?.[idx] || `file_${idx+1}`;
          answerButtons += `<a href="${fileUrl}" target="_blank" class="btn-sm btn-outline-sm" style="margin-right:0;">📎 ${escapeHtml(fileName)}</a>`;
        });
        answerButtons += `</div>`;
      } else if (q.answerFile) {
        // Single file (legacy)
        answerButtons = `<a href="${q.answerFile}" target="_blank" class="btn-sm btn-outline-sm">📎 ${escapeHtml(q.answerFileName || 'Download Answer')}</a>`;
      } else {
        answerButtons = '<span class="disabled">No answer</span>';
      }

      const rateBtn = `<button class="btn-sm" style="margin-left:0.5rem;" onclick="showRatingModal('${q._id}', '${tutorName}')">${q.rating && q.rating.score ? 'Change Rating' : 'Rate Tutor'}</button>`;
      const ratingStars = q.rating && q.rating.score
        ? `<span style="color: #F59E0B;">${'★'.repeat(q.rating.score)}${'☆'.repeat(5 - q.rating.score)}</span>`
        : 'Not rated';
      return `<tr><td style="vertical-align: top;"><i class="fas fa-file-alt" style="margin-right: 8px; color: #005BFF;"></i> ${safeTitle}</td><td style="vertical-align: top;">${subject}</td><td style="vertical-align: top;">${tutorHtml}</td><td style="vertical-align: top;">${budget}</td><td style="vertical-align: top;">${ratingStars}</td><td style="vertical-align: top;">${answerButtons}<br>${rateBtn}</td></tr>`;
    }
  }

  // ---------- RATING MODAL ----------
  let currentRatingQuestionId = null;
  let selectedRatingValue = 0;

  window.showRatingModal = function(questionId, tutorName) {
    currentRatingQuestionId = questionId;
    selectedRatingValue = 0;
    document.getElementById('ratingModalTutorName').innerText = tutorName;
    document.getElementById('ratingModal').style.display = 'flex';
    document.getElementById('ratingFeedback').value = '';
    document.querySelectorAll('#ratingModal .star').forEach(star => star.classList.remove('selected'));
  };

  document.getElementById('ratingModal')?.addEventListener('click', (e) => {
    const star = e.target.closest('.star');
    if (!star) return;
    const value = parseInt(star.getAttribute('data-value'));
    selectedRatingValue = value;
    const allStars = document.querySelectorAll('#ratingModal .star');
    allStars.forEach((s, idx) => {
      if (idx < value) s.classList.add('selected');
      else s.classList.remove('selected');
    });
  });

  window.submitRating = async function() {
    if (selectedRatingValue === 0) {
      showToast('Select a star rating', 'error');
      return;
    }
    const feedback = document.getElementById('ratingFeedback').value;
    const score = selectedRatingValue;
    try {
      await apiFetch(`/questions/${currentRatingQuestionId}/rate`, {
        method: 'POST',
        body: JSON.stringify({ score, feedback })
      });
      showToast('Rating submitted!', 'success');
      document.getElementById('ratingModal').style.display = 'none';
      loadStudentDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.closeRatingModal = function() {
    document.getElementById('ratingModal').style.display = 'none';
  };

  // ---------- Additional Funds Request ----------
  async function checkForFundsRequests(questions) {
    for (const q of questions) {
      const req = q.additionalFundsRequest;
      if (req && req.status === 'pending' && req.requestedAt) {
        if (document.getElementById(`funds-banner-${q._id}`)) continue;
        const banner = document.createElement('div');
        banner.id = `funds-banner-${q._id}`;
        banner.className = 'card';
        banner.style.backgroundColor = '#fff3cd';
        banner.style.borderLeft = '4px solid #ffc107';
        banner.style.marginBottom = '1rem';
        const amount = (req.amount !== undefined && req.amount !== null) ? req.amount : '?';
        banner.innerHTML = `
          <strong>💰 Additional funds request for "${escapeHtml(q.title)}"</strong><br>
          Tutor requests <strong>$${amount}</strong> extra.<br>
          Reason: ${escapeHtml(req.reason)}<br>
          <button onclick="respondToFunds('${q._id}', true)" class="btn">✅ Approve & Pay</button>
          <button onclick="respondToFunds('${q._id}', false)" class="btn-outline">❌ Reject</button>
        `;
        const container = document.querySelector('.dashboard-container') || document.querySelector('.container');
        if (container && container.firstChild) {
          container.insertBefore(banner, container.firstChild);
        } else if (container) {
          container.appendChild(banner);
        }
      }
    }
  }

  window.respondToFunds = async function(questionId, accept) {
    try {
      await apiFetch(`/questions/${questionId}/respond-funds-request`, {
        method: 'POST',
        body: JSON.stringify({ accept })
      });
      showToast(accept ? 'Additional funds added' : 'Request rejected', 'success');
      location.reload();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

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
        const container = document.querySelector('.container');
        if (container && container.firstChild) {
          container.insertBefore(banner, container.firstChild);
        } else if (container) {
          container.appendChild(banner);
        } else {
          console.warn('Container not found, cannot insert budget suggestion banner');
        }
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

  // ---------- Add Funds with Paystack ----------
  async function addFunds(event) {
    const amount = prompt('Enter amount to add ($):');
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      showToast('Please enter a valid positive amount.', 'error');
      return;
    }
    try {
      const btn = event?.target;
      if (btn) btn.disabled = true;
      const urlParams = new URLSearchParams(window.location.search);
      const returnTo = urlParams.get('returnTo');
      if (returnTo) sessionStorage.setItem('pendingReturnTo', returnTo);
      const { url } = await apiFetch('/wallet/paystack/initialize', {
        method: 'POST',
        body: JSON.stringify({ amount: parseFloat(amount) })
      });
      window.location.href = url;
    } catch (err) {
      showToast(err.message, 'error');
      if (btn) btn.disabled = false;
    }
  }

  // ---------- Handle Payment Return ----------
  async function handlePaymentReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');
    const trxref = urlParams.get('trxref');
    const pendingReturnTo = sessionStorage.getItem('pendingReturnTo');
    if ((reference || trxref) && pendingReturnTo) {
      showToast('Payment successful! Redirecting...', 'success');
      sessionStorage.removeItem('pendingReturnTo');
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => { window.location.href = pendingReturnTo; }, 1500);
    }
  }

  // ---------- Transaction History ----------
  let transactionPage = 1;
  let transactionHasMore = true;

  async function loadTransactionHistory(reset = true) {
    if (reset) {
      transactionPage = 1;
      transactionHasMore = true;
      const list = document.getElementById('transactionList');
      if (list) list.innerHTML = '';
    }
    if (!transactionHasMore) return;
    try {
      const data = await apiFetch(`/wallet?page=${transactionPage}&limit=10`);
      const list = document.getElementById('transactionList');
      if (!list) return;
      if (!data.transactions || data.transactions.length === 0) {
        if (transactionPage === 1) list.innerHTML = '<p>No transactions yet.</p>';
        transactionHasMore = false;
        return;
      }
      const html = data.transactions.map(t => `
        <div class="transaction-item">
          <div class="transaction-header">
            <span class="transaction-type">${t.type}</span>
            <span class="transaction-amount ${t.amount > 0 ? 'positive' : 'negative'}">
              ${t.amount > 0 ? '+' : '-'}$${Math.abs(t.amount).toFixed(2)}
            </span>
          </div>
          <div class="transaction-description">${escapeHtml(t.description)}</div>
          <div class="transaction-date">${new Date(t.createdAt).toLocaleString()}</div>
        </div>
      `).join('');
      if (reset) list.innerHTML = `<div class="transaction-list">${html}</div>`;
      else list.innerHTML += html;
      transactionHasMore = transactionPage < data.pagination.pages;
      transactionPage++;
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  window.showTransactionHistory = async function() {
    await loadTransactionHistory(true);
    const modal = document.getElementById('transactionModal');
    if (modal) modal.style.display = 'flex';
  };
  window.closeTransactionModal = function() {
    const modal = document.getElementById('transactionModal');
    if (modal) modal.style.display = 'none';
  };
  document.getElementById('loadMoreTransactions')?.addEventListener('click', () => loadTransactionHistory(false));

  // ---------- Polling for suggestions & funds requests ----------
  setInterval(async () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.role === 'student') {
      try {
        const questions = await apiFetch('/questions/my-questions');
        await checkForSuggestions(questions);
        await checkForFundsRequests(questions);
      } catch (err) {
        console.error('Polling error:', err);
      }
    }
  }, 30000);

  // ========== AVATAR UPLOAD ==========
  const avatarModal = document.getElementById('avatarUploadModal');
  function openAvatarModal() {
    if (avatarModal) avatarModal.style.display = 'flex';
  }
  function closeAvatarModal() {
    if (avatarModal) avatarModal.style.display = 'none';
  }
  window.openAvatarModal = openAvatarModal;
  window.closeAvatarModal = closeAvatarModal;

  async function uploadAvatar() {
    const fileInput = document.getElementById('avatarFile');
    const file = fileInput.files[0];
    if (!file) {
      showToast('Please select an image', 'error');
      return;
    }
    const formData = new FormData();
    formData.append('avatar', file);
    const btn = document.querySelector('#avatarUploadModal .btn-primary');
    if (!btn) return;
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Uploading...';
    try {
      const response = await fetch('/api/auth/avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await response.json();
      if (response.ok) {
        showToast('Avatar updated successfully', 'success');
        const user = JSON.parse(localStorage.getItem('user'));
        user.avatar = data.avatarUrl;
        localStorage.setItem('user', JSON.stringify(user));
        const avatarImg = document.querySelector('.user-avatar');
        if (avatarImg) avatarImg.src = data.avatarUrl;
        closeAvatarModal();
      } else {
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    } finally {
      btn.disabled = false;
      btn.innerText = originalText;
      if (fileInput) fileInput.value = '';
    }
  }
  window.uploadAvatar = uploadAvatar;

  // ========== NOTIFICATION SOUND CONTROL ==========
  let notificationSoundEnabled = localStorage.getItem('notificationSound') !== 'false';
  const audio = new Audio('/sounds/notification.mp3');

  function playNotificationSound() {
    if (!notificationSoundEnabled) return;
    audio.play().catch(() => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.frequency.value = 800;
        gain.gain.value = 0.5;
        oscillator.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
        oscillator.stop(ctx.currentTime + 0.5);
      } catch(e) {}
    });
  }

  const soundToggle = document.getElementById('notificationSoundToggle');
  if (soundToggle) {
    function updateSoundToggleUI() {
      if (notificationSoundEnabled) {
        soundToggle.classList.remove('muted');
        soundToggle.innerHTML = '<i class="fas fa-volume-up"></i>';
      } else {
        soundToggle.classList.add('muted');
        soundToggle.innerHTML = '<i class="fas fa-volume-mute"></i>';
      }
    }
    soundToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      notificationSoundEnabled = !notificationSoundEnabled;
      localStorage.setItem('notificationSound', notificationSoundEnabled);
      updateSoundToggleUI();
      if (notificationSoundEnabled) playNotificationSound();
    });
    updateSoundToggleUI();
  }

  // ========== NOTIFICATIONS DROPDOWN ==========
  const notificationBell = document.querySelector('.notification-bell');
  let notificationDropdown = null;
  let notificationPage = 1;
  let notificationHasMore = true;
  let isLoadingNotifications = false;

  function createNotificationDropdown() {
    if (notificationDropdown) return;
    notificationDropdown = document.createElement('div');
    notificationDropdown.className = 'notification-dropdown';
    notificationDropdown.innerHTML = `
      <div class="notification-header">Recent Notifications</div>
      <div class="notification-list" id="notificationListDropdown">Loading...</div>
      <div class="notification-footer">
        <a href="#" onclick="markAllRead(event); return false;">Mark all as read</a>
        <button id="loadMoreNotifications" class="load-more-btn" style="display: none;">Load more</button>
      </div>
    `;
    document.body.appendChild(notificationDropdown);
  }

  async function loadNotificationsDropdown(reset = true) {
    if (isLoadingNotifications) return;
    isLoadingNotifications = true;
    if (!notificationDropdown) createNotificationDropdown();
    const listDiv = notificationDropdown.querySelector('.notification-list');
    if (reset) {
      notificationPage = 1;
      notificationHasMore = true;
      listDiv.innerHTML = '<div class="notification-item">Loading...</div>';
    }
    try {
      const res = await fetch(`/api/notifications?limit=10&page=${notificationPage}`, { credentials: 'include' });
      const data = await res.json();
      let html = '';
      if (data.notifications.length === 0 && reset) {
        html = '<div class="notification-item no-notifications">No notifications</div>';
        notificationHasMore = false;
      } else {
        data.notifications.forEach(n => {
          html += `<div class="notification-item" data-id="${n._id}">
                     <strong>${escapeHtml(n.title)}</strong><br>
                     ${escapeHtml(n.message)}
                     <div class="notification-time">${new Date(n.createdAt).toLocaleString()}</div>
                   </div>`;
        });
        notificationHasMore = data.pagination && notificationPage < data.pagination.pages;
      }
      if (reset) {
        listDiv.innerHTML = html;
      } else {
        listDiv.insertAdjacentHTML('beforeend', html);
      }
      const loadMoreBtn = notificationDropdown.querySelector('#loadMoreNotifications');
      if (loadMoreBtn) {
        loadMoreBtn.style.display = notificationHasMore ? 'inline-block' : 'none';
      }
    } catch (err) {
      listDiv.innerHTML = '<div class="notification-item error">Failed to load</div>';
    } finally {
      isLoadingNotifications = false;
    }
  }

  async function loadMoreNotifications() {
    if (!notificationHasMore || isLoadingNotifications) return;
    notificationPage++;
    await loadNotificationsDropdown(false);
  }

  async function toggleNotificationDropdown(event) {
    event.stopPropagation();
    if (!notificationDropdown) createNotificationDropdown();
    const isVisible = notificationDropdown.style.display === 'block';
    if (isVisible) {
      notificationDropdown.style.display = 'none';
    } else {
      await loadNotificationsDropdown(true);
      notificationDropdown.style.display = 'block';
      const loadMoreBtn = notificationDropdown.querySelector('#loadMoreNotifications');
      if (loadMoreBtn && !loadMoreBtn.hasListener) {
        loadMoreBtn.addEventListener('click', loadMoreNotifications);
        loadMoreBtn.hasListener = true;
      }
    }
  }

  async function markAllRead(event) {
    if (event) event.preventDefault();
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'PUT',
        credentials: 'include'
      });
      if (res.ok) {
        showToast('All notifications marked as read', 'info');
        const badge = document.querySelector('.notification-bell .badge');
        if (badge) badge.innerText = '0';
        if (notificationDropdown && notificationDropdown.style.display === 'block') {
          loadNotificationsDropdown(true);
        }
      } else {
        showToast('Failed to mark as read', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  }

  function closeNotificationDropdown() {
    if (notificationDropdown) notificationDropdown.style.display = 'none';
  }

  document.addEventListener('click', function(e) {
    if (notificationDropdown && !notificationDropdown.contains(e.target) && !e.target.closest('.notification-bell')) {
      notificationDropdown.style.display = 'none';
    }
  });

  if (notificationBell) {
    notificationBell.addEventListener('click', toggleNotificationDropdown);
  }

  window.markAllRead = markAllRead;
  window.loadMoreNotifications = loadMoreNotifications;

  // ========== UNREAD COUNT WITH SOUND ==========
  let lastUnreadCount = 0;

  async function updateUnreadCountAndSound() {
    try {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
      const data = await res.json();
      const currentCount = data.count;
      if (currentCount > lastUnreadCount && notificationSoundEnabled) {
        playNotificationSound();
      }
      lastUnreadCount = currentCount;
      const badge = document.querySelector('.notification-bell .badge');
      if (badge) badge.innerText = currentCount > 9 ? '9+' : currentCount;
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }

  updateUnreadCountAndSound();
  setInterval(updateUnreadCountAndSound, 30000);

  // ========== EVENT LISTENERS ==========
  document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('addFundsBtn');
    if (addBtn && typeof addFunds === 'function') addBtn.addEventListener('click', addFunds);
    const loadMoreBtn = document.getElementById('loadMoreCompletedBtn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMoreCompleted);
    loadStudentDashboard();
    handlePaymentReturn();
  });

  window.toggleUserMenu = toggleUserMenu;
  window.logoutUser = logoutUser;
}


  // Dynamic copyright year (2015 - current)
const yearSpan = document.getElementById('currentYear');
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}

