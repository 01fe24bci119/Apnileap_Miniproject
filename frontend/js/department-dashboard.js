function getDepartmentId() {
  return new URLSearchParams(window.location.search).get('id');
}

let departmentId;
let departmentInfo;
let addThemeModal;
const ADMIN_ROLES = ['PLATFORM_ADMIN', 'GLOBAL_PROGRAMME_LEADER', 'INSTITUTE_ADMIN'];
const MENTOR_UP_ROLES = ['PLATFORM_ADMIN', 'FACULTY_MENTOR', 'DEPARTMENT_HEAD', 'INSTITUTE_ADMIN', 'DEAN_PRINCIPAL', 'GLOBAL_PROGRAMME_LEADER'];

async function loadThemes() {
  const grid = document.getElementById('themeGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="col-12 text-muted">Loading themes…</div>';
  try {
    const { themes } = await Api.get(`/departments/${departmentId}/themes`);
    if (!themes.length) {
      grid.innerHTML = '<div class="col-12 text-muted">No themes added for this department yet. Click <strong>+ Add Theme</strong> to create one.</div>';
      return;
    }
    grid.innerHTML = themes.map((t) => `
      <div class="col-12 col-md-6 col-lg-4">
        <a href="theme-dashboard.html?id=${esc(t.id)}" class="text-decoration-none text-reset d-block h-100">
          <div class="al-theme-block h-100">
            <div>
              <h3 class="al-theme-name mb-1">${esc(t.name)}</h3>
              ${t.description ? `<p class="al-theme-desc">${esc(t.description)}</p>` : ''}
            </div>
            <div class="al-inst-counts mt-3">
              <div class="al-inst-total">
                <span class="al-inst-num">${esc(t.project_count)}</span>
                <span class="al-inst-cap">${Number(t.project_count) === 1 ? 'Project' : 'Projects'}</span>
              </div>
            </div>
          </div>
        </a>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<div class="col-12 text-danger">Failed to load themes: ${esc(err.message)}</div>`;
  }
}


async function init() {
  if (!Api.token()) {
    window.location.href = '../index.html';
    return;
  }

  departmentId = getDepartmentId();
  if (!departmentId) {
    window.location.href = 'dashboard.html';
    return;
  }

  const userChip = document.getElementById('userChip');
  const storedUser = JSON.parse(localStorage.getItem('al_user') || 'null');
  const roles = storedUser?.roles || [];
  const isFacultyOnly = roles.includes('FACULTY_MENTOR') &&
    !roles.some((r) => ['PLATFORM_ADMIN', 'GLOBAL_PROGRAMME_LEADER', 'INSTITUTE_ADMIN', 'DEAN_PRINCIPAL', 'DEPARTMENT_HEAD', 'REVIEWER'].includes(r));
  if (isFacultyOnly) {
    window.location.replace('dashboard.html');
    return;
  }

  if (storedUser) {
    userChip.textContent = `${storedUser.fullName} · ${storedUser.roleNames?.[0] || storedUser.roles?.[0] || ''}`;
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await Api.post('/auth/logout', {}); } catch (e) { /* ignore */ }
    Api.setToken(null);
    localStorage.removeItem('al_user');
    window.location.href = '../index.html';
  });

  const currentUser = storedUser;
  if (currentUser && (currentUser.roles || []).some((r) => ADMIN_ROLES.includes(r))) {
    const navAdmin = document.getElementById('navAdmin');
    if (navAdmin) navAdmin.classList.remove('d-none');
  }

  try {
    const { department } = await Api.get(`/departments/${departmentId}`);
    departmentInfo = department;
    document.getElementById('departmentTitle').textContent = department.name;
    if (roles.includes('DEAN_PRINCIPAL') || roles.includes('READ_ONLY_STAKEHOLDER') || roles.includes('REVIEWER')) {
      document.getElementById('breadcrumb').innerHTML =
        `<a href="dashboard.html">Departments</a> / ${esc(department.name)}`;
    } else {
      document.getElementById('breadcrumb').innerHTML =
        `<a href="dashboard.html">Dashboard</a> / <a href="institute-dashboard.html?id=${esc(department.institute_id)}">${esc(department.institute_name)}</a> / ` +
        esc(department.name);
    }
    document.getElementById('departmentPeople').textContent =
      `Department Head: ${department.head_name || 'Not assigned'} · Programme Coordinator: ${department.coordinator_name || 'Not assigned'}`;
  } catch (err) {
    const grid = document.getElementById('themeGrid');
    if (grid) {
      grid.innerHTML = `<div class="col-12 text-danger">Failed to load department: ${esc(err.message)}</div>`;
    }
    return;
  }

  const canManageThemes = currentUser && (currentUser.roles || []).some((r) => MENTOR_UP_ROLES.includes(r));
  const addThemeBtn = document.getElementById('btnAddTheme');
  if (canManageThemes && addThemeBtn) {
    addThemeBtn.classList.remove('d-none');
    addThemeModal = new bootstrap.Modal(document.getElementById('addThemeModal'));
    addThemeBtn.addEventListener('click', () => {
      document.getElementById('addThemeForm').reset();
      document.getElementById('addThemeSubmit').disabled = false;
      const errEl = document.getElementById('addThemeError');
      errEl.textContent = '';
      errEl.style.display = 'none';
      addThemeModal.show();
    });

    document.getElementById('addThemeSubmit').addEventListener('click', async () => {
      const name = document.getElementById('newThemeTitle').value.trim();
      const description = document.getElementById('newThemeDesc').value.trim();
      const errEl = document.getElementById('addThemeError');
      if (!name) {
        errEl.textContent = 'Theme name is required.';
        errEl.style.display = 'block';
        return;
      }
      const submitBtn = document.getElementById('addThemeSubmit');
      submitBtn.disabled = true;
      try {
        await Api.post(`/departments/${departmentId}/themes`, { name, description });
        addThemeModal.hide();
        await loadThemes();
      } catch (err) {
        submitBtn.disabled = false;
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    });
  }

  await loadThemes();
}

document.addEventListener('DOMContentLoaded', init);
