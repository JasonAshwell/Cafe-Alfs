/* ============================================================
   views-admin.js - Admin portal: Users, Tasks, Skills, Reports,
   Audit log, Settings.
   ============================================================ */
(function (global) {
  const { el, fmtDateTime, toast, confirmAction, openModal, csvDownload } = App.Util;
  const S = App.Scheduler;

  function accessDenied(container, needed) {
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'page' }, [
      el('div', { class: 'panel' }, [
        el('h2', {}, ['Access denied']),
        el('p', { class: 'muted' }, ['Your role (' + App.State.user.role + ') does not have the "' + needed + '" permission.'])
      ])
    ]));
  }

  function skillNames(db, ids) {
    return (ids || []).map(id => (db.skills.find(s => s.id === id) || {}).name || id);
  }

  // ================= USERS =================
  function renderAdminUsers(container) {
    const db = App.State.db, actor = App.State.user;
    if (!App.Auth.can(actor.role, 'manageUsers')) return accessDenied(container, 'manageUsers');
    container.innerHTML = '';

    const table = el('table', { class: 'table' }, [
      el('thead', {}, [el('tr', {}, ['Name', 'Role', 'Team', 'Age', 'Skills', 'Status', ''].map(h => el('th', {}, [h])))]),
      el('tbody', {}, db.users.map(u => {
        const lockedAdmin = u.role === 'Admin' && actor.role !== 'Admin';
        return el('tr', {}, [
          el('td', {}, [u.name]),
          el('td', {}, [u.role]),
          el('td', {}, [u.team || '—']),
          el('td', {}, [String(u.age)]),
          el('td', {}, [skillNames(db, u.skills).join(', ') || '—']),
          el('td', {}, [u.active ? el('span', { class: 'badge badge-completed' }, ['Active']) : el('span', { class: 'badge badge-skipped' }, ['Inactive'])]),
          el('td', { class: 'row-actions' }, lockedAdmin ? [el('span', { class: 'muted small' }, ['Admin only'])] : [
            el('button', { class: 'btn btn-sm btn-ghost', onClick: () => openUserModal(u) }, ['Edit']),
            el('button', { class: 'btn btn-sm btn-ghost', onClick: () => toggleUserActive(u) }, [u.active ? 'Deactivate' : 'Reactivate'])
          ])
        ]);
      }))
    ]);

    container.appendChild(el('div', { class: 'page' }, [
      el('div', { class: 'page-head' }, [
        el('h1', {}, ['Manage Users']),
        el('button', { class: 'btn btn-primary', onClick: () => openUserModal(null) }, ['+ Add user'])
      ]),
      el('p', { class: 'muted' }, ['Set each person’s age and skills here — task eligibility (e.g. Food Hygiene Level 2, Cash Handling, minimum age) is enforced automatically on My Tasks.']),
      el('div', { class: 'panel' }, [table])
    ]));
  }

  function toggleUserActive(u) {
    const db = App.State.db, actor = App.State.user;
    u.active = !u.active;
    App.Storage.addAudit(db, actor.id, actor.name, u.active ? 'user_reactivate' : 'user_deactivate', u.name);
    App.Storage.save(db);
    toast(u.name + (u.active ? ' reactivated' : ' deactivated'));
    App.App.render();
  }

  function openUserModal(existing) {
    const db = App.State.db, actor = App.State.user;
    const isNew = !existing;
    const draft = existing ? Object.assign({}, existing, { skills: [...existing.skills] }) : {
      name: '', role: 'Staff', team: 'Kitchen Staff', age: 18, skills: [], pin: '0000', active: true
    };

    const nameInput = el('input', { class: 'input', value: draft.name, placeholder: 'Full name' });
    const roleOptions = ['Staff', 'Supervisor', 'Manager'];
    if (actor.role === 'Admin') roleOptions.push('Admin');
    const roleSelect = el('select', { class: 'input' }, roleOptions.map(r => el('option', { value: r, selected: r === draft.role ? 'selected' : null }, [r])));
    const teamSelect = el('select', { class: 'input' }, App.Storage.TEAMS.map(t => el('option', { value: t, selected: t === draft.team ? 'selected' : null }, [t])));
    const ageInput = el('input', { class: 'input', type: 'number', min: '13', max: '80', value: String(draft.age) });
    const pinInput = el('input', { class: 'input', value: draft.pin, placeholder: '4-digit PIN' });
    const activeCheck = el('input', { type: 'checkbox' }); activeCheck.checked = draft.active;

    const skillBoxes = db.skills.map(sk => {
      const cb = el('input', { type: 'checkbox', value: sk.id });
      cb.checked = draft.skills.includes(sk.id);
      return el('label', { class: 'checkbox-row' }, [cb, ' ' + sk.name]);
    });

    const body = el('div', { class: 'form-grid' }, [
      el('label', { class: 'field-label' }, ['Full name']), nameInput,
      el('label', { class: 'field-label' }, ['Role (security permissions)']), roleSelect,
      el('label', { class: 'field-label' }, ['Team (job area, for organising tasks)']), teamSelect,
      el('label', { class: 'field-label' }, ['Age']), ageInput,
      el('label', { class: 'field-label' }, ['PIN (login)']), pinInput,
      el('label', { class: 'field-label' }, ['Skills / training completed']),
      el('div', { class: 'checkbox-grid' }, skillBoxes),
      el('label', { class: 'checkbox-row' }, [activeCheck, ' Active (can log in / be assigned tasks)'])
    ]);

    openModal(isNew ? 'Add user' : 'Edit user', body, {
      saveLabel: isNew ? 'Add user' : 'Save changes',
      onSave: () => {
        const name = nameInput.value.trim();
        if (!name) { toast('Name is required', 'error'); return false; }
        const age = parseInt(ageInput.value, 10) || 0;
        const selectedSkills = skillBoxes
          .map((row, i) => row.firstChild.checked ? db.skills[i].id : null)
          .filter(Boolean);

        if (isNew) {
          const user = { id: App.Storage.uid('u'), name, role: roleSelect.value, team: teamSelect.value, age, skills: selectedSkills, pin: pinInput.value || '0000', active: activeCheck.checked };
          db.users.push(user);
          App.Storage.addAudit(db, actor.id, actor.name, 'user_add', name + ' (' + user.role + ')');
        } else {
          existing.name = name; existing.role = roleSelect.value; existing.team = teamSelect.value; existing.age = age;
          existing.skills = selectedSkills; existing.pin = pinInput.value || existing.pin; existing.active = activeCheck.checked;
          App.Storage.addAudit(db, actor.id, actor.name, 'user_edit', name);
        }
        App.Storage.save(db);
        toast('User saved');
        App.App.render();
      }
    });
  }

  // ================= TASKS =================
  let taskTeamFilter = 'All';

  function renderAdminTasks(container) {
    const db = App.State.db, actor = App.State.user;
    if (!App.Auth.can(actor.role, 'manageTasks')) return accessDenied(container, 'manageTasks');
    container.innerHTML = '';

    const visibleTasks = taskTeamFilter === 'All' ? db.tasks : db.tasks.filter(t => t.team === taskTeamFilter);

    const teamFilterSelect = el('select', { class: 'input input-sm' },
      ['All', ...App.Storage.TEAMS].map(t => el('option', { value: t, selected: t === taskTeamFilter ? 'selected' : null }, [t === 'All' ? 'All teams' : t])));
    teamFilterSelect.addEventListener('change', () => { taskTeamFilter = teamFilterSelect.value; App.App.render(); });

    const table = el('table', { class: 'table' }, [
      el('thead', {}, [el('tr', {}, ['Task', 'Category', 'Team', 'Frequency', 'Expected', 'Required', 'Status', ''].map(h => el('th', {}, [h])))]),
      el('tbody', {}, visibleTasks.map(t => el('tr', {}, [
        el('td', {}, [t.title, t.mandatory ? el('span', { class: 'tag-mandatory' }, ['Mandatory']) : null]),
        el('td', {}, [t.category]),
        el('td', {}, [t.team || '—']),
        el('td', {}, [S.frequencyLabel(t.frequency, db.settings)]),
        el('td', {}, [App.Util.fmtMinutes(t.expectedMinutes)]),
        el('td', {}, [App.ViewsStaff.requirementText(t)]),
        el('td', {}, [t.active ? el('span', { class: 'badge badge-completed' }, ['Active']) : el('span', { class: 'badge badge-skipped' }, ['Inactive'])]),
        el('td', { class: 'row-actions' }, [
          el('button', { class: 'btn btn-sm btn-ghost', onClick: () => openTaskModal(t) }, ['Edit']),
          el('button', { class: 'btn btn-sm btn-ghost', onClick: () => toggleTaskActive(t) }, [t.active ? 'Deactivate' : 'Reactivate'])
        ])
      ])))
    ]);

    container.appendChild(el('div', { class: 'page' }, [
      el('div', { class: 'page-head' }, [
        el('h1', {}, ['Manage Tasks']),
        el('button', { class: 'btn btn-primary', onClick: () => openTaskModal(null) }, ['+ Add task'])
      ]),
      el('p', { class: 'muted' }, ['Define what needs doing, how often, who is allowed to do it (minimum age / required skills), which team normally owns it, and how long it should take.']),
      el('div', { class: 'filter-row' }, [
        el('label', { class: 'field-label' }, ['Filter by team']), teamFilterSelect
      ]),
      el('div', { class: 'panel' }, [table])
    ]));
  }

  function toggleTaskActive(t) {
    const db = App.State.db, actor = App.State.user;
    t.active = !t.active;
    App.Storage.addAudit(db, actor.id, actor.name, t.active ? 'task_reactivate' : 'task_deactivate', t.title);
    App.Storage.save(db);
    App.App.render();
  }

  const CATEGORIES = ['Food Hygiene & Safety', 'Cleanliness', 'Food Safety Management', 'Cash Management', 'Stock Control', 'New Products', 'Health & Safety', 'Opening/Closing Procedures'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function openTaskModal(existing) {
    const db = App.State.db, actor = App.State.user;
    const isNew = !existing;
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : {
      title: '', description: '', category: CATEGORIES[0], team: 'Kitchen Staff', expectedMinutes: 10,
      frequency: { type: 'daily', dueTime: '10:00' },
      requiredSkills: [], minAge: 16, mandatory: true, active: true
    };

    const titleInput = el('input', { class: 'input', value: draft.title, placeholder: 'Task title' });
    const descInput = el('textarea', { class: 'input', rows: '2' }, [draft.description]);
    const catSelect = el('select', { class: 'input' }, CATEGORIES.map(c => el('option', { value: c, selected: c === draft.category ? 'selected' : null }, [c])));
    const teamSelect = el('select', { class: 'input' }, App.Storage.TEAMS.map(t => el('option', { value: t, selected: t === draft.team ? 'selected' : null }, [t])));
    const expectedInput = el('input', { class: 'input', type: 'number', min: '1', max: '480', value: String(draft.expectedMinutes || 10) });
    const ageInput = el('input', { class: 'input', type: 'number', min: '0', max: '80', value: String(draft.minAge) });
    const mandatoryCheck = el('input', { type: 'checkbox' }); mandatoryCheck.checked = draft.mandatory;
    const activeCheck = el('input', { type: 'checkbox' }); activeCheck.checked = draft.active;

    const skillBoxes = db.skills.map(sk => {
      const cb = el('input', { type: 'checkbox', value: sk.id });
      cb.checked = draft.requiredSkills.includes(sk.id);
      return el('label', { class: 'checkbox-row' }, [cb, ' ' + sk.name]);
    });

    // Frequency controls
    const FREQ_TYPE_LABELS = { hourly: 'Hourly', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', opening: 'Opening routine', closing: 'Closing routine' };
    const freqType = el('select', { class: 'input' }, Object.keys(FREQ_TYPE_LABELS).map(f => el('option', { value: f, selected: f === draft.frequency.type ? 'selected' : null }, [FREQ_TYPE_LABELS[f]])));
    const freqFields = el('div', { class: 'freq-fields' }, []);

    function renderFreqFields() {
      freqFields.innerHTML = '';
      const type = freqType.value;
      if (type === 'hourly') {
        const from = draft.frequency.type === 'hourly' ? draft.frequency.fromTime : (db.settings.openTime || '07:00');
        const to = draft.frequency.type === 'hourly' ? draft.frequency.toTime : (db.settings.closeTime || '14:00');
        freqFields.appendChild(el('label', { class: 'field-label' }, ['From']));
        freqFields.appendChild(el('input', { class: 'input freq-from', type: 'time', value: from }));
        freqFields.appendChild(el('label', { class: 'field-label' }, ['To']));
        freqFields.appendChild(el('input', { class: 'input freq-to', type: 'time', value: to }));
      } else if (type === 'daily') {
        const due = draft.frequency.type === 'daily' ? draft.frequency.dueTime : '10:00';
        freqFields.appendChild(el('label', { class: 'field-label' }, ['Due by']));
        freqFields.appendChild(el('input', { class: 'input freq-due', type: 'time', value: due }));
      } else if (type === 'weekly') {
        const days = draft.frequency.type === 'weekly' ? draft.frequency.days : [1];
        const due = draft.frequency.type === 'weekly' ? draft.frequency.dueTime : '10:00';
        freqFields.appendChild(el('label', { class: 'field-label' }, ['Day(s) of week']));
        freqFields.appendChild(el('div', { class: 'checkbox-grid freq-days' }, WEEKDAYS.map((d, i) => {
          const cb = el('input', { type: 'checkbox', value: String(i) }); cb.checked = days.includes(i);
          return el('label', { class: 'checkbox-row' }, [cb, ' ' + d]);
        })));
        freqFields.appendChild(el('label', { class: 'field-label' }, ['Due by']));
        freqFields.appendChild(el('input', { class: 'input freq-due', type: 'time', value: due }));
      } else if (type === 'monthly') {
        const dom = draft.frequency.type === 'monthly' ? draft.frequency.dayOfMonth : 1;
        const due = draft.frequency.type === 'monthly' ? draft.frequency.dueTime : '10:00';
        freqFields.appendChild(el('label', { class: 'field-label' }, ['Day of month (1-31, or "last")']));
        freqFields.appendChild(el('input', { class: 'input freq-dom', value: String(dom) }));
        freqFields.appendChild(el('label', { class: 'field-label' }, ['Due by']));
        freqFields.appendChild(el('input', { class: 'input freq-due', type: 'time', value: due }));
      } else if (type === 'opening' || type === 'closing') {
        const offset = draft.frequency.type === type ? draft.frequency.offsetMinutes : 0;
        const baseTime = type === 'opening' ? db.settings.openTime : db.settings.closeTime;
        freqFields.appendChild(el('label', { class: 'field-label' }, ['Offset in minutes from ' + type + ' time (negative = before, positive = after)']));
        freqFields.appendChild(el('input', { class: 'input freq-offset', type: 'number', value: String(offset) }));
        freqFields.appendChild(el('p', { class: 'muted small' }, [
          'Cafe ' + type + ' time is currently ' + baseTime + ' (see Settings) — this task\'s due time follows it automatically, so it stays correct if opening/closing hours change.'
        ]));
      }
    }
    renderFreqFields();
    freqType.addEventListener('change', renderFreqFields);

    const body = el('div', { class: 'form-grid' }, [
      el('label', { class: 'field-label' }, ['Title']), titleInput,
      el('label', { class: 'field-label' }, ['Description']), descInput,
      el('label', { class: 'field-label' }, ['Category']), catSelect,
      el('label', { class: 'field-label' }, ['Team (who normally does this)']), teamSelect,
      el('label', { class: 'field-label' }, ['Expected duration (minutes)']), expectedInput,
      el('label', { class: 'field-label' }, ['Frequency']), freqType, freqFields,
      el('label', { class: 'field-label' }, ['Minimum age']), ageInput,
      el('label', { class: 'field-label' }, ['Required skills']),
      el('div', { class: 'checkbox-grid' }, skillBoxes),
      el('label', { class: 'checkbox-row' }, [mandatoryCheck, ' Mandatory for 5-star compliance']),
      el('label', { class: 'checkbox-row' }, [activeCheck, ' Active'])
    ]);

    openModal(isNew ? 'Add task' : 'Edit task', body, {
      saveLabel: isNew ? 'Add task' : 'Save changes',
      onSave: () => {
        const title = titleInput.value.trim();
        if (!title) { toast('Title is required', 'error'); return false; }

        let frequency;
        const type = freqType.value;
        if (type === 'hourly') {
          frequency = { type, fromTime: freqFields.querySelector('.freq-from').value, toTime: freqFields.querySelector('.freq-to').value };
        } else if (type === 'daily') {
          frequency = { type, dueTime: freqFields.querySelector('.freq-due').value };
        } else if (type === 'weekly') {
          const days = Array.from(freqFields.querySelectorAll('.freq-days input')).filter(i => i.checked).map(i => parseInt(i.value, 10));
          frequency = { type, days: days.length ? days : [1], dueTime: freqFields.querySelector('.freq-due').value };
        } else if (type === 'monthly') {
          const domRaw = freqFields.querySelector('.freq-dom').value.trim();
          const dayOfMonth = domRaw.toLowerCase() === 'last' ? 'last' : (parseInt(domRaw, 10) || 1);
          frequency = { type, dayOfMonth, dueTime: freqFields.querySelector('.freq-due').value };
        } else {
          // opening / closing
          const offsetMinutes = parseInt(freqFields.querySelector('.freq-offset').value, 10) || 0;
          frequency = { type, offsetMinutes };
        }

        const requiredSkills = skillBoxes.map((row, i) => row.firstChild.checked ? db.skills[i].id : null).filter(Boolean);
        const payload = {
          title, description: descInput.value.trim(), category: catSelect.value, team: teamSelect.value,
          expectedMinutes: parseInt(expectedInput.value, 10) || 10, frequency,
          requiredSkills, minAge: parseInt(ageInput.value, 10) || 0,
          mandatory: mandatoryCheck.checked, active: activeCheck.checked
        };

        if (isNew) {
          db.tasks.push(Object.assign({ id: App.Storage.uid('t') }, payload));
          App.Storage.addAudit(db, actor.id, actor.name, 'task_add', title);
        } else {
          Object.assign(existing, payload);
          App.Storage.addAudit(db, actor.id, actor.name, 'task_edit', title);
        }
        App.Storage.save(db);
        toast('Task saved');
        App.App.render();
      }
    });
  }

  // ================= SKILLS =================
  function renderAdminSkills(container) {
    const db = App.State.db, actor = App.State.user;
    if (!App.Auth.can(actor.role, 'manageSkills')) return accessDenied(container, 'manageSkills');
    container.innerHTML = '';

    const table = el('table', { class: 'table' }, [
      el('thead', {}, [el('tr', {}, ['Skill / training', 'Staff with it', 'Tasks requiring it', ''].map(h => el('th', {}, [h])))]),
      el('tbody', {}, db.skills.map(sk => {
        const staffCount = db.users.filter(u => u.skills.includes(sk.id)).length;
        const taskCount = db.tasks.filter(t => (t.requiredSkills || []).includes(sk.id)).length;
        return el('tr', {}, [
          el('td', {}, [sk.name]),
          el('td', {}, [String(staffCount)]),
          el('td', {}, [String(taskCount)]),
          el('td', { class: 'row-actions' }, [
            el('button', { class: 'btn btn-sm btn-ghost', onClick: () => openSkillModal(sk) }, ['Rename']),
            el('button', { class: 'btn btn-sm btn-ghost', onClick: () => deleteSkill(sk, staffCount, taskCount) }, ['Delete'])
          ])
        ]);
      }))
    ]);

    container.appendChild(el('div', { class: 'page' }, [
      el('div', { class: 'page-head' }, [
        el('h1', {}, ['Manage Skills & Training']),
        el('button', { class: 'btn btn-primary', onClick: () => openSkillModal(null) }, ['+ Add skill'])
      ]),
      el('p', { class: 'muted' }, ['Skills represent training/certification (e.g. Food Hygiene Level 2). Assign them to users and require them on tasks to enforce competency.']),
      el('div', { class: 'panel' }, [table])
    ]));
  }

  function openSkillModal(existing) {
    const db = App.State.db, actor = App.State.user;
    const isNew = !existing;
    const nameInput = el('input', { class: 'input', value: existing ? existing.name : '', placeholder: 'e.g. Food Hygiene Level 2' });
    openModal(isNew ? 'Add skill' : 'Rename skill', el('div', { class: 'form-grid' }, [
      el('label', { class: 'field-label' }, ['Skill / training name']), nameInput
    ]), {
      onSave: () => {
        const name = nameInput.value.trim();
        if (!name) { toast('Name is required', 'error'); return false; }
        if (isNew) {
          db.skills.push({ id: App.Storage.uid('sk'), name });
          App.Storage.addAudit(db, actor.id, actor.name, 'skill_add', name);
        } else {
          existing.name = name;
          App.Storage.addAudit(db, actor.id, actor.name, 'skill_edit', name);
        }
        App.Storage.save(db);
        App.App.render();
      }
    });
  }

  function deleteSkill(sk, staffCount, taskCount) {
    if (staffCount || taskCount) {
      toast('Cannot delete — in use by ' + staffCount + ' user(s) / ' + taskCount + ' task(s)', 'error');
      return;
    }
    if (!confirmAction('Delete skill "' + sk.name + '"?')) return;
    const db = App.State.db, actor = App.State.user;
    db.skills = db.skills.filter(s => s.id !== sk.id);
    App.Storage.addAudit(db, actor.id, actor.name, 'skill_delete', sk.name);
    App.Storage.save(db);
    App.App.render();
  }

  // ================= REPORTS =================
  let reportFrom = null, reportTo = null;

  function renderAdminReports(container) {
    const db = App.State.db, actor = App.State.user;
    if (!App.Auth.can(actor.role, 'viewAllReports')) return accessDenied(container, 'viewAllReports');
    container.innerHTML = '';

    const now = new Date();
    if (!reportFrom) reportFrom = App.ViewsStaff.startOfMonth(now);
    if (!reportTo) reportTo = App.ViewsStaff.endOfMonth(now);

    const fromInput = el('input', { class: 'input input-sm', type: 'date', value: S.dateStr(reportFrom) });
    const toInput = el('input', { class: 'input input-sm', type: 'date', value: S.dateStr(reportTo) });

    const applyBtn = el('button', {
      class: 'btn btn-sm btn-primary', onClick: () => {
        reportFrom = S.parseDateStr(fromInput.value);
        reportTo = S.parseDateStr(toInput.value);
        App.App.render();
      }
    }, ['Apply']);

    // Quick date range buttons — week runs Mon–Sun
    const wkStart   = App.ViewsStaff.startOfWeek(now);
    const wkEnd     = App.ViewsStaff.endOfWeek(now);
    const moStart   = App.ViewsStaff.startOfMonth(now);
    const moEnd     = App.ViewsStaff.endOfMonth(now);
    const todayOnly = S.parseDateStr(S.dateStr(now));

    function rptQuickBtn(label, from, to) {
      const active = S.dateStr(reportFrom) === S.dateStr(from) && S.dateStr(reportTo) === S.dateStr(to);
      return el('button', {
        class: 'tab' + (active ? ' active' : ''),
        onClick: () => { reportFrom = from; reportTo = to; App.App.render(); }
      }, [label]);
    }

    const agenda = S.buildAgenda(db, reportFrom, reportTo, now);
    const total = agenda.length;
    const completed = agenda.filter(r => r.status === 'completed').length;
    const skipped = agenda.filter(r => r.status === 'skipped').length;
    const overdue = agenda.filter(r => r.status === 'overdue').length;
    const pct = total ? Math.round((completed / total) * 100) : 100;

    const byUser = {};
    db.completions
      .filter(c => c.dateStr >= S.dateStr(reportFrom) && c.dateStr <= S.dateStr(reportTo))
      .forEach(c => {
        const u = db.users.find(u => u.id === c.userId);
        const name = u ? u.name : 'Unknown';
        byUser[name] = byUser[name] || { completed: 0, skipped: 0 };
        byUser[name][c.status === 'skipped' ? 'skipped' : 'completed']++;
      });

    const byCategory = {};
    agenda.forEach(r => {
      byCategory[r.task.category] = byCategory[r.task.category] || { total: 0, done: 0 };
      byCategory[r.task.category].total++;
      if (r.status === 'completed') byCategory[r.task.category].done++;
    });

    // Timing: for each task, compare expected duration to the average actual duration logged
    // by staff on completion (only counts completions in range where a time was recorded).
    const byTask = {};
    db.completions
      .filter(c => c.status === 'completed' && c.actualMinutes && c.dateStr >= S.dateStr(reportFrom) && c.dateStr <= S.dateStr(reportTo))
      .forEach(c => {
        byTask[c.taskId] = byTask[c.taskId] || { sum: 0, count: 0 };
        byTask[c.taskId].sum += c.actualMinutes;
        byTask[c.taskId].count++;
      });
    const timingRows = Object.keys(byTask).map(taskId => {
      const task = db.tasks.find(t => t.id === taskId);
      if (!task) return null;
      const avgActual = byTask[taskId].sum / byTask[taskId].count;
      return { task, avgActual, count: byTask[taskId].count };
    }).filter(Boolean).sort((a, b) => (b.avgActual - (b.task.expectedMinutes || 0)) - (a.avgActual - (a.task.expectedMinutes || 0)));

    container.appendChild(el('div', { class: 'page' }, [
      el('h1', {}, ['Reports & Compliance']),
      el('div', { class: 'filter-row' }, [
        rptQuickBtn('Today', todayOnly, todayOnly),
        rptQuickBtn('This week', wkStart, wkEnd),
        rptQuickBtn('This month', moStart, moEnd),
        el('label', { class: 'field-label' }, ['From']), fromInput,
        el('label', { class: 'field-label' }, ['To']), toInput,
        applyBtn,
        el('button', { class: 'btn btn-sm btn-ghost', onClick: () => exportCsv(agenda) }, ['Export CSV']),
        el('button', { class: 'btn btn-sm btn-ghost', onClick: () => exportCsv(agenda) }, ['Print / Save PDF'])
      ]),
      el('div', { class: 'stat-grid' }, [
        statMini('Total due', String(total)),
        statMini('Completed', completed + ' (' + pct + '%)'),
        statMini('Skipped', String(skipped)),
        statMini('Overdue', String(overdue))
      ]),
      el('div', { class: 'panel' }, [
        el('h2', {}, ['Compliance by category']),
        el('div', { class: 'bar-list' }, Object.keys(byCategory).sort().map(cat => {
          const c = byCategory[cat]; const p = c.total ? Math.round((c.done / c.total) * 100) : 100;
          return el('div', { class: 'bar-row' }, [
            el('div', { class: 'bar-label' }, [cat]),
            el('div', { class: 'bar-track' }, [el('div', { class: 'bar-fill', style: 'width:' + p + '%' }, [])]),
            el('div', { class: 'bar-pct' }, [p + '% (' + c.done + '/' + c.total + ')'])
          ]);
        }))
      ]),
      el('div', { class: 'panel' }, [
        el('h2', {}, ['Completions by staff member']),
        Object.keys(byUser).length === 0 ? el('p', { class: 'muted' }, ['No completions logged in this range.']) :
        el('table', { class: 'table' }, [
          el('thead', {}, [el('tr', {}, ['Staff member', 'Completed', 'Skipped'].map(h => el('th', {}, [h])))]),
          el('tbody', {}, Object.keys(byUser).sort().map(name => el('tr', {}, [
            el('td', {}, [name]), el('td', {}, [String(byUser[name].completed)]), el('td', {}, [String(byUser[name].skipped)])
          ])))
        ])
      ]),
      el('div', { class: 'panel' }, [
        el('h2', {}, ['Task timing: expected vs actual']),
        el('p', { class: 'muted small' }, ['Actual time is whatever staff enter when they mark a task done. Rows are sorted so tasks running most over their expected time appear first.']),
        timingRows.length === 0 ? el('p', { class: 'muted' }, ['No timed completions logged in this range yet.']) :
        el('table', { class: 'table' }, [
          el('thead', {}, [el('tr', {}, ['Task', 'Team', 'Expected', 'Avg actual', 'Logged', ''].map(h => el('th', {}, [h])))]),
          el('tbody', {}, timingRows.map(r => {
            const over = r.avgActual > (r.task.expectedMinutes || 0) * 1.2;
            return el('tr', {}, [
              el('td', {}, [r.task.title]),
              el('td', {}, [r.task.team || '—']),
              el('td', {}, [App.Util.fmtMinutes(r.task.expectedMinutes)]),
              el('td', {}, [App.Util.fmtMinutes(r.avgActual)]),
              el('td', {}, [String(r.count) + 'x']),
              el('td', {}, [over ? el('span', { class: 'badge badge-overdue' }, ['Running over']) : el('span', { class: 'badge badge-completed' }, ['On track'])])
            ]);
          }))
        ])
      ])
    ]));
  }

  function statMini(label, value) {
    return el('div', { class: 'stat-card stat-neutral' }, [el('div', { class: 'stat-value' }, [value]), el('div', { class: 'stat-label' }, [label])]);
  }

  function exportCsv(agenda) {
    const db = App.State.db;
    const rows = [['Date', 'Time/Slot', 'Task', 'Category', 'Team', 'Status', 'Completed By', 'Completed At', 'Expected (min)', 'Actual (min)', 'Notes']];
    agenda.forEach(r => {
      const u = r.completion ? db.users.find(u => u.id === r.completion.userId) : null;
      rows.push([
        r.dateStr, r.label, r.task.title, r.task.category, r.task.team || '', r.status,
        u ? u.name : '', r.completion ? r.completion.completedAt : '',
        r.task.expectedMinutes || '', r.completion ? (r.completion.actualMinutes || '') : '',
        r.completion ? r.completion.notes : ''
      ]);
    });
    csvDownload('compliance_report.csv', rows);
  }

  // ================= AUDIT LOG =================
  function renderAdminAudit(container) {
    const db = App.State.db, actor = App.State.user;
    if (!App.Auth.can(actor.role, 'viewAuditLog')) return accessDenied(container, 'viewAuditLog');
    container.innerHTML = '';

    container.appendChild(el('div', { class: 'page' }, [
      el('h1', {}, ['Audit Log']),
      el('p', { class: 'muted' }, ['Every login, task action and admin change is recorded here for accountability.']),
      el('div', { class: 'panel' }, [
        el('table', { class: 'table' }, [
          el('thead', {}, [el('tr', {}, ['When', 'Who', 'Action', 'Detail'].map(h => el('th', {}, [h])))]),
          el('tbody', {}, db.auditLog.slice(0, 300).map(a => el('tr', {}, [
            el('td', {}, [fmtDateTime(a.ts)]), el('td', {}, [a.userName]), el('td', {}, [a.action]), el('td', {}, [a.detail])
          ])))
        ])
      ])
    ]));
  }

  // ================= SETTINGS =================
  function renderAdminSettings(container) {
    const db = App.State.db, actor = App.State.user;
    if (!App.Auth.can(actor.role, 'manageSettings')) return accessDenied(container, 'manageSettings');
    container.innerHTML = '';

    const nameInput = el('input', { class: 'input', value: db.settings.cafeName });
    const openInput = el('input', { class: 'input', type: 'time', value: db.settings.openTime });
    const closeInput = el('input', { class: 'input', type: 'time', value: db.settings.closeTime });
    const kitchenInput = el('input', { class: 'input', type: 'time', value: db.settings.kitchenCloseTime });

    container.appendChild(el('div', { class: 'page' }, [
      el('h1', {}, ['Settings']),
      el('div', { class: 'panel form-grid' }, [
        el('label', { class: 'field-label' }, ['Cafe name']), nameInput,
        el('label', { class: 'field-label' }, ['Opening time']), openInput,
        el('label', { class: 'field-label' }, ['Closing time']), closeInput,
        el('label', { class: 'field-label' }, ['Kitchen stops prep at']), kitchenInput,
        el('button', {
          class: 'btn btn-primary', onClick: () => {
            db.settings.cafeName = nameInput.value.trim() || db.settings.cafeName;
            db.settings.openTime = openInput.value; db.settings.closeTime = closeInput.value; db.settings.kitchenCloseTime = kitchenInput.value;
            App.Storage.addAudit(db, actor.id, actor.name, 'settings_update', 'Updated cafe settings');
            App.Storage.save(db);
            toast('Settings saved');
            App.App.render();
          }
        }, ['Save settings'])
      ]),
      el('div', { class: 'panel' }, [
        el('h2', {}, ['Demo data']),
        el('p', { class: 'muted' }, ['This resets all users, tasks, skills and completion history back to the sample demo data. Use for testing only.']),
        el('button', {
          class: 'btn btn-danger', onClick: () => {
            if (!confirmAction('This will erase all current data. Continue?')) return;
            App.Storage.resetDB();
            App.State.db = App.Storage.load();
            toast('Demo data reset');
            App.App.render();
          }
        }, ['Reset to demo data'])
      ])
    ]));
  }

  global.App = global.App || {};
  global.App.ViewsAdmin = {
    renderAdminUsers, renderAdminTasks, renderAdminSkills, renderAdminReports, renderAdminAudit, renderAdminSettings
  };
})(window);
