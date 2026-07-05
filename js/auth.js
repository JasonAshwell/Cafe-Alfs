/* ============================================================
   auth.js - login/session + role permission model

   SECURITY MODEL (see README.md for full detail):
     Admin      - full access: users, tasks, skills, settings, reports, audit log
     Manager    - manage tasks & skills, manage Staff/Supervisor users
                  (not Admin accounts), view all reports, complete tasks
     Supervisor - view all tasks/reports (read-only on task/user setup),
                  complete own eligible tasks, verify/complete on behalf
                  of other staff (e.g. countersigning)
     Staff      - view & complete only their own eligible tasks
                  (must meet the task's minimum age + required skills),
                  view only their own completion history

   NOTE: because this prototype has no server, permission checks
   below control what the UI *shows*, but a technically capable
   user could bypass them via the browser console. That is fine
   for reviewing the design locally, but this must move to a real
   backend (e.g. Supabase with Row Level Security) before it is
   used for genuine multi-user access control. See README.md.
   ============================================================ */
(function (global) {
  const SESSION_KEY = 'cafeAlfFresco_session_v1';

  const PERMISSIONS = {
    Admin: {
      manageUsers: true, manageAdmins: true, manageTasks: true, manageSkills: true,
      manageSettings: true, viewAllReports: true, viewAuditLog: true,
      completeOwnTasks: true, completeForOthers: true
    },
    Manager: {
      manageUsers: true, manageAdmins: false, manageTasks: true, manageSkills: true,
      manageSettings: true, viewAllReports: true, viewAuditLog: true,
      completeOwnTasks: true, completeForOthers: true
    },
    Supervisor: {
      manageUsers: false, manageAdmins: false, manageTasks: false, manageSkills: false,
      manageSettings: false, viewAllReports: true, viewAuditLog: false,
      completeOwnTasks: true, completeForOthers: true
    },
    Staff: {
      manageUsers: false, manageAdmins: false, manageTasks: false, manageSkills: false,
      manageSettings: false, viewAllReports: false, viewAuditLog: false,
      completeOwnTasks: true, completeForOthers: false
    }
  };

  function can(role, perm) {
    return !!(PERMISSIONS[role] && PERMISSIONS[role][perm]);
  }

  function login(db, userId, pin) {
    const user = db.users.find(u => u.id === userId);
    if (!user) return { ok: false, error: 'Unknown user' };
    if (!user.active) return { ok: false, error: 'This account is deactivated' };
    if (String(user.pin) !== String(pin)) return { ok: false, error: 'Incorrect PIN' };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, ts: Date.now() }));
    return { ok: true, user };
  }

  function currentUser(db) {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const { userId } = JSON.parse(raw);
      const user = db.users.find(u => u.id === userId);
      if (!user || !user.active) return null;
      return user;
    } catch (e) {
      return null;
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  global.App = global.App || {};
  global.App.Auth = { PERMISSIONS, can, login, currentUser, logout };
})(window);
