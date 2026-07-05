/* ============================================================
   app.js - shell, navigation, routing
   ============================================================ */
(function (global) {
  const { el } = App.Util;

  const NAV = [
    { hash: '#/dashboard', label: 'Dashboard', perm: null },
    { hash: '#/mytasks', label: 'My Tasks', perm: null },
    { hash: '#/admin/users', label: 'Users', perm: 'manageUsers', group: 'Admin' },
    { hash: '#/admin/tasks', label: 'Tasks', perm: 'manageTasks', group: 'Admin' },
    { hash: '#/admin/skills', label: 'Skills', perm: 'manageSkills', group: 'Admin' },
    { hash: '#/admin/reports', label: 'Reports', perm: 'viewAllReports', group: 'Admin' },
    { hash: '#/admin/audit', label: 'Audit Log', perm: 'viewAuditLog', group: 'Admin' },
    { hash: '#/admin/settings', label: 'Settings', perm: 'manageSettings', group: 'Admin' }
  ];

  const State = { db: null, user: null };

  function navigate(hash) {
    if (location.hash === hash) { render(); } else { location.hash = hash; }
  }

  function renderShell() {
    const root = document.getElementById('app');
    root.innerHTML = '';
    const user = State.user;

    if (!user) {
      root.appendChild(el('div', { id: 'view' }, []));
      App.ViewsStaff.renderLogin(document.getElementById('view'));
      return;
    }

    const visibleNav = NAV.filter(n => !n.perm || App.Auth.can(user.role, n.perm));
    const mainNav = visibleNav.filter(n => !n.group);
    const adminNav = visibleNav.filter(n => n.group === 'Admin');
    const currentHash = location.hash || '#/dashboard';

    const header = el('header', { class: 'topbar' }, [
      el('div', { class: 'brand' }, ['☕ ' + State.db.settings.cafeName]),
      el('nav', { class: 'nav' }, [
        ...mainNav.map(n => navLink(n, currentHash)),
        adminNav.length ? el('span', { class: 'nav-sep' }, ['Admin']) : null,
        ...adminNav.map(n => navLink(n, currentHash))
      ]),
      el('div', { class: 'user-chip' }, [
        el('span', {}, [user.name + ' · ' + user.role]),
        el('button', {
          class: 'btn btn-sm btn-ghost', onClick: () => {
            App.Storage.addAudit(State.db, user.id, user.name, 'logout', 'Logged out');
            App.Storage.save(State.db);
            App.Auth.logout();
            navigate('#/login');
          }
        }, ['Log out'])
      ])
    ]);

    const view = el('div', { id: 'view', class: 'view' }, []);
    root.appendChild(header);
    root.appendChild(view);

    routeToView(currentHash, view);
  }

  function navLink(n, currentHash) {
    return el('a', { href: n.hash, class: 'nav-link' + (currentHash === n.hash ? ' active' : '') }, [n.label]);
  }

  function routeToView(hash, view) {
    const route = hash.replace('#', '') || '/dashboard';
    if (route === '/dashboard') return App.ViewsStaff.renderDashboard(view);
    if (route === '/mytasks') return App.ViewsStaff.renderMyTasks(view);
    if (route === '/admin/users') return App.ViewsAdmin.renderAdminUsers(view);
    if (route === '/admin/tasks') return App.ViewsAdmin.renderAdminTasks(view);
    if (route === '/admin/skills') return App.ViewsAdmin.renderAdminSkills(view);
    if (route === '/admin/reports') return App.ViewsAdmin.renderAdminReports(view);
    if (route === '/admin/audit') return App.ViewsAdmin.renderAdminAudit(view);
    if (route === '/admin/settings') return App.ViewsAdmin.renderAdminSettings(view);
    view.appendChild(el('div', { class: 'page' }, [el('h1', {}, ['Not found'])]));
  }

  function render() {
    State.db = App.Storage.load();
    State.user = App.Auth.currentUser(State.db);
    if (!State.user && location.hash !== '#/login') {
      location.hash = '#/login';
      return;
    }
    renderShell();
  }

  function init() {
    State.db = App.Storage.load();
    State.user = App.Auth.currentUser(State.db);
    if (!location.hash) location.hash = State.user ? '#/dashboard' : '#/login';
    window.addEventListener('hashchange', render);
    render();
  }

  global.App = global.App || {};
  global.App.State = State;
  global.App.App = { init, render, navigate };
})(window);
