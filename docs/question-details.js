const urlParams = new URLSearchParams(window.location.search);
const questionId = urlParams.get('id');
let currentUser = null;
let currentQuestion = null;

if (!questionId) { alert('No question specified'); window.location.href = '/'; }

async function loadPage() {
  currentUser = JSON.parse(localStorage.getItem('user'));
  const dashboardLink = document.getElementById('dashboardLink');
  if (currentUser.role === 'student') dashboardLink.href = 'student-dashboard.html';
  else if (currentUser.role === 'tutor') dashboardLink.href = 'tutor-dashboard.html';
  else dashboardLink.href = 'admin-dashboard.html';
  document.getElementById('userName').innerText = currentUser.fullName;
  if (currentUser.avatar) document.getElementById('userAvatar').src = currentUser.avatar;

  await loadQuestion();
  if (currentUser.role === 'student' && currentQuestion.status === 'pending') await loadBids();
  await loadComments();
  checkSpecialActions();
}

async function loadQuestion() {
  try {
    currentQuestion = await apiFetch(`/questions/${questionId}`);
    let filesHtml = '', answerHtml = '';
    if (currentQuestion.files?.length) {
      filesHtml = '<p><strong>Attached files:</strong></p><ul>';
      currentQuestion.files.forEach(url => filesHtml += `<li><a href="${escapeHtml(url)}" target="_blank">Download</a></li>`);
      filesHtml += '</ul>';
    }
    if (currentQuestion.answerFile) {
      answerHtml = `<p><strong>Answer:</strong> <a href="${escapeHtml(currentQuestion.answerFile)}" target="_blank">Download answer</a></p>`;
    }
    document.getElementById('questionDetails').innerHTML = `
      <h2>${escapeHtml(currentQuestion.title)}</h2>
      <p>${escapeHtml(currentQuestion.description)}</p>
      <p><strong>Budget:</strong> $${currentQuestion.budget} | <strong>Status:</strong> ${escapeHtml(currentQuestion.status)}</p>
      <p><strong>Category:</strong> ${escapeHtml(currentQuestion.category)} | <strong>Deadline:</strong> ${new Date(currentQuestion.deadline).toLocaleString()}</p>
      ${filesHtml} ${answerHtml}
    `;
  } catch (err) { console.error(err); document.getElementById('questionDetails').innerHTML = `<p class="error">Error loading question</p>`; }
}

async function loadBids() { /* same as original */ }
async function loadComments() { /* same as original */ }
window.acceptBid = async (bidId, bidAmount, event) => { /* same */ };
function checkSpecialActions() { /* same */ }
async function requestAdditionalFunds() { /* same */ }
async function cancelAssignment() { /* same */ }
async function respondToFundsRequest(accept) { /* same */ }
window.deleteComment = async (commentId) => { /* same */ };

document.getElementById('postCommentBtn').addEventListener('click', async () => { /* same */ });

loadPage();