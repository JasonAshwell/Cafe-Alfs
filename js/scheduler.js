/* ============================================================
   scheduler.js - recurrence engine
   Turns a task's frequency definition into concrete "instances"
   (things that are due) for a given date, and works out their
   status (upcoming / due / overdue / completed).
   ============================================================ */
(function (global) {

  function pad2(n) { return String(n).padStart(2, '0'); }

  function dateStr(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function parseDateStr(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function combineDateTime(dStr, tStr) {
    const [y, m, d] = dStr.split('-').map(Number);
    const [hh, mm] = (tStr || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0);
  }

  function lastDayOfMonth(dStr) {
    const [y, m] = dStr.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }

  // Apply a +/- minute offset to a Date, returned as 'HH:MM' (for display/labels)
  function offsetTimeStr(baseTimeStr, offsetMinutes) {
    const [hh, mm] = (baseTimeStr || '00:00').split(':').map(Number);
    const total = hh * 60 + mm + (offsetMinutes || 0);
    const wrapped = ((total % 1440) + 1440) % 1440; // clamp into a single day for display
    return pad2(Math.floor(wrapped / 60)) + ':' + pad2(wrapped % 60);
  }

  // Returns array of { slotId, label, dueAt (Date) } for the given task on the given date (dStr = 'YYYY-MM-DD').
  // `settings` (cafe openTime/closeTime) is required for 'opening'/'closing' frequency tasks, whose due time
  // tracks the cafe's configured hours rather than a fixed clock time set on the task itself.
  function instancesForDate(task, dStr, settings) {
    const f = task.frequency;
    const d = parseDateStr(dStr);
    const dow = d.getDay(); // 0=Sun..6=Sat
    const out = [];

    if (f.type === 'hourly') {
      const [fromH] = f.fromTime.split(':').map(Number);
      const [toH] = f.toTime.split(':').map(Number);
      for (let h = fromH; h <= toH; h++) {
        const slotId = pad2(h) + ':00';
        out.push({ slotId, label: slotId, dueAt: combineDateTime(dStr, slotId) });
      }
    } else if (f.type === 'daily') {
      out.push({ slotId: 'daily', label: 'By ' + f.dueTime, dueAt: combineDateTime(dStr, f.dueTime) });
    } else if (f.type === 'weekly') {
      if (f.days.includes(dow)) {
        out.push({ slotId: 'weekly', label: 'By ' + f.dueTime, dueAt: combineDateTime(dStr, f.dueTime) });
      }
    } else if (f.type === 'monthly') {
      const targetDay = f.dayOfMonth === 'last' ? lastDayOfMonth(dStr) : f.dayOfMonth;
      if (d.getDate() === targetDay) {
        out.push({ slotId: 'monthly', label: 'By ' + f.dueTime, dueAt: combineDateTime(dStr, f.dueTime) });
      }
    } else if (f.type === 'opening' || f.type === 'closing') {
      const baseTime = f.type === 'opening' ? (settings && settings.openTime) : (settings && settings.closeTime);
      const dueTimeStr = offsetTimeStr(baseTime || (f.type === 'opening' ? '07:00' : '14:00'), f.offsetMinutes);
      const label = (f.type === 'opening' ? 'Opening' : 'Closing') + ' (' + dueTimeStr + ')';
      out.push({ slotId: f.type, label, dueAt: combineDateTime(dStr, dueTimeStr) });
    }
    return out;
  }

  function frequencyLabel(f, settings) {
    if (f.type === 'hourly') return 'Hourly (' + f.fromTime + '-' + f.toTime + ')';
    if (f.type === 'daily') return 'Daily, due ' + f.dueTime;
    if (f.type === 'weekly') {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return 'Weekly (' + f.days.map(x => names[x]).join(', ') + '), due ' + f.dueTime;
    }
    if (f.type === 'monthly') return 'Monthly (day ' + f.dayOfMonth + '), due ' + f.dueTime;
    if (f.type === 'opening' || f.type === 'closing') {
      const baseTime = (settings && (f.type === 'opening' ? settings.openTime : settings.closeTime)) || (f.type === 'opening' ? '07:00' : '14:00');
      const dueTimeStr = offsetTimeStr(baseTime, f.offsetMinutes);
      const offset = f.offsetMinutes || 0;
      const offsetDesc = offset === 0 ? 'at ' + (f.type === 'opening' ? 'opening' : 'closing') : (offset > 0 ? offset + ' min after ' : (-offset) + ' min before ') + (f.type === 'opening' ? 'opening' : 'closing');
      return (f.type === 'opening' ? 'Opening routine' : 'Closing routine') + ' (' + offsetDesc + ', currently ' + dueTimeStr + ')';
    }
    return 'Unknown';
  }

  // Find a completion record for a specific task/date/slot
  function findCompletion(db, taskId, dStr, slotId) {
    return db.completions.find(c => c.taskId === taskId && c.dateStr === dStr && c.slotId === slotId);
  }

  // Build the full list of task occurrences for a date range, across active tasks,
  // annotated with status relative to "now".
  function buildAgenda(db, fromDate, toDate, now) {
    now = now || new Date();
    const rows = [];
    const cur = new Date(fromDate);
    while (cur <= toDate) {
      const dStr = dateStr(cur);
      db.tasks.filter(t => t.active).forEach(task => {
        instancesForDate(task, dStr, db.settings).forEach(inst => {
          const completion = findCompletion(db, task.id, dStr, inst.slotId);
          let status = 'upcoming';
          if (completion) {
            status = completion.status === 'skipped' ? 'skipped' : 'completed';
          } else if (inst.dueAt < now) {
            status = 'overdue';
          } else if (dateStr(inst.dueAt) === dateStr(now)) {
            status = 'due_today';
          }
          rows.push({
            task, dateStr: dStr, slotId: inst.slotId, label: inst.label,
            dueAt: inst.dueAt, status, completion: completion || null
          });
        });
      });
      cur.setDate(cur.getDate() + 1);
    }
    rows.sort((a, b) => a.dueAt - b.dueAt);
    return rows;
  }

  function isEligible(user, task) {
    if (!user.active) return false;
    if ((task.minAge || 0) > (user.age || 0)) return false;
    const req = task.requiredSkills || [];
    return req.every(sid => (user.skills || []).includes(sid));
  }

  function eligibilityGaps(user, task) {
    const gaps = [];
    if ((task.minAge || 0) > (user.age || 0)) gaps.push('Minimum age ' + task.minAge + ' required');
    const req = task.requiredSkills || [];
    const missing = req.filter(sid => !(user.skills || []).includes(sid));
    if (missing.length) gaps.push('Missing skill(s): ' + missing.join(', '));
    return gaps;
  }

  global.App = global.App || {};
  global.App.Scheduler = {
    dateStr, parseDateStr, combineDateTime, offsetTimeStr, instancesForDate, frequencyLabel,
    findCompletion, buildAgenda, isEligible, eligibilityGaps
  };
})(window);
