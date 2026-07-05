/* ============================================================
   Cafe Alf Fresco - Compliance Tracker
   storage.js - Supabase data layer
   ------------------------------------------------------------
   Replaces the localStorage prototype with a Supabase backend.
   Public interface is unchanged: load(), save(), resetDB(),
   addAudit(). One new export: init() — call it once on startup
   and await it before calling App.App.init().

   Data is loaded into memory on init(), so all reads are
   synchronous (same as before). Writes go to memory immediately
   and sync to Supabase asynchronously in the background.
   ============================================================ */
(function (global) {

  // Teams are a categorisation of "who normally does this" (job area), separate from
  // the Role-based security permissions (Admin/Manager/Supervisor/Staff — see auth.js).
  const TEAMS = ['Manager', 'Supervisor', 'Kitchen Staff', 'Front of House Staff'];

  let _db = null;          // in-memory database (single source of truth for reads)
  let _client = null;      // Supabase client instance
  let _prevState = null;   // snapshot of last-synced state (for diffing)
  let _syncQueue = Promise.resolve(); // serialised async writes

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------

  function uid(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  // ---------------------------------------------------------------
  // Seed / default data  (unchanged from prototype)
  // ---------------------------------------------------------------

  function defaultDB() {
    const skills = [
      { id: 'sk_hygiene2', name: 'Food Hygiene Level 2' },
      { id: 'sk_allergen', name: 'Allergen Awareness' },
      { id: 'sk_cash',     name: 'Cash Handling' },
      { id: 'sk_barista',  name: 'Barista / Coffee Machine' },
      { id: 'sk_coshh',    name: 'Cleaning Chemicals (COSHH)' },
      { id: 'sk_knife',    name: 'Knife Skills' },
      { id: 'sk_firstaid', name: 'First Aid' }
    ];

    const users = [
      { id: 'u_admin', name: 'Jason Ashwell',      role: 'Admin',      team: 'Manager',              age: 45, skills: skills.map(s => s.id), pin: '1234', active: true },
      { id: 'u_mgr',   name: 'Morgan (Manager)',    role: 'Manager',    team: 'Manager',              age: 29, skills: ['sk_hygiene2','sk_allergen','sk_cash','sk_firstaid'], pin: '1111', active: true },
      { id: 'u_sup',   name: 'Sam (Supervisor)',    role: 'Supervisor', team: 'Supervisor',           age: 24, skills: ['sk_hygiene2','sk_allergen','sk_barista','sk_cash'], pin: '2222', active: true },
      { id: 'u_staff1',name: 'Alex (Staff)',        role: 'Staff',      team: 'Front of House Staff', age: 19, skills: ['sk_hygiene2','sk_barista'], pin: '3333', active: true },
      { id: 'u_staff2',name: 'Jamie (Staff, 17)',   role: 'Staff',      team: 'Kitchen Staff',        age: 17, skills: ['sk_allergen'], pin: '4444', active: true }
    ];

    const tasks = [
      // Hourly
      { id: uid('t'), title: 'Check hot-hold food temperatures', category: 'Food Hygiene & Safety', team: 'Kitchen Staff', expectedMinutes: 5,
        description: 'Record temperature of all hot-held food. Must be 63°C or above.',
        frequency: { type: 'hourly', fromTime: '07:00', toTime: '13:00' },
        requiredSkills: ['sk_hygiene2'], minAge: 18, mandatory: true, active: true },
      { id: uid('t'), title: 'Check fridge & display chiller temperatures', category: 'Food Hygiene & Safety', team: 'Kitchen Staff', expectedMinutes: 5,
        description: 'Fridges must be 5°C or below. Log any that are out of range and act immediately.',
        frequency: { type: 'hourly', fromTime: '07:00', toTime: '13:00' },
        requiredSkills: ['sk_hygiene2'], minAge: 16, mandatory: true, active: true },
      { id: uid('t'), title: 'Wipe down front-of-house tables & surfaces', category: 'Cleanliness', team: 'Front of House Staff', expectedMinutes: 10,
        description: 'Sanitise all customer tables, condiment stations and counters.',
        frequency: { type: 'hourly', fromTime: '07:00', toTime: '13:00' },
        requiredSkills: [], minAge: 16, mandatory: false, active: true },

      // Opening / Closing
      { id: uid('t'), title: 'Opening checks: equipment, fridge temps, cleanliness walk-through', category: 'Opening/Closing Procedures', team: 'Manager', expectedMinutes: 15,
        description: 'Full walk-through before doors open.',
        frequency: { type: 'opening', offsetMinutes: 15 },
        requiredSkills: ['sk_hygiene2'], minAge: 18, mandatory: true, active: true },
      { id: uid('t'), title: 'Cash float count & reconciliation (AM)', category: 'Cash Management', team: 'Front of House Staff', expectedMinutes: 10,
        description: 'Count and record the opening float against expected amount.',
        frequency: { type: 'opening', offsetMinutes: 15 },
        requiredSkills: ['sk_cash'], minAge: 18, mandatory: true, active: true },
      { id: uid('t'), title: 'Allergen matrix & specials board review', category: 'Food Hygiene & Safety', team: 'Front of House Staff', expectedMinutes: 10,
        description: 'Confirm allergen info is correct and visible for all menu items and specials.',
        frequency: { type: 'opening', offsetMinutes: 60 },
        requiredSkills: ['sk_allergen'], minAge: 16, mandatory: true, active: true },
      { id: uid('t'), title: 'Deep clean coffee machine & grinders', category: 'Cleanliness', team: 'Front of House Staff', expectedMinutes: 15,
        description: 'Backflush, clean group heads, empty and wash grinder hoppers.',
        frequency: { type: 'closing', offsetMinutes: -15 },
        requiredSkills: ['sk_barista'], minAge: 16, mandatory: true, active: true },
      { id: uid('t'), title: 'Waste disposal & bin area check', category: 'Cleanliness', team: 'Kitchen Staff', expectedMinutes: 10,
        description: 'Empty internal bins, check external bin area is tidy and closed.',
        frequency: { type: 'closing', offsetMinutes: -15 },
        requiredSkills: ['sk_coshh'], minAge: 16, mandatory: false, active: true },
      { id: uid('t'), title: 'Cash reconciliation & banking (end of day)', category: 'Cash Management', team: 'Front of House Staff', expectedMinutes: 15,
        description: 'Reconcile till against sales report, prepare banking.',
        frequency: { type: 'closing', offsetMinutes: 0 },
        requiredSkills: ['sk_cash'], minAge: 18, mandatory: true, active: true },
      { id: uid('t'), title: 'Closing checks: equipment off, food covered & labelled, site secure', category: 'Opening/Closing Procedures', team: 'Manager', expectedMinutes: 15,
        description: 'Final closedown walk-through, alarm set.',
        frequency: { type: 'closing', offsetMinutes: 0 },
        requiredSkills: ['sk_hygiene2'], minAge: 18, mandatory: true, active: true },

      // Daily
      { id: uid('t'), title: 'Stock rotation check (FIFO) - fridges & dry store', category: 'Stock Control', team: 'Kitchen Staff', expectedMinutes: 15,
        description: 'Rotate stock, check use-by dates, remove/record any waste.',
        frequency: { type: 'daily', dueTime: '10:00' },
        requiredSkills: [], minAge: 16, mandatory: true, active: true },

      // Weekly
      { id: uid('t'), title: 'Full kitchen deep clean', category: 'Cleanliness', team: 'Kitchen Staff', expectedMinutes: 60,
        description: 'Weekly scheduled deep clean of kitchen surfaces, extraction and floors.',
        frequency: { type: 'weekly', days: [0], dueTime: '13:00' },
        requiredSkills: ['sk_coshh'], minAge: 18, mandatory: true, active: true },
      { id: uid('t'), title: 'Stock take & supplier order review', category: 'Stock Control', team: 'Manager', expectedMinutes: 45,
        description: 'Full stock count, raise supplier orders for the week ahead.',
        frequency: { type: 'weekly', days: [1], dueTime: '10:00' },
        requiredSkills: [], minAge: 18, mandatory: true, active: true },
      { id: uid('t'), title: 'Fire safety & first aid kit check', category: 'Health & Safety', team: 'Supervisor', expectedMinutes: 15,
        description: 'Check fire extinguishers accessible/in-date, first aid kit stocked.',
        frequency: { type: 'weekly', days: [2], dueTime: '10:00' },
        requiredSkills: ['sk_firstaid'], minAge: 18, mandatory: true, active: true },
      { id: uid('t'), title: 'Menu & allergen signage review', category: 'Food Hygiene & Safety', team: 'Front of House Staff', expectedMinutes: 15,
        description: 'Check printed allergen/menu signage matches current menu.',
        frequency: { type: 'weekly', days: [3], dueTime: '10:00' },
        requiredSkills: ['sk_allergen'], minAge: 16, mandatory: false, active: true },
      { id: uid('t'), title: 'Staff training / certificate expiry review', category: 'Food Safety Management', team: 'Manager', expectedMinutes: 30,
        description: 'Check food hygiene certificates and other training are still valid.',
        frequency: { type: 'weekly', days: [4], dueTime: '10:00' },
        requiredSkills: [], minAge: 18, mandatory: true, active: true },

      // Monthly
      { id: uid('t'), title: 'Pest control inspection walk-through', category: 'Cleanliness', team: 'Manager', expectedMinutes: 20,
        description: 'Check bait stations/traps and signs of pest activity.',
        frequency: { type: 'monthly', dayOfMonth: 1, dueTime: '10:00' },
        requiredSkills: [], minAge: 18, mandatory: true, active: true },
      { id: uid('t'), title: 'Review & update new product listings and pricing', category: 'New Products', team: 'Manager', expectedMinutes: 30,
        description: 'Add/remove menu items, confirm allergen data captured, update prices.',
        frequency: { type: 'monthly', dayOfMonth: 1, dueTime: '11:00' },
        requiredSkills: [], minAge: 18, mandatory: false, active: true },
      { id: uid('t'), title: 'Fire alarm test & log', category: 'Health & Safety', team: 'Supervisor', expectedMinutes: 10,
        description: 'Weekly-required test performed and logged (monthly reminder to review log).',
        frequency: { type: 'monthly', dayOfMonth: 15, dueTime: '10:00' },
        requiredSkills: [], minAge: 18, mandatory: true, active: true },
      { id: uid('t'), title: 'Equipment maintenance check (coffee machine descale, oven service)', category: 'Cleanliness', team: 'Supervisor', expectedMinutes: 30,
        description: 'Descale coffee machine, check service due dates for major equipment.',
        frequency: { type: 'monthly', dayOfMonth: 'last', dueTime: '13:00' },
        requiredSkills: ['sk_barista'], minAge: 18, mandatory: true, active: true },
      { id: uid('t'), title: 'Food hygiene self-audit / FSA rating action plan review', category: 'Food Safety Management', team: 'Manager', expectedMinutes: 45,
        description: 'Self-audit against Food Standards Agency rating criteria, action any gaps.',
        frequency: { type: 'monthly', dayOfMonth: 'last', dueTime: '13:30' },
        requiredSkills: ['sk_hygiene2'], minAge: 18, mandatory: true, active: true }
    ];

    return {
      version: 1,
      settings: { cafeName: 'Cafe Alf Fresco', openTime: '07:00', closeTime: '14:00', kitchenCloseTime: '13:30' },
      skills,
      users,
      tasks,
      completions: [],
      auditLog: []
    };
  }

  // ---------------------------------------------------------------
  // Format transforms: app (camelCase) ↔ Supabase (snake_case)
  // ---------------------------------------------------------------

  function dbToSettings(r) {
    return {
      cafeName:        r.cafe_name,
      openTime:        r.open_time,
      closeTime:       r.close_time,
      kitchenCloseTime: r.kitchen_close_time
    };
  }

  function settingsToDb(s) {
    return {
      key:               'singleton',
      cafe_name:         s.cafeName,
      open_time:         s.openTime,
      close_time:        s.closeTime,
      kitchen_close_time: s.kitchenCloseTime
    };
  }

  // skills: { id, name } — identical in both formats
  function dbToUser(r) {
    return { id: r.id, name: r.name, role: r.role, team: r.team, age: r.age,
             skills: r.skills || [], pin: r.pin, active: r.active };
  }
  function userToDb(u) {
    return { id: u.id, name: u.name, role: u.role, team: u.team, age: u.age,
             skills: u.skills, pin: u.pin, active: u.active };
  }

  function dbToTask(r) {
    return { id: r.id, title: r.title, category: r.category, team: r.team,
             expectedMinutes: r.expected_minutes, description: r.description,
             frequency: r.frequency, requiredSkills: r.required_skills || [],
             minAge: r.min_age, mandatory: r.mandatory, active: r.active };
  }
  function taskToDb(t) {
    return { id: t.id, title: t.title, category: t.category, team: t.team,
             expected_minutes: t.expectedMinutes, description: t.description,
             frequency: t.frequency, required_skills: t.requiredSkills,
             min_age: t.minAge, mandatory: t.mandatory, active: t.active };
  }

  function dbToCompletion(r) {
    return { id: r.id, taskId: r.task_id, dateStr: r.date_str, slotId: r.slot_id,
             userId: r.user_id, completedAt: r.completed_at, status: r.status,
             notes: r.notes, actualMinutes: r.actual_minutes };
  }
  function completionToDb(c) {
    return { id: c.id, task_id: c.taskId, date_str: c.dateStr, slot_id: c.slotId,
             user_id: c.userId, completed_at: c.completedAt, status: c.status,
             notes: c.notes, actual_minutes: c.actualMinutes };
  }

  function dbToAudit(r) {
    return { id: r.id, ts: r.ts, userId: r.user_id, userName: r.user_name,
             action: r.action, detail: r.detail };
  }
  function auditToDb(a) {
    return { id: a.id, ts: a.ts, user_id: a.userId, user_name: a.userName,
             action: a.action, detail: a.detail };
  }

  // ---------------------------------------------------------------
  // Supabase sync helpers
  // ---------------------------------------------------------------

  async function syncChanges(db, prev) {
    if (!_client) return;

    // Settings (always sync — single row, cheap)
    const { error: se } = await _client.from('settings').upsert(settingsToDb(db.settings));
    if (se) console.error('[Storage] settings sync error:', se.message);

    // Skills
    if (!prev || JSON.stringify(db.skills) !== JSON.stringify(prev.skills)) {
      if (db.skills.length) {
        const { error } = await _client.from('skills').upsert(db.skills);
        if (error) console.error('[Storage] skills upsert error:', error.message);
      }
      // Handle deletions
      if (prev) {
        const prevIds = new Set(prev.skills.map(s => s.id));
        const newIds  = new Set(db.skills.map(s => s.id));
        const deleted = [...prevIds].filter(id => !newIds.has(id));
        if (deleted.length) {
          const { error } = await _client.from('skills').delete().in('id', deleted);
          if (error) console.error('[Storage] skills delete error:', error.message);
        }
      }
    }

    // Users
    if (!prev || JSON.stringify(db.users) !== JSON.stringify(prev.users)) {
      if (db.users.length) {
        const { error } = await _client.from('users').upsert(db.users.map(userToDb));
        if (error) console.error('[Storage] users upsert error:', error.message);
      }
      if (prev) {
        const prevIds = new Set(prev.users.map(u => u.id));
        const newIds  = new Set(db.users.map(u => u.id));
        const deleted = [...prevIds].filter(id => !newIds.has(id));
        if (deleted.length) {
          const { error } = await _client.from('users').delete().in('id', deleted);
          if (error) console.error('[Storage] users delete error:', error.message);
        }
      }
    }

    // Tasks
    if (!prev || JSON.stringify(db.tasks) !== JSON.stringify(prev.tasks)) {
      if (db.tasks.length) {
        const { error } = await _client.from('tasks').upsert(db.tasks.map(taskToDb));
        if (error) console.error('[Storage] tasks upsert error:', error.message);
      }
      if (prev) {
        const prevIds = new Set(prev.tasks.map(t => t.id));
        const newIds  = new Set(db.tasks.map(t => t.id));
        const deleted = [...prevIds].filter(id => !newIds.has(id));
        if (deleted.length) {
          const { error } = await _client.from('tasks').delete().in('id', deleted);
          if (error) console.error('[Storage] tasks delete error:', error.message);
        }
      }
    }

    // Completions (append-only — only sync new entries by ID)
    const prevCompIds = prev ? new Set(prev.completions.map(c => c.id)) : new Set();
    const newCompletions = db.completions.filter(c => !prevCompIds.has(c.id));
    if (newCompletions.length) {
      const { error } = await _client.from('completions').upsert(newCompletions.map(completionToDb));
      if (error) console.error('[Storage] completions upsert error:', error.message);
    }

    // Audit log (append-only — only insert new entries by ID)
    const prevAuditIds = prev ? new Set(prev.auditLog.map(a => a.id)) : new Set();
    const newAuditEntries = db.auditLog.filter(a => !prevAuditIds.has(a.id));
    if (newAuditEntries.length) {
      // Reverse so we insert chronologically (auditLog array is newest-first)
      const { error } = await _client.from('audit_log').insert(newAuditEntries.slice().reverse().map(auditToDb));
      if (error) console.error('[Storage] audit_log insert error:', error.message);
    }
  }

  async function seedDatabase(db) {
    const { error: se } = await _client.from('settings').upsert(settingsToDb(db.settings));
    if (se) throw new Error('Failed to seed settings: ' + se.message);
    if (db.skills.length) {
      const { error } = await _client.from('skills').upsert(db.skills);
      if (error) throw new Error('Failed to seed skills: ' + error.message);
    }
    if (db.users.length) {
      const { error } = await _client.from('users').upsert(db.users.map(userToDb));
      if (error) throw new Error('Failed to seed users: ' + error.message);
    }
    if (db.tasks.length) {
      const { error } = await _client.from('tasks').upsert(db.tasks.map(taskToDb));
      if (error) throw new Error('Failed to seed tasks: ' + error.message);
    }
    // completions and auditLog are empty on first run
  }

  async function fullResetInSupabase(db) {
    // Clear dynamic data tables
    await _client.from('completions').delete().not('id', 'is', null);
    await _client.from('audit_log').delete().not('id', 'is', null);
    // Re-seed everything
    await seedDatabase(db);
  }

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------

  /**
   * init() — call once on page load before App.App.init().
   * Connects to Supabase, loads all data into memory, and seeds
   * the database if it is empty (first run).
   */
  async function init() {
    if (typeof supabase === 'undefined') {
      throw new Error('Supabase SDK not loaded. Check your internet connection.');
    }

    const cfg = global.App && global.App.Config;
    if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR_')) {
      throw new Error(
        'Supabase not configured. Open js/config.js and replace the placeholder ' +
        'values with your real project URL and anon key (see SETUP.md).'
      );
    }

    _client = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    // Load data from Supabase (completions limited to last 365 days for performance)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);
    const dateLimit = cutoff.toISOString().slice(0, 10);

    const [settingsRes, skillsRes, usersRes, tasksRes, completionsRes, auditRes] = await Promise.all([
      _client.from('settings').select('*').eq('key', 'singleton').maybeSingle(),
      _client.from('skills').select('*'),
      _client.from('users').select('*'),
      _client.from('tasks').select('*'),
      _client.from('completions').select('*').gte('date_str', dateLimit),
      _client.from('audit_log').select('*').order('ts', { ascending: false }).limit(1000)
    ]);

    // Surface any database-level errors
    for (const res of [skillsRes, usersRes, tasksRes, completionsRes, auditRes]) {
      if (res.error) throw new Error('Database error: ' + res.error.message);
    }

    if (!settingsRes.data || !usersRes.data || !usersRes.data.length) {
      // First run — populate with demo/seed data
      _db = defaultDB();
      _prevState = null;
      await seedDatabase(_db);
      _prevState = JSON.parse(JSON.stringify(_db));
      return;
    }

    _db = {
      version: 1,
      settings:    dbToSettings(settingsRes.data),
      skills:      skillsRes.data,
      users:       usersRes.data.map(dbToUser),
      tasks:       tasksRes.data.map(dbToTask),
      completions: completionsRes.data.map(dbToCompletion),
      auditLog:    auditRes.data.map(dbToAudit)
    };
    _prevState = JSON.parse(JSON.stringify(_db));
  }

  /** load() — returns the in-memory database synchronously (same as before). */
  function load() {
    return _db;
  }

  /**
   * save(db) — updates in-memory state immediately, then queues an async
   * write to Supabase. The UI is never blocked waiting for the write.
   */
  function save(db) {
    const prev = _prevState;
    _db = db;
    _prevState = JSON.parse(JSON.stringify(db));
    _syncQueue = _syncQueue
      .then(() => syncChanges(db, prev))
      .catch(err => console.error('[Storage] Sync error:', err));
  }

  /**
   * resetDB() — resets to demo data in memory and queues a full Supabase reset.
   * Returns the new db synchronously (same signature as the prototype).
   */
  function resetDB() {
    const db = defaultDB();
    _db = db;
    _prevState = null; // force full sync on next write
    _syncQueue = _syncQueue
      .then(() => fullResetInSupabase(db))
      .then(() => { _prevState = JSON.parse(JSON.stringify(db)); })
      .catch(err => console.error('[Storage] Reset error:', err));
    return db;
  }

  /** addAudit() — unchanged from prototype; caller must call save() afterwards. */
  function addAudit(db, userId, userName, action, detail) {
    db.auditLog.unshift({
      id: uid('a'), ts: new Date().toISOString(),
      userId, userName, action, detail
    });
    if (db.auditLog.length > 1000) db.auditLog.length = 1000;
  }

  global.App = global.App || {};
  global.App.Storage = { TEAMS, uid, defaultDB, load, save, resetDB, addAudit, init };

})(window);
