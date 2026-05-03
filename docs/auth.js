document.addEventListener('DOMContentLoaded', () => {
  // ----- REGISTER HANDLER (for register.html) -----
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('fullName').value;
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const role = document.getElementById('role').value;
      try {
        const data = await apiFetch('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ fullName, email, password, role })
        });
        localStorage.setItem('user', JSON.stringify(data.user));
        if (role === 'student') window.location.href = 'student-dashboard.html';
        else if (role === 'tutor') window.location.href = 'tutor-dashboard.html';
        else if (role === 'admin') window.location.href = 'admin-dashboard.html';
        else window.location.href = 'index.html';
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // ----- LOGOUT HANDLER (common for all pages) -----
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      // Call logout endpoint to clear cookies
      await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
      localStorage.clear();
      window.location.href = 'login.html';
    });
  }
});