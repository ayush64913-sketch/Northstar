const navItems = document.querySelectorAll('.nav-item[data-view]');
const views = document.querySelectorAll('.view');
const pageTitle = document.querySelector('#page-title');
const toast = document.querySelector('#toast');
let toastTimer;
let uploadedResumeReady = false;

async function apiRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}

const authModal = document.querySelector('#auth-modal');
const authForm = document.querySelector('#auth-form');
const authSwitch = document.querySelector('#auth-switch');
const authError = document.querySelector('#auth-error');
const authNameField = document.querySelector('.auth-name-field');
const authEyebrow = document.querySelector('#auth-eyebrow');
const authTitle = document.querySelector('#auth-title');
const authSubmit = document.querySelector('.auth-submit');
let authMode = 'login';

function openAuth(mode = 'login') {
  authMode = mode;
  authNameField.hidden = mode !== 'register';
  authEyebrow.textContent = mode === 'register' ? 'GET STARTED' : 'WELCOME BACK';
  authTitle.textContent = mode === 'register' ? 'Build your next move.' : 'Your next move starts here.';
  authSubmit.innerHTML = mode === 'register' ? 'Create account <span>→</span>' : 'Sign in <span>→</span>';
  authSwitch.textContent = mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account';
  authError.textContent = '';
  authModal.classList.add('open');
  authModal.setAttribute('aria-hidden', 'false');
}

function closeAuth() {
  authModal?.classList.remove('open');
  authModal?.setAttribute('aria-hidden', 'true');
}

document.querySelector('.avatar.small')?.addEventListener('click', () => openAuth('login'));
document.querySelector('.icon-button')?.addEventListener('click', () => openAuth('login'));
authSwitch?.addEventListener('click', () => openAuth(authMode === 'login' ? 'register' : 'login'));
document.querySelectorAll('[data-close-auth]').forEach((button) => button.addEventListener('click', closeAuth));
authForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(authForm).entries());
  authError.textContent = '';
  try {
    const result = await apiRequest(`/auth/${authMode === 'register' ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    document.querySelector('.profile-mini strong').textContent = result.user.name;
    document.querySelector('.profile-mini span').textContent = result.user.email;
    closeAuth();
    showToast(authMode === 'register' ? 'Account created. Your workspace is saved locally.' : 'Welcome back.');
  } catch (error) {
    authError.textContent = error.message;
  }
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function switchView(viewName) {
  views.forEach((view) => view.classList.toggle('active-view', view.id === `${viewName}-view`));
  navItems.forEach((item) => item.classList.toggle('active', item.dataset.view === viewName));
  pageTitle.textContent = viewName === 'resume' ? 'Resume studio' : viewName === 'jobs' ? 'Job matches' : viewName === 'applications' ? 'Applications' : viewName === 'letter' ? 'Cover letter' : viewName === 'profile' ? 'Portfolio profile' : 'Overview';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach((item) => item.addEventListener('click', () => switchView(item.dataset.view)));
document.querySelectorAll('[data-view-target]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.viewTarget)));

document.querySelector('#tailor-top').addEventListener('click', () => {
  switchView('jobs');
  showToast('Showing roles with the strongest match for your profile.');
});

document.querySelector('#upload-button').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.doc,.docx';
  input.addEventListener('change', async () => {
    if (!input.files[0]) return;
    const formData = new FormData();
    formData.append('resume', input.files[0]);
    try {
      const result = await apiRequest('/resumes/upload', { method: 'POST', body: formData });
      uploadedResumeReady = true;
      showToast(`${result.resume.filename} uploaded as version ${result.resume.version}.`);
    } catch (error) {
      showToast(error.message);
    }
  });
  input.click();
});

document.querySelector('#scan-button')?.addEventListener('click', async () => {
  try {
    const scanInput = uploadedResumeReady ? {} : { text: document.querySelector('.large-paper')?.textContent || '' };
    const result = await apiRequest('/resumes/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scanInput) });
    const score = document.querySelector('#score-number');
    if (score) score.textContent = result.resume.score;
    showToast(result.message);
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelectorAll('.bookmark').forEach((button, index) => button.addEventListener('click', async () => {
  const isSaved = button.classList.toggle('saved');
  button.textContent = isSaved ? '♥' : '♡';
  const jobIds = ['figma-senior-product-designer', 'linear-growth-product-designer', 'stripe-product-designer'];
  await apiRequest(`/jobs/${jobIds[index]}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved: isSaved }) });
  showToast(isSaved ? 'Role saved to your application tracker.' : 'Role removed from saved jobs.');
}));

document.querySelectorAll('.save-job').forEach((button, index) => button.addEventListener('click', async () => {
  button.textContent = button.textContent === 'Saved' ? 'Save role' : 'Saved';
  button.classList.toggle('saved');
  const jobIds = ['figma-senior-product-designer', 'linear-growth-product-designer', 'stripe-product-designer'];
  await apiRequest(`/jobs/${jobIds[index]}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved: button.classList.contains('saved') }) });
  showToast(button.classList.contains('saved') ? 'Role saved to your application tracker.' : 'Role removed from saved jobs.');
}));

document.querySelectorAll('.filter-chip').forEach((chip) => chip.addEventListener('click', () => {
  document.querySelectorAll('.filter-chip').forEach((item) => item.classList.remove('selected'));
  chip.classList.add('selected');
  showToast(`Filtering by ${chip.textContent.replace(/\d+/g, '').trim()}.`);
}));

document.querySelector('#generate-letter')?.addEventListener('click', async () => {
  try {
    const result = await apiRequest('/letters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: 'figma-senior-product-designer', tone: document.querySelector('.tone.active')?.textContent || 'Direct' }) });
    showToast(`Cover letter saved for ${result.letter.jobId}.`);
  } catch (error) {
    showToast(error.message);
  }
});
document.querySelector('#copy-profile')?.addEventListener('click', async () => {
  const profile = document.querySelector('.profile-body')?.innerText || '';
  try {
    await navigator.clipboard.writeText(profile);
    showToast('README copied to your clipboard.');
  } catch (_error) {
    showToast('README ready to copy from your profile preview.');
  }
});
document.querySelectorAll('.role-select').forEach((role) => role.addEventListener('click', () => {
  document.querySelectorAll('.role-select').forEach((item) => item.classList.remove('active'));
  role.classList.add('active');
  showToast('Draft switched to the selected role.');
}));
document.querySelectorAll('.tone').forEach((tone) => tone.addEventListener('click', () => {
  document.querySelectorAll('.tone').forEach((item) => item.classList.remove('active'));
  tone.classList.add('active');
}));

const careerSignal = document.querySelector('#career-signal');
if (careerSignal && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  careerSignal.addEventListener('pointermove', (event) => {
    const bounds = careerSignal.getBoundingClientRect();
    const rotateX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -10;
    const rotateY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 12;
    careerSignal.style.setProperty('--tilt-x', `${rotateX}deg`);
    careerSignal.style.setProperty('--tilt-y', `${rotateY}deg`);
  });
  careerSignal.addEventListener('pointerleave', () => {
    careerSignal.style.setProperty('--tilt-x', '0deg');
    careerSignal.style.setProperty('--tilt-y', '0deg');
  });
}

function downloadText(filename, content) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.querySelector('.top-action')?.addEventListener('click', () => {
  const search = document.querySelector('.search-field input');
  switchView('jobs');
  search?.focus();
  showToast('Search roles, skills, and companies.');
});
document.querySelector('.notification')?.addEventListener('click', () => showToast('You have 3 updates: 1 interview, 2 new job matches.'));
const pricingModal = document.querySelector('#pricing-modal');
function togglePricing(open) {
  pricingModal?.classList.toggle('open', open);
  pricingModal?.setAttribute('aria-hidden', String(!open));
}
document.querySelector('.upgrade-card button')?.addEventListener('click', () => togglePricing(true));
document.querySelectorAll('[data-close-pricing]').forEach((button) => button.addEventListener('click', () => togglePricing(false)));
document.querySelectorAll('.plan-button').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.plan === 'Starter') {
    togglePricing(false);
    showToast('You are already using the Starter plan.');
    return;
  }
  showToast(`${button.dataset.plan} selected. Razorpay checkout will open here.`);
}));
document.querySelector('.sidebar-bottom .quiet:last-child')?.addEventListener('click', async () => {
  await apiRequest('/auth/logout', { method: 'POST' });
  openAuth('login');
  showToast('You have been signed out.');
});
document.querySelector('.sidebar-bottom .quiet:not(:last-child)')?.addEventListener('click', () => showToast('Help center coming soon.'));

document.querySelectorAll('.secondary-button').forEach((button) => {
  if (!button.textContent.toLowerCase().includes('download') && !button.textContent.toLowerCase().includes('export')) return;
  button.addEventListener('click', () => {
    const source = button.closest('.studio-paper, .letter-paper')?.innerText || 'Northstar document';
    downloadText(button.textContent.includes('Cover') ? 'Northstar_Cover_Letter.txt' : 'Maya_Chen_Resume.txt', source);
    showToast('Document downloaded.');
  });
});

document.querySelector('#applications-view .primary-button')?.addEventListener('click', async () => {
  const company = window.prompt('Company name');
  const title = company && window.prompt('Role title');
  if (!company || !title) return;
  try {
    await apiRequest('/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company, title }) });
    showToast('Application added to your tracker.');
  } catch (error) {
    showToast(error.message);
  }
});
document.querySelector('.profile-insights .outline-button')?.addEventListener('click', () => showToast('Profile editing is ready for your next update.'));
