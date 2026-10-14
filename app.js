'use strict';
(function () {

const VERSION = '1.0.0';
const $ = (s, r = document) => r.querySelector(s);
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const BACKUP_REMINDER_DAYS = 14;

/* ---------- utilidades ---------- */

function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  let value;
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k === 'value') value = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  if (value !== undefined) e.value = value;
  return e;
}

const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dstr(new Date());
const fmtBR = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : ''; };
const fmtNum = n => String(n).replace('.', ',');
const sortKey = s => s.date + String(s.finishedAt || s.startedAt || 0).padStart(15, '0');

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- armazenamento (IndexedDB) ---------- */

let db;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('treino-app', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kv');
      r.result.createObjectStore('sessions', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    let out;
    const req = fn(t.objectStore(store));
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

const kvGet = k => tx('kv', 'readonly', s => s.get(k));
const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));
const sessAll = () => tx('sessions', 'readonly', s => s.getAll());
const sessPut = v => tx('sessions', 'readwrite', s => s.put(v));
const sessDel = id => tx('sessions', 'readwrite', s => s.delete(id));

function replaceAll(plan, sessions) {
  return new Promise((res, rej) => {
    const t = db.transaction(['kv', 'sessions'], 'readwrite');
    t.objectStore('kv').put(plan, 'plan');
    const ss = t.objectStore('sessions');
    ss.clear();
    sessions.forEach(s => ss.put(s));
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

/* ---------- plano inicial ---------- */

function ex(id, name, sets, repMin, repMax, rest, step) {
  return { id, name, sets, repMin, repMax, rest, step };
}

function defaultPlan() {
  return {
    days: [
      {
        id: 'd1', name: 'Dia 1: Upper', exercises: [
          ex('d1e1', 'Supino reto (barra ou halteres)', 3, 6, 10, '2-3 min', 2.5),
          ex('d1e2', 'Remada curvada ou sentada no cabo', 3, 8, 12, '2-3 min', 2.5),
          ex('d1e3', 'Desenvolvimento com halteres', 3, 8, 12, '2-3 min', 2),
          ex('d1e4', 'Puxada na frente', 3, 8, 12, '2-3 min', 2.5),
          ex('d1e5', 'Elevação lateral', 3, 12, 15, '60-90 s', 1),
          ex('d1e6', 'Rosca direta', 3, 10, 12, '60-90 s', 1),
          ex('d1e7', 'Tríceps na polia', 3, 10, 15, '60-90 s', 2.5)
        ]
      },
      {
        id: 'd2', name: 'Dia 2: Lower', exercises: [
          ex('d2e1', 'Agachamento (livre ou hack)', 4, 6, 10, '2-3 min', 2.5),
          ex('d2e2', 'Stiff / levantamento terra romeno', 3, 8, 10, '2-3 min', 2.5),
          ex('d2e3', 'Leg press', 3, 10, 12, '2-3 min', 5),
          ex('d2e4', 'Mesa flexora', 3, 10, 15, '60-90 s', 2.5),
          ex('d2e5', 'Panturrilha em pé', 4, 10, 15, '60-90 s', 2.5),
          ex('d2e6', 'Abdominal (prancha ou polia)', 3, 10, 15, '60-90 s', 1)
        ]
      },
      {
        id: 'd3', name: 'Dia 3: Full body', exercises: [
          ex('d3e1', 'Supino inclinado com halteres', 3, 8, 12, '2-3 min', 2),
          ex('d3e2', 'Remada unilateral com halter', 3, 8, 12, '2-3 min', 2),
          ex('d3e3', 'Afundo ou agachamento búlgaro (por perna)', 3, 8, 12, '2-3 min', 2),
          ex('d3e4', 'Cadeira extensora', 3, 12, 15, '60-90 s', 2.5),
          ex('d3e5', 'Crucifixo (peck deck ou cabos)', 2, 12, 15, '60-90 s', 2.5),
          ex('d3e6', 'Face pull', 3, 12, 15, '60-90 s', 2.5),
          ex('d3e7', 'Rosca martelo', 2, 10, 15, '60-90 s', 1),
          ex('d3e8', 'Tríceps testa', 2, 10, 15, '60-90 s', 1)
        ]
      }
    ]
  };
}

/* ---------- estado ---------- */

const now = new Date();
const state = {
  plan: null,
  sessions: [],
  tab: 'hoje',
  cal: { y: now.getFullYear(), m: now.getMonth() },
  calSel: todayStr(),
  lastBackup: 0,
  installEvt: null
};

const savePlan = () => kvSet('plan', state.plan);
const activeSession = () => state.sessions.filter(s => !s.done).sort((a, b) => b.startedAt - a.startedAt)[0];
const dayIdx = id => Math.max(0, state.plan.days.findIndex(d => d.id === id)) % 3;

/* ---------- salvamento automático da sessão ---------- */

let saveTimer = null;
let dirty = null;
function scheduleSave(s) {
  dirty = s;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
async function flush() {
  clearTimeout(saveTimer);
  if (dirty) {
    const s = dirty;
    dirty = null;
    await sessPut(s);
  }
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);

/* ---------- lógica de treino ---------- */

function doneSets(e) { return e.sets.filter(x => x.done); }

function lastPerf(exId, sid) {
  let best = null;
  for (const s of state.sessions) {
    if (!s.done || s.id === sid) continue;
    const e = s.entries.find(x => x.exId === exId);
    if (!e) continue;
    const ds = doneSets(e);
    if (!ds.length) continue;
    const key = sortKey(s);
    if (!best || key > best.key) best = { key, session: s, entry: e, sets: ds };
  }
  return best;
}

// Dupla progressão: todas as séries planejadas feitas, repetições no topo da faixa e RIR <= 2.
function suggestion(last, entry) {
  if (!last) return null;
  const e = last.entry, ds = last.sets;
  if (ds.length < e.setsPlan) return null;
  if (!ds.every(x => x.reps !== '' && x.reps >= e.repMax)) return null;
  if (!ds.every(x => x.rir === '' || x.rir <= 2)) return null;
  const loads = ds.map(x => x.load).filter(x => x !== '');
  const step = entry.step > 0 ? entry.step : 0;
  if (!loads.length || !step) return null;
  return Math.round((Math.max(...loads) + step) * 100) / 100;
}

function setsText(sets) {
  return sets.map(s => `${s.load === '' ? '-' : fmtNum(s.load)} x ${s.reps === '' ? '-' : s.reps}`).join(', ');
}

function newSession(dayId, date) {
  const day = state.plan.days.find(d => d.id === dayId);
  const s = { id: uid(), date, dayId, dayName: day.name, startedAt: Date.now(), done: false, symptoms: '', entries: [] };
  for (const x of day.exercises) {
    const last = lastPerf(x.id, s.id);
    const entry = { exId: x.id, name: x.name, setsPlan: x.sets, repMin: x.repMin, repMax: x.repMax, rest: x.rest, step: x.step, sets: [] };
    for (let i = 0; i < x.sets; i++) {
      const ref = last ? (last.sets[i] || last.sets[last.sets.length - 1]) : null;
      entry.sets.push({ load: ref ? ref.load : '', reps: '', rir: '', done: false });
    }
    s.entries.push(entry);
  }
  return s;
}

async function startSession(dayId, date) {
  if (activeSession()) { toast('Conclua ou descarte o treino em andamento.'); return; }
  const s = newSession(dayId, date);
  state.sessions.push(s);
  await sessPut(s);
  state.tab = 'hoje';
  render();
  window.scrollTo(0, 0);
}

function nextDayId() {
  const done = state.sessions.filter(s => s.done).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const days = state.plan.days;
  const last = done[done.length - 1];
  if (!last) return days[0].id;
  const i = days.findIndex(d => d.id === last.dayId);
  return days[(i + 1) % days.length].id;
}

async function finishSession(s) {
  const n = s.entries.reduce((a, e) => a + doneSets(e).length, 0);
  if (n === 0 && !confirm('Nenhuma série foi marcada como feita. Concluir mesmo assim?')) return;
  s.done = true;
  s.finishedAt = Date.now();
  dirty = null;
  clearTimeout(saveTimer);
  await sessPut(s);
  toast('Treino concluído.');
  render();
  window.scrollTo(0, 0);
}

async function discardSession(s) {
  if (!confirm('Descartar este treino? Os registros dele serão apagados.')) return;
  dirty = null;
  clearTimeout(saveTimer);
  state.sessions = state.sessions.filter(x => x.id !== s.id);
  await sessDel(s.id);
  render();
}

/* ---------- tela: Hoje ---------- */

function viewHoje(v) {
  const act = activeSession();
  if (act) return sessionView(v, act);

  const days = state.plan.days;
  const nextId = nextDayId();
  const sel = h('select', { id: 'daysel', 'aria-label': 'Dia do treino' },
    days.map(d => h('option', { value: d.id, selected: d.id === nextId }, d.name)));

  const done = state.sessions.filter(s => s.done).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  v.append(h('section', { class: 'card' },
    h('h2', null, 'Próximo treino'),
    h('p', { class: 'muted' }, done.length
      ? `Último treino concluído: ${done[0].dayName}, em ${fmtBR(done[0].date)}.`
      : 'Nenhum treino registrado ainda.'),
    h('label', { class: 'field' }, h('span', null, 'Dia do treino'), sel),
    h('button', { class: 'btn primary block', onclick: () => startSession(sel.value, todayStr()) }, 'Iniciar treino')
  ));

  const overdue = done.length && (Date.now() - state.lastBackup) > BACKUP_REMINDER_DAYS * 86400000;
  if (overdue) {
    v.append(h('section', { class: 'card' },
      h('p', null, state.lastBackup
        ? `Seu último backup foi em ${fmtBR(dstr(new Date(state.lastBackup)))}.`
        : 'Você ainda não fez backup dos seus registros.'),
      h('button', { class: 'btn', onclick: () => { state.tab = 'backup'; render(); } }, 'Ir para Backup')));
  }
}

function setRow(s, e, set, i) {
  const field = (key, label, mode) => {
    const input = h('input', {
      type: 'text', inputmode: mode, autocomplete: 'off',
      'aria-label': `${label}, série ${i + 1}, ${e.name}`,
      value: set[key] === '' ? '' : (key === 'load' ? fmtNum(set[key]) : String(set[key])),
      oninput: ev => { set[key] = num(ev.target.value); scheduleSave(s); }
    });
    return h('label', { class: 'f' }, h('span', null, label), input);
  };
  const fLoad = field('load', 'kg', 'decimal');
  const fReps = field('reps', 'reps', 'numeric');
  const fRir = field('rir', 'RIR', 'numeric');
  const row = h('div', { class: 'set' + (set.done ? ' done' : '') });
  const chk = h('button', {
    type: 'button', class: 'chk', 'aria-pressed': String(!!set.done),
    'aria-label': `Série ${i + 1} feita`,
    onclick: () => {
      if (!set.done && set.reps === '') {
        toast('Informe as repetições.');
        $('input', fReps).focus();
        return;
      }
      set.done = !set.done;
      row.classList.toggle('done', set.done);
      chk.setAttribute('aria-pressed', String(set.done));
      scheduleSave(s);
    }
  }, '✓');
  row.append(chk, h('span', { class: 'sn' }, String(i + 1)), fLoad, fReps, fRir);
  return row;
}

function sessionView(v, s) {
  v.append(h('p', { class: 'note' }, 'Leve a bombinha de resgate. Pare o treino se houver falta de ar, tosse ou chiado.'));
  v.append(h('div', { class: 'sess-head' },
    h('h2', null, s.dayName),
    h('p', { class: 'muted' }, fmtBR(s.date) + (s.date !== todayStr() ? ' (data diferente de hoje)' : ''))));

  s.entries.forEach(e => {
    const last = lastPerf(e.exId, s.id);
    const sug = suggestion(last, e);
    const card = h('section', { class: 'card' });
    card.append(h('h3', null, e.name));
    card.append(h('p', { class: 'muted' }, `${e.setsPlan} x ${e.repMin}-${e.repMax}, descanso ${e.rest}`));
    if (last) card.append(h('p', { class: 'muted' }, `Última vez (${fmtBR(last.session.date)}), kg x repetições: ${setsText(last.sets)}`));
    if (sug !== null) {
      card.append(h('div', { class: 'sugg' },
        h('span', null, `Todas as séries no topo da faixa. Sugestão: ${fmtNum(sug)} kg.`),
        h('button', {
          class: 'btn small',
          onclick: () => { e.sets.forEach(x => { if (!x.done) x.load = sug; }); scheduleSave(s); render(); }
        }, 'Aplicar')));
    }
    e.sets.forEach((set, i) => card.append(setRow(s, e, set, i)));
    card.append(h('div', { class: 'row' },
      h('button', {
        class: 'btn small',
        onclick: () => {
          const prev = e.sets[e.sets.length - 1];
          e.sets.push({ load: prev ? prev.load : '', reps: '', rir: '', done: false });
          scheduleSave(s); render();
        }
      }, 'Adicionar série'),
      h('button', {
        class: 'btn small',
        onclick: () => { if (e.sets.length > 1) { e.sets.pop(); scheduleSave(s); render(); } }
      }, 'Remover última série')));
    v.append(card);
  });

  v.append(h('section', { class: 'card' },
    h('label', { class: 'field' },
      h('span', null, 'Dor ou sintomas (opcional)'),
      h('textarea', { rows: '3', value: s.symptoms, oninput: ev => { s.symptoms = ev.target.value; scheduleSave(s); } }))));

  v.append(h('div', { class: 'row' },
    h('button', { class: 'btn primary', onclick: () => finishSession(s) }, 'Concluir treino'),
    h('button', { class: 'btn danger', onclick: () => discardSession(s) }, 'Descartar treino')));
}

/* ---------- tela: Plano ---------- */

function moveEx(day, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= day.exercises.length) return;
  [day.exercises[i], day.exercises[j]] = [day.exercises[j], day.exercises[i]];
  savePlan().then(render);
}

function viewPlano(v) {
  v.append(h('p', { class: 'muted' }, 'Alterações valem para os próximos treinos. Treinos já registrados não mudam.'));
  state.plan.days.forEach(day => {
    const card = h('section', { class: 'card' });
    card.append(h('div', { class: 'day-head' },
      h('h2', null, day.name),
      h('button', {
        class: 'btn small',
        onclick: async () => {
          const nome = prompt('Novo nome do dia:', day.name);
          if (nome && nome.trim()) { day.name = nome.trim(); await savePlan(); render(); }
        }
      }, 'Renomear')));
    day.exercises.forEach((x, i) => {
      card.append(h('div', { class: 'ex-row' },
        h('div', { class: 'txt' },
          h('strong', null, x.name),
          h('span', { class: 'muted' }, `${x.sets} x ${x.repMin}-${x.repMax}, descanso ${x.rest}, passo ${fmtNum(x.step)} kg`)),
        h('div', { class: 'acts' },
          h('button', { class: 'btn small', 'aria-label': 'Subir', onclick: () => moveEx(day, i, -1) }, '▲'),
          h('button', { class: 'btn small', 'aria-label': 'Descer', onclick: () => moveEx(day, i, 1) }, '▼'),
          h('button', { class: 'btn small', onclick: () => editExercise(day, x) }, 'Editar'))));
    });
    card.append(h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => editExercise(day, null) }, 'Adicionar exercício')));
    v.append(card);
  });
  v.append(h('button', {
    class: 'btn danger block',
    onclick: async () => {
      if (!confirm('Restaurar o plano original? Os exercícios atuais serão substituídos. O histórico de treinos não é apagado.')) return;
      state.plan = defaultPlan();
      await savePlan();
      render();
    }
  }, 'Restaurar plano original'));
}

function editExercise(day, x) {
  const isNew = !x;
  const f = x || { name: '', sets: 3, repMin: 8, repMax: 12, rest: '60-90 s', step: 2.5 };
  const dlg = $('#dlg');
  const inName = h('input', { type: 'text', value: f.name, maxlength: '80' });
  const inSets = h('input', { type: 'number', min: '1', max: '10', inputmode: 'numeric', value: String(f.sets) });
  const inMin = h('input', { type: 'number', min: '1', max: '50', inputmode: 'numeric', value: String(f.repMin) });
  const inMax = h('input', { type: 'number', min: '1', max: '50', inputmode: 'numeric', value: String(f.repMax) });
  const inRest = h('input', { type: 'text', value: f.rest, maxlength: '20' });
  const inStep = h('input', { type: 'text', inputmode: 'decimal', value: fmtNum(f.step) });
  const diff = h('input', { type: 'checkbox' });
  const err = h('p', { class: 'err', role: 'alert' });
  const lab = (t, inp) => h('label', { class: 'field' }, h('span', null, t), inp);

  const save = async () => {
    const name = inName.value.trim();
    const sets = parseInt(inSets.value, 10);
    const repMin = parseInt(inMin.value, 10);
    const repMax = parseInt(inMax.value, 10);
    const step = num(inStep.value);
    if (!name) { err.textContent = 'Informe o nome do exercício.'; return; }
    if (!(sets >= 1)) { err.textContent = 'Séries deve ser 1 ou mais.'; return; }
    if (!(repMin >= 1 && repMax >= repMin)) { err.textContent = 'A repetição máxima deve ser maior ou igual à mínima.'; return; }
    const data = { name, sets, repMin, repMax, rest: inRest.value.trim() || '60-90 s', step: step === '' ? 0 : step };
    if (isNew) day.exercises.push({ id: uid(), ...data });
    else { Object.assign(x, data); if (diff.checked) x.id = uid(); }
    await savePlan();
    dlg.close();
    render();
  };
  const remove = async () => {
    if (!confirm('Remover este exercício do plano?')) return;
    day.exercises = day.exercises.filter(e => e !== x);
    await savePlan();
    dlg.close();
    render();
  };

  dlg.replaceChildren(
    h('h2', null, isNew ? 'Novo exercício' : 'Editar exercício'),
    lab('Nome', inName),
    h('div', { class: 'grid3' }, lab('Séries', inSets), lab('Reps mín.', inMin), lab('Reps máx.', inMax)),
    lab('Descanso', inRest),
    lab('Passo de aumento de carga (kg)', inStep),
    isNew ? null : h('label', { class: 'check' }, diff, h('span', null, 'É outro exercício: não usar o histórico de cargas do anterior')),
    err,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: save }, 'Salvar'),
      h('button', { class: 'btn', onclick: () => dlg.close() }, 'Cancelar'),
      isNew ? null : h('button', { class: 'btn danger', onclick: remove }, 'Remover')));
  dlg.showModal();
  inName.focus();
}

/* ---------- tela: Calendário ---------- */

function shiftMonth(delta) {
  const d = new Date(state.cal.y, state.cal.m + delta, 1);
  state.cal = { y: d.getFullYear(), m: d.getMonth() };
  const t = new Date();
  state.calSel = (t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth()) ? todayStr() : dstr(d);
  render();
}

function sessionSummary(s) {
  const lines = s.entries.filter(e => doneSets(e).length)
    .map(e => h('p', { class: 'sess-sum' }, h('b', null, e.name + ': '), setsText(doneSets(e))));
  return h('div', null,
    lines.length ? h('p', { class: 'muted' }, 'kg x repetições') : h('p', { class: 'muted' }, 'Sem séries registradas.'),
    lines,
    s.symptoms ? h('p', { class: 'sess-sum' }, h('b', null, 'Sintomas: '), s.symptoms) : null);
}

function viewCal(v) {
  const { y, m } = state.cal;
  const first = new Date(y, m, 1);
  const daysIn = new Date(y, m + 1, 0).getDate();
  const byDate = {};
  state.sessions.forEach(s => { (byDate[s.date] = byDate[s.date] || []).push(s); });

  const monthDone = state.sessions.filter(s => s.done && s.date.startsWith(`${y}-${pad(m + 1)}`)).length;

  v.append(h('div', { class: 'cal-head' },
    h('button', { class: 'btn small', 'aria-label': 'Mês anterior', onclick: () => shiftMonth(-1) }, '‹'),
    h('strong', null, first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })),
    h('button', { class: 'btn small', 'aria-label': 'Próximo mês', onclick: () => shiftMonth(1) }, '›')));

  const grid = h('div', { class: 'cal' });
  WEEKDAYS.forEach(w => grid.append(h('span', { class: 'wd' }, w)));
  for (let i = 0; i < first.getDay(); i++) grid.append(h('span'));
  for (let d = 1; d <= daysIn; d++) {
    const ds = `${y}-${pad(m + 1)}-${pad(d)}`;
    const list = byDate[ds] || [];
    grid.append(h('button', {
      type: 'button',
      class: 'day' + (ds === state.calSel ? ' sel' : '') + (ds === todayStr() ? ' today' : ''),
      'aria-label': `${fmtBR(ds)}${list.length ? ', ' + list.length + ' treino(s)' : ''}`,
      onclick: () => { state.calSel = ds; render(); }
    }, String(d), list.length ? h('span', { class: 'dots' }, list.map(s => h('i', { class: `dot d${dayIdx(s.dayId)}${s.done ? '' : ' open'}` }))) : null));
  }
  v.append(grid);
  v.append(h('p', { class: 'muted', style: 'margin-top:8px' }, `Treinos concluídos neste mês: ${monthDone}. Círculo vazio: treino em andamento.`));

  const ds = state.calSel;
  const panel = h('section', { class: 'card' }, h('h2', null, fmtBR(ds)));
  const list = byDate[ds] || [];
  list.forEach(s => {
    panel.append(h('h3', null, s.dayName + (s.done ? '' : ' (em andamento)')), sessionSummary(s));
    panel.append(h('div', { class: 'row' },
      s.done ? null : h('button', { class: 'btn small', onclick: () => { state.tab = 'hoje'; render(); } }, 'Abrir'),
      h('button', {
        class: 'btn small danger',
        onclick: async () => {
          if (!confirm('Excluir este treino do histórico?')) return;
          if (dirty && dirty.id === s.id) { dirty = null; clearTimeout(saveTimer); }
          state.sessions = state.sessions.filter(x => x.id !== s.id);
          await sessDel(s.id);
          render();
        }
      }, 'Excluir')));
  });
  if (ds > todayStr()) {
    panel.append(h('p', { class: 'muted' }, 'Data futura: ainda não é possível registrar treino.'));
  } else {
    panel.append(h('p', { class: 'muted', style: 'margin-top:10px' }, 'Registrar treino neste dia:'));
    panel.append(h('div', { class: 'row' }, state.plan.days.map(d =>
      h('button', { class: 'btn small', onclick: () => startSession(d.id, ds) }, d.name))));
  }
  v.append(panel);
}

/* ---------- tela: Backup ---------- */

async function exportBackup() {
  const data = { app: 'treino', schema: 1, exportedAt: new Date().toISOString(), plan: state.plan, sessions: state.sessions };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `treino-backup-${todayStr()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  state.lastBackup = Date.now();
  await kvSet('lastBackup', state.lastBackup);
  toast('Backup exportado. Confira o arquivo na pasta Downloads.');
  render();
}

async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (_) { toast('Arquivo inválido.'); return; }
  if (!data || data.app !== 'treino' || !data.plan || !Array.isArray(data.plan.days) || !Array.isArray(data.sessions)) {
    toast('Este arquivo não é um backup do app.');
    return;
  }
  const sessions = data.sessions.filter(s => s && s.id && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Array.isArray(s.entries));
  if (!confirm(`Substituir os dados atuais por ${sessions.length} treino(s) e o plano do backup?`)) return;
  await replaceAll(data.plan, sessions);
  state.plan = data.plan;
  state.sessions = sessions;
  toast('Backup importado.');
  render();
}

function viewBackup(v) {
  const done = state.sessions.filter(s => s.done).length;
  const standalone = matchMedia('(display-mode: standalone)').matches;
  const persist = h('span', null, 'verificando...');
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then(p => { persist.textContent = p ? 'ativo' : 'não ativo'; }).catch(() => { persist.textContent = 'indisponível'; });
  } else persist.textContent = 'indisponível';

  v.append(h('section', { class: 'card' },
    h('h2', null, 'Seus dados'),
    h('p', null, `Treinos concluídos: ${done}.`),
    h('p', null, state.lastBackup ? `Último backup: ${fmtBR(dstr(new Date(state.lastBackup)))}.` : 'Nenhum backup feito ainda.'),
    h('p', { class: 'muted' }, 'Os dados ficam só neste aparelho. Limpar os dados do navegador ou desinstalar o app apaga tudo. Exporte um backup com regularidade.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: exportBackup }, 'Exportar backup'),
      h('label', { class: 'btn', style: 'display:inline-flex;align-items:center;cursor:pointer' }, 'Importar backup',
        h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: ev => { const f = ev.target.files[0]; if (f) importBackup(f); ev.target.value = ''; } })))));

  v.append(h('section', { class: 'card' },
    h('h2', null, 'Armazenamento'),
    h('p', null, 'Armazenamento persistente: ', persist, '.'),
    h('p', { class: 'muted' }, 'Quando ativo, o navegador evita apagar os dados automaticamente por falta de espaço.'),
    h('button', {
      class: 'btn',
      onclick: async () => {
        if (!navigator.storage || !navigator.storage.persist) { toast('Indisponível neste navegador.'); return; }
        const ok = await navigator.storage.persist();
        toast(ok ? 'Armazenamento persistente ativado.' : 'O navegador não concedeu. Instalar o app aumenta a chance.');
        render();
      }
    }, 'Pedir armazenamento persistente')));

  const inst = h('section', { class: 'card' }, h('h2', null, 'Instalação'));
  if (standalone) inst.append(h('p', null, 'O app está instalado e aberto em tela cheia.'));
  else {
    inst.append(h('p', { class: 'muted' }, 'No Chrome do Android: menu de três pontos, depois "Instalar app" ou "Adicionar à tela inicial".'));
    if (state.installEvt) {
      inst.append(h('button', {
        class: 'btn primary',
        onclick: async () => { const e = state.installEvt; state.installEvt = null; e.prompt(); await e.userChoice; render(); }
      }, 'Instalar app'));
    }
  }
  inst.append(h('p', { class: 'muted', style: 'margin-top:10px' }, `Versão ${VERSION}`));
  v.append(inst);
}

/* ---------- render ---------- */

const TITLES = { hoje: 'Hoje', plano: 'Plano', calendario: 'Calendário', backup: 'Backup' };

function render() {
  const v = $('#view');
  v.replaceChildren();
  document.querySelectorAll('#nav button').forEach(b =>
    b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'));
  $('#title').textContent = TITLES[state.tab];
  ({ hoje: viewHoje, plano: viewPlano, calendario: viewCal, backup: viewBackup })[state.tab](v);
}

/* ---------- início ---------- */

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.installEvt = e;
  if (state.tab === 'backup') render();
});

async function init() {
  db = await openDB();
  state.plan = await kvGet('plan');
  if (!state.plan) { state.plan = defaultPlan(); await savePlan(); }
  state.lastBackup = (await kvGet('lastBackup')) || 0;
  state.sessions = await sessAll();
  document.querySelectorAll('#nav button').forEach(b =>
    b.addEventListener('click', () => { state.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init().catch(err => {
  $('#view').textContent = 'Não foi possível abrir o armazenamento do aparelho: ' + (err && err.message ? err.message : err);
});

})();
