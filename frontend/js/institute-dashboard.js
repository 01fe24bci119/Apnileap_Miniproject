function getInstituteId() {
  return new URLSearchParams(window.location.search).get('id');
}

async function init() {
  if (!Api.token()) {
    window.location.href = '../index.html';
    return;
  }

  const instituteId = getInstituteId();
  if (!instituteId) {
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
    if ((storedUser.roles || []).some((r) => ['PLATFORM_ADMIN', 'GLOBAL_PROGRAMME_LEADER', 'INSTITUTE_ADMIN'].includes(r))) {
      document.getElementById('navAdmin').classList.remove('d-none');
    }
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await Api.post('/auth/logout', {}); } catch (e) { /* ignore */ }
    Api.setToken(null);
    localStorage.removeItem('al_user');
    window.location.href = '../index.html';
  });

  try {
    const [instResp, totalsResp, deptResp] = await Promise.all([
      Api.get(`/institutes/${instituteId}`),
      Api.get(`/dashboard/institute/${instituteId}`),
      Api.get(`/institutes/${instituteId}/departments`),
    ]);

    document.getElementById('instituteName').textContent = instResp.institute.name;
    document.getElementById('instituteTitle').textContent = instResp.institute.name;

    const totals = totalsResp.totals;
    const departments = deptResp.departments;


    const rows = departments.map((d) => `
      <tr>
        <td><a href="department-dashboard.html?id=${esc(d.id)}"><strong>${esc(d.name)}</strong></a> <span class="text-muted">(${esc(d.code)})</span></td>
        <td>${d.head_name ? esc(d.head_name) : '<span class="text-muted">Not assigned</span>'}</td>
        <td class="text-end">${esc(d.project_count)}</td>
      </tr>`);

    document.getElementById('departmentTableBody').innerHTML =
      rows.length ? rows.join('') : '<tr><td colspan="3" class="text-muted">No departments found.</td></tr>';
  } catch (err) {
    document.getElementById('departmentTableBody').innerHTML =
      `<tr><td colspan="3" class="text-danger">Failed to load institute: ${esc(err.message)}</td></tr>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
