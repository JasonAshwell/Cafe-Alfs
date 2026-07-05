/* ============================================================
   views-staff.js - Login, Dashboard, My Tasks (staff-facing views)
   ============================================================ */
(function (global) {
  const { el, fmtDate, fmtDateShort, fmtTime, fmtDateTime, todayStr, statusBadge, toast, confirmAction } = App.Util;
  const S = App.Scheduler;

  // ---------- LOGIN ----------
  function renderLogin(container) {
    const db = App.State.db;
    container.innerHTML = '';
    const activeUsers = db.users.filter(u => u.active);

    const wrap = el('div', { class: 'login-screen' }, [
      el('div', { class: 'login-card' }, [
        el('div', { class: 'login-logo' }, ['☕']),
        el('h1', {}, [db.settings.cafeName]),
        el('p', { class: 'muted' }, ['Daily Compliance & Task Tracker']),
        el('label', { class: 'field-label' }, ['Select your name']),
        (() => {
          const sel = el('select', { id: 'login-user', class: 'input' },
            activeUsers.map(u => el('option', { value: u.id }, [u.name + ' — ' + u.role])));
          return sel;
        })(),
        el('label', { class: 'field-label' }, ['PIN']),
        el('input', { id: 'login-pin', class: 'input', type: 'password', inputmode: 'numeric', maxlength: '6', placeholder: '••••' }),
        el('button', {
          class: 'btn btn-primary btn-block', onClick: () => {
            const userId = document.getElementById('login-user').value;
            const pin = document.getElementById('login-pin').value;
            const res = App.Auth.login(db, userId, pin);
            if (!res.ok) { toast(res.error, 'error'); return; }
            App.State.db = App.Storage.load();
            App.Storage.addAudit(App.State.db, res.user.id, res.user.name, 'login', 'Logged in');
            App.Storage.save(App.State.db);
            App.App.navigate(res.user.role === 'Staff' ? '#/mytasks' : '#/dashboard');
          }
        }, ['Log in']),
        el('p', { class: 'muted small' }, ['Prototype demo — default PINs: Admin 1234, Manager 1111, Supervisor 2222, Staff 3333 / 4444'])
      ])
    ]);
    container.appendChild(wrap);
  }

  // ---------- DASHBOARD ----------
  function renderDashboard(container) {
    const db = App.State.db;
    const user = App.State.user;
    container.innerHTML = '';

    if (user.role === 'Staff') {
      renderStaffDashboard(container, db, user);
      return;
    }

    const now = new Date();
    const today = todayStr();
    const agendaToday = S.buildAgenda(db, S.parseDateStr(today), S.parseDateStr(today), now);
    const weekStart = startOfWeek(now), weekEnd = endOfWeek(now);
    const agendaWeek = S.buildAgenda(db, weekStart, weekEnd, now);

    const totalToday = agendaToday.length;
    const doneToday = agendaToday.filter(r => r.status === 'completed').length;
    const overdueToday = agendaToday.filter(r => r.status === 'overdue');
    const pctToday = totalToday ? Math.round((doneToday / totalToday) * 100) : 100;

    const totalWeek = agendaWeek.length;
    const doneWeek = agendaWeek.filter(r => r.status === 'completed').length;
    const pctWeek = totalWeek ? Math.round((doneWeek / totalWeek) * 100) : 100;

    const byCategory = {};
    agendaToday.forEach(r => {
      byCategory[r.task.category] = byCategory[r.task.category] || { total: 0, done: 0 };
      byCategory[r.task.category].total++;
      if (r.status === 'completed') byCategory[r.task.category].done++;
    });

    const wrap = el('div', { class: 'page' }, [
      el('h1', {}, ['Dashboard']),
      el('p', { class: 'muted' }, ['Welcome back, ' + user.name + ' (' + user.role + ')']),
      el('div', { class: 'stat-grid' }, [
        statCard('Today’s compliance', pctToday + '%', doneToday + ' of ' + totalToday + ' tasks done', pctToday >= 90 ? 'good' : pctToday >= 60 ? 'warn' : 'bad'),
        statCard('This week', pctWeek + '%', doneWeek + ' of ' + totalWeek + ' tasks done', pctWeek >= 90 ? 'good' : pctWeek >= 60 ? 'warn' : 'bad'),
        statCard('Overdue right now', String(overdueToday.length), 'tasks need attention', overdueToday.length === 0 ? 'good' : 'bad'),
        statCard('Active staff', String(db.users.filter(u => u.active).length), 'of ' + db.users.length + ' total users', 'neutral')
      ]),
      el('div', { class: 'panel' }, [
        el('h2', {}, ['Overdue tasks']),
        overdueToday.length === 0
          ? el('p', { class: 'muted' }, ['Nothing overdue right now. Nice work.'])
          : el('table', { class: 'table' }, [
              el('thead', {}, [el('tr', {}, [el('th', {}, ['Task']), el('th', {}, ['Category']), el('th', {}, ['Was due']), el('th', {}, ['Required'])])]),
              el('tbody', {}, overdueToday.map(r => el('tr', {}, [
                el('td', {}, [r.task.title]),
                el('td', {}, [r.task.category]),
                el('td', {}, [fmtTime(r.dueAt)]),
                el('td', {}, [requirementText(r.task)])
              ])))
            ])
      ]),
      el('div', { class: 'panel' }, [
        el('h2', {}, ['Compliance by category (today)']),
        el('div', { class: 'bar-list' }, Object.keys(byCategory).sort().map(cat => {
          const c = byCategory[cat];
          const pct = c.total ? Math.round((c.done / c.total) * 100) : 100;
          return el('div', { class: 'bar-row' }, [
            el('div', { class: 'bar-label' }, [cat]),
            el('div', { class: 'bar-track' }, [el('div', { class: 'bar-fill', style: 'width:' + pct + '%' }, [])]),
            el('div', { class: 'bar-pct' }, [pct + '% (' + c.done + '/' + c.total + ')'])
          ]);
        }))
      ])
    ]);
    container.appendChild(wrap);
  }

  function renderStaffDashboard(container, db, user) {
    const now = new Date();
    const today = todayStr();
    const agendaToday = S.buildAgenda(db, S.parseDateStr(today), S.parseDateStr(today), now)
      .filter(r => S.isEligible(user, r.task));
    const mine = db.completions.filter(c => c.userId === user.id && c.dateStr === today);
    const done = agendaToday.filter(r => r.status === 'completed').length;
    const overdue = agendaToday.filter(r => r.status === 'overdue');

    const wrap = el('div', { class: 'page' }, [
      el('h1', {}, ['Hi ' + user.name.split(' ')[0] + ' 👋']),
      el('p', { class: 'muted' }, ['Here’s what’s on your plate today.']),
      el('div', { class: 'stat-grid' }, [
        statCard('Your tasks today', String(agendaToday.length), 'assigned & eligible', 'neutral'),
        statCard('Completed', String(done), 'nice work so far', 'good'),
        statCard('Overdue', String(overdue.length), 'need action now', overdue.length ? 'bad' : 'good'),
        statCard('Logged today', String(mine.length), 'completion records', 'neutral')
      ]),
      el('div', { class: 'panel' }, [
        el('button', { class: 'btn btn-primary', onClick: () => App.App.navigate('#/mytasks') }, ['Go to My Tasks →'])
      ])
    ]);
    container.appendChild(wrap);
  }

  function statCard(label, value, sub, tone) {
    return el('div', { class: 'stat-card stat-' + tone }, [
      el('div', { class: 'stat-value' }, [value]),
      el('div', { class: 'stat-label' }, [label]),
      el('div', { class: 'stat-sub' }, [sub])
    ]);
  }

  function requirementText(task) {
    const bits = [];
    if (task.minAge) bits.push('Age ' + task.minAge + '+');
    if (task.requiredSkills && task.requiredSkills.length) {
      const names = task.requiredSkills.map(id => (App.State.db.skills.find(s => s.id === id) || {}).name || id);
      bits.push(names.join(', '));
    }
    return bits.length ? bits.join(' · ') : 'No restrictions';
  }

  function startOfWeek(d) {
    const x = new Date(d); const day = (x.getDay() + 6) % 7; // Monday=0
    x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x;
  }
  function endOfWeek(d) { const s = startOfWeek(d); const e = new Date(s); e.setDate(e.getDate() + 6); return e; }
  function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

  // ---------- MY TASKS ----------
  let mtRange = 'today';
  let mtTeamFilter = 'All';

  function renderMyTasks(container) {
    const db = App.State.db;
    const user = App.State.user;
    container.innerHTML = '';
    const now = new Date();

    let from, to;
    if (mtRange === 'today') { from = S.parseDateStr(todayStr()); to = from; }
    else if (mtRange === 'week') { from = startOfWeek(now); to = endOfWeek(now); }
    else { from = startOfMonth(now); to = endOfMonth(now); }

    const canActOnBehalf = App.Auth.can(user.role, 'completeForOthers');

    let agenda = S.buildAgenda(db, from, to, now);
    if (!canActOnBehalf) {
      agenda = agenda.filter(r => S.isEligible(user, r.task));
    }
    if (mtTeamFilter !== 'All') {
      agenda = agenda.filter(r => r.task.team === mtTeamFilter);
    }

    const teamFilterSelect = el('select', { class: 'input input-sm' },
      ['All', ...App.Storage.TEAMS].map(t => el('option', { value: t, selected: t === mtTeamFilter ? 'selected' : null }, [t === 'All' ? 'All teams' : t])));
    teamFilterSelect.addEventListener('change', () => { mtTeamFilter = teamFilterSelect.value; App.App.render(); });

    const wrap = el('div', { class: 'page' }, [
      el('h1', {}, ['My Tasks']),
      el('div', { class: 'tabs' }, [
        tabBtn('Today', 'today'), tabBtn('This week', 'week'), tabBtn('This month', 'month')
      ]),
      el('div', { class: 'filter-row' }, [
        el('label', { class: 'field-label' }, ['Team']), teamFilterSelect
      ]),
      el('div', { class: 'panel' }, [
        agenda.length === 0
          ? el('p', { class: 'muted' }, ['No tasks in this range.'])
          : el('div', { class: 'task-list' }, groupByDate(agenda).map(group => renderDateGroup(group, db, user, canActOnBehalf)))
      ])
    ]);
    container.appendChild(wrap);
  }

  function tabBtn(label, key) {
    return App.Util.el('button', {
      class: 'tab' + (mtRange === key ? ' active' : ''),
      onClick: () => { mtRange = key; App.App.render(); }
    }, [label]);
  }

  function groupByDate(agenda) {
    const map = {};
    agenda.forEach(r => { (map[r.dateStr] = map[r.dateStr] || []).push(r); });
    return Object.keys(map).sort().map(dateStr => ({ dateStr, rows: map[dateStr] }));
  }

  function renderDateGroup(group, db, user, canActOnBehalf) {
    return el('div', { class: 'date-group' }, [
      el('h3', {}, [fmtDate(group.dateStr)]),
      el('div', {}, group.rows.map(r => renderTaskRow(r, db, user, canActOnBehalf)))
    ]);
  }

  function renderTaskRow(r, db, user, canActOnBehalf) {
    const eligibleNow = S.isEligible(user, r.task);
    const gaps = S.eligibilityGaps(user, r.task);
    const metaBits = [r.task.category, r.task.team, r.label, requirementText(r.task), 'Expected ' + App.Util.fmtMinutes(r.task.expectedMinutes)];
    const overTime = r.completion && r.completion.actualMinutes && r.task.expectedMinutes && r.completion.actualMinutes > r.task.expectedMinutes * 1.2;
    const row = el('div', { class: 'task-row task-' + r.status }, [
      el('div', { class: 'task-main' }, [
        el('div', { class: 'task-title' }, [r.task.title, r.task.mandatory ? el('span', { class: 'tag-mandatory' }, ['Mandatory']) : null]),
        el('div', { class: 'task-meta' }, [metaBits.filter(Boolean).join(' · ')]),
        r.task.description ? el('div', { class: 'task-desc' }, [r.task.description]) : null,
        (!eligibleNow && !canActOnBehalf) ? el('div', { class: 'task-gap' }, ['Not eligible: ' + gaps.join('; ')]) : null,
        r.completion ? el('div', { class: 'task-log' + (overTime ? ' task-over-time' : '') }, [
          (r.completion.status === 'completed' ? 'Completed' : 'Skipped') + ' by ' +
          (db.users.find(u => u.id === r.completion.userId) || {}).name + ' at ' + fmtDateTime(r.completion.completedAt) +
          (r.completion.actualMinutes ? ' — took ' + App.Util.fmtMinutes(r.completion.actualMinutes) + ' (expected ' + App.Util.fmtMinutes(r.task.expectedMinutes) + ')' : '') +
          (r.completion.notes ? ' — "' + r.completion.notes + '"' : '')
        ]) : null
      ]),
      el('div', { class: 'task-side' }, [
        statusBadge(r.status),
        (!r.completion) ? actionArea(r, db, user, canActOnBehalf, eligibleNow) : null
      ])
    ]);
    return row;
  }

  function actionArea(r, db, user, canActOnBehalf, eligibleNow) {
    if (!eligibleNow && !canActOnBehalf) return null;

    const eligibleUsers = db.users.filter(u => u.active && S.isEligible(u, r.task));
    const container = el('div', { class: 'action-area' }, []);

    // Nobody currently eligible to log this (covers the case where a supervisor/manager
    // has permission to act on behalf of others, but isn't themselves eligible and no
    // eligible staff are active) — don't let it be logged against an ineligible person.
    if (!eligibleNow && canActOnBehalf && !eligibleUsers.length) {
      container.appendChild(el('div', { class: 'task-gap' }, ['No active staff currently meet the age/skill requirements for this task — it cannot be logged until someone qualified is available.']));
      return container;
    }

    let assigneeSelect = null;
    if (canActOnBehalf && eligibleUsers.length) {
      assigneeSelect = el('select', { class: 'input input-sm' },
        eligibleUsers.map(u => el('option', { value: u.id, selected: u.id === user.id ? 'selected' : null }, [u.name])));
      container.appendChild(assigneeSelect);
    }

    const minutesInput = el('input', {
      class: 'input input-sm', type: 'number', min: '0', max: '480',
      placeholder: 'Minutes taken (expected ' + App.Util.fmtMinutes(r.task.expectedMinutes) + ')'
    });
    container.appendChild(minutesInput);

    const notesInput = el('input', { class: 'input input-sm', placeholder: 'Optional note...' });
    container.appendChild(notesInput);

    const btnRow = el('div', { class: 'btn-row' }, [
      el('button', {
        class: 'btn btn-sm btn-primary', onClick: () => {
          const assigneeId = assigneeSelect ? assigneeSelect.value : user.id;
          const actualMinutes = minutesInput.value === '' ? null : parseInt(minutesInput.value, 10);
          completeTask(r, assigneeId, notesInput.value, 'completed', actualMinutes);
        }
      }, ['Mark done']),
      el('button', {
        class: 'btn btn-sm btn-ghost', onClick: () => {
          const reason = window.prompt('Reason for skipping this task?');
          if (reason === null) return;
          const assigneeId = assigneeSelect ? assigneeSelect.value : user.id;
          completeTask(r, assigneeId, reason, 'skipped', null);
        }
      }, ['Skip'])
    ]);
    container.appendChild(btnRow);
    return container;
  }

  function completeTask(r, assigneeId, notes, status, actualMinutes) {
    const db = App.State.db;
    const record = {
      id: App.Storage.uid('c'), taskId: r.task.id, dateStr: r.dateStr, slotId: r.slotId,
      userId: assigneeId, completedAt: new Date().toISOString(), status, notes: notes || '',
      actualMinutes: (actualMinutes || actualMinutes === 0) ? actualMinutes : null
    };
    db.completions.push(record);
    const actor = App.State.user;
    const assignee = db.users.find(u => u.id === assigneeId);
    App.Storage.addAudit(db, actor.id, actor.name,
      status === 'completed' ? 'task_complete' : 'task_skip',
      r.task.title + ' (' + r.dateStr + ' ' + r.label + ') for ' + (assignee ? assignee.name : assigneeId));
    App.Storage.save(db);
    toast(status === 'completed' ? 'Task marked complete' : 'Task marked skipped', status === 'completed' ? 'success' : 'warn');
    App.App.render();
  }

  global.App = global.App || {};
  global.App.ViewsStaff = { renderLogin, renderDashboard, renderMyTasks, startOfWeek, endOfWeek, startOfMonth, endOfMonth, requirementText };
})(window);
