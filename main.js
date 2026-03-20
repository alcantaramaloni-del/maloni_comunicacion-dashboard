// ===== ETED Dashboard – main.js =====

// ─── State ────────────────────────────────────────────────
let state = {
  proyectos: [],
  activeProjectId: null,
  config: { umbralDias: 5 },
  view: 'lista',       // 'lista' | 'gantt' | 'proyectos'
  filters: { texto: '', interaccion: '', canal: '', tipo: '', estado: '' },
  sortCol: 'fecha',
  sortDir: 1,
  editingId: null,     // com id being edited, or null for new
  ganttScale: 'month', // 'month' | 'week'
};

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  render();
  bindTopEvents();
});

// ─── Data persistence ──────────────────────────────────────
async function loadData() {
  // Try localStorage first (previously saved), then data.json
  const saved = localStorage.getItem('eted_dashboard');
  if (saved) {
    try {
      const d = JSON.parse(saved);
      state.proyectos = d.proyectos || [];
      state.config    = d.config    || { umbralDias: 5 };
    } catch (e) { await loadFromJson(); }
  } else {
    await loadFromJson();
  }
  if (state.proyectos.length > 0 && !state.activeProjectId) {
    state.activeProjectId = state.proyectos[0].id;
  }
}

async function loadFromJson() {
  try {
    const r = await fetch('data.json');
    const d = await r.json();
    state.proyectos = d.proyectos || [];
    state.config    = d.config    || { umbralDias: 5 };
  } catch (e) {
    state.proyectos = [];
  }
}

function saveToLocalStorage() {
  localStorage.setItem('eted_dashboard', JSON.stringify({
    version: '1.0',
    proyectos: state.proyectos,
    config: state.config
  }));
}

// ─── Active project helper ─────────────────────────────────
function activeProject() {
  return state.proyectos.find(p => p.id === state.activeProjectId) || null;
}

function calcularDiasLaborables(fechaInicio, fechaFinal) {
  if (!fechaInicio || !fechaFinal) return null;
  const inicio = new Date(fechaInicio + 'T12:00:00');
  const fin    = new Date(fechaFinal  + 'T12:00:00');
  if (fin < inicio) return 0;

  let dias = 0;
  let actual = new Date(inicio);
  while (actual < fin) {
    actual.setDate(actual.getDate() + 1);
    const day = actual.getDay();
    if (day !== 0 && day !== 6) dias++; // No contar sábados(6) ni domingos(0)
  }
  return dias;
}

// ─── Cálculo automático de días ───────────────────────────
// Reglas:
//  1. FECHA y FECHA FINAL presentes → días entre ambas fechas
//  2. Solo FECHA y estatus activo ("No iniciado"|"En curso"|"Retrasado") → días entre FECHA y hoy
//  3. Cualquier otro caso → null
function calcularDiasComm(c) {
  const fecha      = c.fecha;
  const fechaFinal = c.fechaFinal;
  const estatus    = c.estatus || 'No iniciado';

  if (!fecha) return null;

  if (fechaFinal) {
    // Regla 1: ambas fechas presentes
    return calcularDiasLaborables(fecha, fechaFinal);
  }

  // Regla 2/3: sin fechaFinal, solo contar si estatus activo
  const estatusActivos = ['No iniciado', 'En curso', 'Retrasado'];
  if (estatusActivos.includes(estatus)) {
    const hoy = new Date().toISOString().slice(0, 10);
    return calcularDiasLaborables(fecha, hoy);
  }

  return null;
}

// Devuelve la clase CSS de color para los días calculados
function diasColorClass(dias) {
  if (dias === null || dias === undefined) return 'dias-na';
  const umbral  = state.config.umbralDias;
  const umbral80 = umbral * 0.8;
  if (dias > umbral)          return 'dias-bad';   // rojo
  if (dias >= umbral80)       return 'dias-warn';  // naranja
  return 'dias-ok';                                // verde
}

function activeComms() {
  const p = activeProject();
  if (!p) return [];

  // Recalcular días automáticamente para cada comunicación
  p.comunicaciones.forEach(c => {
    c.diasLaborables = calcularDiasComm(c);
  });

  return p.comunicaciones;
}

// ─── Entity Names Helper ───────────────────────────────────
function getEntityNames() {
  const p = activeProject();
  return {
    local: p?.entidadLocal || 'ETED',
    contratista: p?.contratista?.nombre || 'KEPCO'
  };
}

function updateEntityLabels() {
  const { local, contratista } = getEntityNames();
  
  const elStatLocal = document.getElementById('label-stat-local');
  if (elStatLocal) elStatLocal.textContent = `${local} envió`;
  const elStatContr = document.getElementById('label-stat-contratista');
  if (elStatContr) elStatContr.textContent = `${contratista} envió`;
  
  const fOptLocal = document.getElementById('f-opt-local');
  if (fOptLocal) fOptLocal.textContent = local;
  const fOptContr = document.getElementById('f-opt-contratista');
  if (fOptContr) fOptContr.textContent = contratista;
  
  const legLocal = document.getElementById('legend-local');
  if (legLocal) legLocal.textContent = `${local} (envia)`;
  const legContr = document.getElementById('legend-contratista');
  if (legContr) legContr.textContent = `${contratista} (envia)`;
  
  const mOptLocal = document.getElementById('m-opt-local');
  if (mOptLocal) mOptLocal.textContent = `${local} (nosotros enviamos)`;
  const mOptContr = document.getElementById('m-opt-contratista');
  if (mOptContr) mOptContr.textContent = `${contratista} (contratista envía)`;
}

// ─── Render dispatcher ─────────────────────────────────────
function render() {
  updateEntityLabels();
  renderTopbar();
  renderStats();
  renderActiveView();
  updateTabHighlight();
}

// ─── Topbar ────────────────────────────────────────────────
function renderTopbar() {
  const sel = document.getElementById('project-selector');
  const p = activeProject();
  sel.textContent = p ? `📁 ${p.nombre}` : '— Sin proyecto activo —';
}

// ─── Stats ────────────────────────────────────────────────
function renderStats() {
  const comms = activeComms();
  const total   = comms.length;
  const digital = comms.filter(c => c.canal === 'digital').length;
  const fisico  = comms.filter(c => c.canal === 'fisico').length;
  const alerta  = comms.filter(c => c.diasLaborables !== null && c.diasLaborables > state.config.umbralDias).length;
  const envETED = comms.filter(c => c.enviado || c.interaccion === 'ETED').length;
  const recKEP  = comms.filter(c => c.recibido || c.interaccion === 'KEPCO').length;

  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-digital').textContent = digital;
  document.getElementById('stat-fisico').textContent  = fisico;
  document.getElementById('stat-alerta').textContent  = alerta;
  document.getElementById('stat-eted').textContent    = envETED;
  document.getElementById('stat-kepco').textContent   = recKEP;
}

// ─── View routing ──────────────────────────────────────────
function renderActiveView() {
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  if (state.view === 'lista')      { document.getElementById('view-lista').classList.add('active'); renderTable(); }
  if (state.view === 'gantt')      { document.getElementById('view-gantt').classList.add('active'); renderGantt(); }
  if (state.view === 'proyectos')  { document.getElementById('view-proyectos').classList.add('active'); renderProjects(); }
}

function updateTabHighlight() {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === state.view);
  });
}

// ─── Filtered comms ────────────────────────────────────────
function filteredComms() {
  let list = [...activeComms()];
  const f = state.filters;

  if (f.texto) {
    const q = f.texto.toLowerCase();
    list = list.filter(c =>
      (c.descripcion||'').toLowerCase().includes(q) ||
      (c.documento||'').toLowerCase().includes(q)   ||
      (c.correlativo||'').toLowerCase().includes(q) ||
      (c.tipoInformacion||'').toLowerCase().includes(q)
    );
  }
  if (f.interaccion) list = list.filter(c => c.interaccion === f.interaccion);
  if (f.canal)       list = list.filter(c => c.canal === f.canal);
  if (f.tipo)        list = list.filter(c => c.tipoInformacion === f.tipo);
  if (f.estado)      list = list.filter(c => c.estado === f.estado);

  // Sort
  list.sort((a, b) => {
    let va = a[state.sortCol] ?? '';
    let vb = b[state.sortCol] ?? '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return -state.sortDir;
    if (va > vb) return  state.sortDir;
    return 0;
  });
  return list;
}

// ─── Table ────────────────────────────────────────────────
function renderTable() {
  const comms = filteredComms();
  const tbody = document.getElementById('comms-tbody');
  if (!comms.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text3);">Sin registros</td></tr>`;
    return;
  }
  tbody.innerHTML = comms.map(c => buildRow(c)).join('');
}

function buildRow(c) {
  const diasClass = diasColorClass(c.diasLaborables);
  const diasTxt = c.diasLaborables === null || c.diasLaborables === undefined ? '—' : c.diasLaborables;

  const canalBadge = c.canal === 'digital'
    ? `<span class="badge badge-digital">✉ Digital</span>`
    : `<span class="badge badge-fisico">📄 Físico</span>`;
  
  const { local, contratista } = getEntityNames();
  const isLocal = c.enviado || c.interaccion === 'ETED';
  const actorBadge = isLocal
    ? `<span class="badge badge-eted">${esc(local)} →</span>`
    : `<span class="badge badge-kepco">← ${esc(contratista)}</span>`;
  
  const docHtml = c.documento
    ? `<span class="doc-name" title="${esc(c.documento)}">${esc(c.documento)}</span>`
    : `<span class="text-sm">—</span>`;

  const estatusColor = {
    'No iniciado': 'var(--text3)',
    'En curso': '#0284c7',
    'Retrasado': '#dc2626',
    'Por sellar': '#9333ea',
    'Completado': '#16a34a',
    'Sellado': '#0d9488',
    'Por despachar': '#ea580c',
    'Despachado': '#2563eb',
    'Enterado': '#0af94aff',
    'Respondido': '#f305f3ff',
  }[c.estatus] || 'var(--text3)';
  const estatusBadge = `<span class="badge" style="border:1px solid ${estatusColor};color:${estatusColor};background:transparent">${esc(c.estatus||'No iniciado')}</span>`;

  return `<tr data-id="${c.id}" class="view-row">
    <td class="text-mono" style="font-size:11px;color:var(--text3)" title="${esc(c.correlativo)}">${esc(c.correlativo)}</td>
    <td style="font-size:12px">${formatDate(c.fecha, c.horaExacta)}</td>
    <td>${actorBadge}</td>
    <td>${canalBadge}</td>
    <td class="cell-desc" title="${esc(c.descripcion)}">${esc(c.descripcion)}</td>
    <td title="${esc(c.tipoInformacion||'')}"><span class="badge" style="background:var(--surface2);color:var(--text2);font-size:10px">${esc(c.tipoInformacion||'—')}</span></td>
    <td title="${esc(c.documento)}">${docHtml}</td>
    <td class="${diasClass}" style="text-align:center">${diasTxt}</td>
    <td style="font-size:12px;color:var(--text3)" title="${esc(c.fechaFinal||'')}">${esc(c.fechaFinal||'—')}</td>
    <td style="font-size:11px;text-align:center">${estatusBadge}</td>
    <td style="font-size:12px;color:var(--text3)" title="${esc(c.nota||'')}">${esc(c.nota||'—')}</td>
    <td style="white-space:nowrap">
      <div class="row-actions">
        <button class="btn btn-sm" onclick="startInlineEdit('${c.id}')" title="Editar fila">✏️ Editar</button>
        <button class="btn btn-sm btn-danger" onclick="deleteComm('${c.id}')" title="Eliminar">🗑</button>
      </div>
    </td>
  </tr>`;
}

// ─── Inline edit ───────────────────────────────────────────
function startInlineEdit(id) {
  // If another row is being edited, cancel it first
  const prev = document.querySelector('tr.edit-row');
  if (prev) cancelInlineEdit(prev.dataset.id);

  const c = activeComms().find(x => x.id === id);
  if (!c) return;

  const tr = document.querySelector(`tr[data-id="${id}"]`);
  if (!tr) return;

  tr.classList.replace('view-row', 'edit-row');
  tr.style.background = 'var(--eted-bg)';

  tr.innerHTML = `
    <!-- # correlativo -->
    <td><input class="ie-input" data-field="correlativo" value="${esc(c.correlativo||'')}" style="width:70px" /></td>
    <!-- fecha + hora -->
    <td style="min-width:170px">
      <input class="ie-input" type="date" data-field="fecha" value="${esc(c.fecha||'')}" style="width:120px;margin-bottom:2px" />
      <input class="ie-input" type="time" data-field="horaExacta" value="${esc(c.horaExacta||'')}" style="width:80px" />
    </td>
    <!-- actor -->
    <td>
      <select class="ie-select" data-field="interaccion">
        <option value="ETED"  ${c.interaccion==='ETED' ?'selected':''}>${esc(getEntityNames().local)} →</option>
        <option value="KEPCO" ${c.interaccion==='KEPCO'?'selected':''}>← ${esc(getEntityNames().contratista)}</option>
      </select>
    </td>
    <!-- canal -->
    <td>
      <select class="ie-select" data-field="canal">
        <option value="digital" ${c.canal==='digital'?'selected':''}>✉ Digital</option>
        <option value="fisico"  ${c.canal==='fisico' ?'selected':''}>📄 Físico</option>
      </select>
    </td>
    <!-- descripcion -->
    <td style="min-width:240px">
      <textarea class="ie-textarea" data-field="descripcion" rows="2">${esc(c.descripcion||'')}</textarea>
    </td>
    <!-- tipo -->
    <td>
      <input class="ie-input" list="tipos-list" data-field="tipoInformacion" value="${esc(c.tipoInformacion||'')}" style="width:130px" />
    </td>
    <!-- documento -->
    <td style="min-width:160px">
      <input class="ie-input" data-field="documento" value="${esc(c.documento||'')}" style="width:150px" />
    </td>
    <!-- dias laborables (calculado, solo lectura) -->
    <td style="min-width:80px;text-align:center">
      <span id="ie-dias-display-${id}" class="${diasColorClass(calcularDiasComm(c))}" style="font-weight:600;font-size:13px">
        ${calcularDiasComm(c) !== null ? calcularDiasComm(c) + 'd' : '—'}
      </span>
      <div style="font-size:9px;color:var(--text3);margin-top:2px">calculado</div>
    </td>
    <!-- fechaFinal -->
    <td>
      <input class="ie-input" type="date" data-field="fechaFinal" value="${esc(c.fechaFinal||'')}" style="width:130px" />
    </td>
    <!-- estatus -->
    <td>
      <select class="ie-select" data-field="estatus" style="width:105px">
        ${['No iniciado','En curso','Retrasado','Por sellar','Completado','Sellado','Por despachar','Despachado','Enterado','Respondido'].map(opt => 
          `<option value="${opt}" ${(c.estatus||'No iniciado')===opt?'selected':''}>${opt}</option>`
        ).join('')}
      </select>
    </td>
    <!-- nota -->
    <td style="min-width:140px">
      <textarea class="ie-textarea" data-field="nota" rows="2">${esc(c.nota||'')}</textarea>
    </td>
    <!-- acciones -->
    <td>
      <div style="display:flex;gap:4px;flex-direction:column">
        <button class="btn btn-sm btn-primary" onclick="saveInlineEdit('${id}')">💾 Guardar</button>
        <button class="btn btn-sm" onclick="cancelInlineEdit('${id}')">✕</button>
      </div>
    </td>`;

  // Auto-recalcular días cuando cambian fecha, fechaFinal o estatus
  function recalcIeDias() {
    const fechaEl      = tr.querySelector('[data-field="fecha"]');
    const fechaFinalEl = tr.querySelector('[data-field="fechaFinal"]');
    const estatusEl    = tr.querySelector('[data-field="estatus"]');
    const displayEl    = document.getElementById(`ie-dias-display-${id}`);
    if (!displayEl) return;

    const tmpComm = {
      fecha:      fechaEl?.value      || '',
      fechaFinal: fechaFinalEl?.value || '',
      estatus:    estatusEl?.value    || 'No iniciado',
    };
    const dias = calcularDiasComm(tmpComm);
    const cls  = diasColorClass(dias);
    displayEl.className = cls;
    displayEl.textContent = dias !== null ? dias + 'd' : '—';

    // Validar: fechaFinal debe ser >= fecha
    if (fechaFinalEl && fechaEl && fechaFinalEl.value && fechaEl.value) {
      if (fechaFinalEl.value < fechaEl.value) {
        fechaFinalEl.style.borderColor = 'var(--danger)';
        fechaFinalEl.title = '⚠ La Fecha Final debe ser igual o posterior a la Fecha';
      } else {
        fechaFinalEl.style.borderColor = '';
        fechaFinalEl.title = '';
      }
    }
  }

  tr.querySelector('[data-field="fecha"]')?.addEventListener('change', recalcIeDias);
  tr.querySelector('[data-field="fechaFinal"]')?.addEventListener('change', recalcIeDias);
  tr.querySelector('[data-field="estatus"]')?.addEventListener('change', recalcIeDias);

  // Focus first input
  tr.querySelector('.ie-input')?.focus();
}


function saveInlineEdit(id) {
  const proj = activeProject();
  if (!proj) return;
  const tr = document.querySelector(`tr.edit-row[data-id="${id}"]`);
  if (!tr) return;

  const get = field => {
    const el = tr.querySelector(`[data-field="${field}"]`);
    return el ? el.value : '';
  };

  // Validar: fechaFinal debe ser >= fecha
  const fechaVal      = get('fecha');
  const fechaFinalVal = get('fechaFinal');
  if (fechaVal && fechaFinalVal && fechaFinalVal < fechaVal) {
    toast('⚠ La Fecha Final debe ser igual o posterior a la Fecha de inicio', 'error');
    const fFinalEl = tr.querySelector('[data-field="fechaFinal"]');
    if (fFinalEl) { fFinalEl.style.borderColor = 'var(--danger)'; fFinalEl.focus(); }
    return;
  }

  const idx = proj.comunicaciones.findIndex(x => x.id === id);
  if (idx < 0) return;

  const orig = proj.comunicaciones[idx];

  // Calcular días automáticamente basado en los valores actuales del formulario
  const tmpComm = {
    fecha:      fechaVal,
    fechaFinal: fechaFinalVal,
    estatus:    get('estatus') || 'No iniciado',
  };
  const diasCalculados = calcularDiasComm(tmpComm);

  proj.comunicaciones[idx] = {
    ...orig,
    correlativo:     get('correlativo').trim(),
    fecha:           fechaVal,
    horaExacta:      get('horaExacta').trim(),
    interaccion:     get('interaccion'),
    enviado:         get('interaccion') === 'ETED',
    recibido:        get('interaccion') === 'KEPCO',
    canal:           get('canal'),
    tipoInformacion: get('tipoInformacion').trim(),
    descripcion:     get('descripcion').trim(),
    documento:       get('documento').trim(),
    diasLaborables:  diasCalculados,
    fechaFinal:      fechaFinalVal,
    estatus:         get('estatus'),
    nota:            get('nota').trim(),
  };

  saveToLocalStorage();
  // Replace only this row (no full re-render → no scroll jump)
  tr.classList.replace('edit-row', 'view-row');
  tr.style.background = '';
  tr.outerHTML = buildRow(proj.comunicaciones[idx]);
  renderStats();
  toast('Guardado', 'success');
}

function cancelInlineEdit(id) {
  const proj = activeProject();
  const orig = proj?.comunicaciones.find(x => x.id === id);
  const tr = document.querySelector(`tr[data-id="${id}"]`);
  if (!tr || !orig) return;
  tr.outerHTML = buildRow(orig);
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(fecha, hora) {
  if (!fecha) return '—';
  const d = new Date(fecha + 'T12:00:00');
  const opts = { day: '2-digit', month: 'short', year: 'numeric' };
  let s = d.toLocaleDateString('es-DO', opts);
  if (hora) s += ` <span style="color:var(--text3);font-size:11px">${hora}</span>`;
  return s;
}

// ─── Sort handler ──────────────────────────────────────────
function sortBy(col) {
  if (state.sortCol === col) state.sortDir *= -1;
  else { state.sortCol = col; state.sortDir = 1; }
  renderTable();
}

// ─── Filters ──────────────────────────────────────────────
function bindFilterEvents() {
  document.getElementById('f-texto').addEventListener('input', e => {
    state.filters.texto = e.target.value;
    renderTable();
    renderStats();
  });
  ['f-interaccion','f-canal','f-tipo','f-estado'].forEach(id => {
    document.getElementById(id).addEventListener('change', e => {
      const key = id.replace('f-', '');
      state.filters[key] = e.target.value;
      renderTable();
      renderStats();
    });
  });
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    state.filters = { texto:'', interaccion:'', canal:'', tipo:'', estado:'' };
    document.getElementById('f-texto').value = '';
    ['f-interaccion','f-canal','f-tipo','f-estado'].forEach(id => {
      document.getElementById(id).value = '';
    });
    renderTable();
    renderStats();
  });
  
  const btnExportTxt = document.getElementById('btn-export-txt');
  if (btnExportTxt) {
    btnExportTxt.addEventListener('click', exportTXT);
  }
}

// ─── Export to TXT ─────────────────────────────────────────
function exportTXT() {
  const comms = filteredComms();
  if (!comms.length) {
    toast('No hay datos para exportar', 'warn');
    return;
  }

  // Encabezados
  const headers = ['Correlativo', 'Fecha', 'Hora', 'Actor', 'Canal', 'Descripción', 'Tipo', 'Documento', 'Días', 'Proyectista', 'Estatus', 'Nota'];
  
  // Filas
  const rows = comms.map(c => {
    return [
      c.correlativo || '',
      c.fecha || '',
      c.horaExacta || '',
      c.interaccion || '',
      c.canal || '',
      (c.descripcion || '').replace(/\r?\n/g, ' '),
      c.tipoInformacion || '',
      c.documento || '',
      c.diasLaborables !== null ? String(c.diasLaborables) : '',
      c.fechaFinal || '',
      c.estatus || 'No iniciado',
      (c.nota || '').replace(/\r?\n/g, ' ')
    ];
  });

  // Convertir a texto separado por tabulaciones (mejor para TXT y compatible con Excel)
  let content = headers.join('\t') + '\n';
  rows.forEach(r => {
    content += r.join('\t') + '\n';
  });

  const p = activeProject();
  const nombreProyecto = p && p.nombre ? `-${p.nombre.trim().replace(/\s+/g, '-')}` : '';
  const filename = `lista-comunicaciones${nombreProyecto}-${new Date().toISOString().slice(0,10)}.txt`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  
  toast('Lista exportada a TXT', 'success');
}

// ─── CRUD Modal ────────────────────────────────────────────
function openNewModal() {
  state.editingId = null;
  showModal({});
}

function openEditModal(id) {
  const c = activeComms().find(x => x.id === id);
  if (!c) return;
  state.editingId = id;
  showModal(c);
}

function showModal(c) {
  const modal = document.getElementById('comm-modal');
  modal.classList.remove('hidden');

  const isNew = !state.editingId;
  document.getElementById('modal-title').textContent = isNew ? 'Nueva comunicación' : 'Editar comunicación';

  document.getElementById('m-correlativo').value     = c.correlativo     || '';
  document.getElementById('m-fecha').value           = c.fecha           || '';
  document.getElementById('m-hora').value            = c.horaExacta      || '';
  document.getElementById('m-interaccion').value     = c.interaccion     || 'KEPCO';
  document.getElementById('m-canal').value           = c.canal           || 'digital';
  document.getElementById('m-tipo').value            = c.tipoInformacion || '';
  document.getElementById('m-descripcion').value     = c.descripcion     || '';
  document.getElementById('m-documento').value       = c.documento       || '';
  document.getElementById('m-fechafinal').value      = c.fechaFinal      || '';
  document.getElementById('m-estatus').value         = c.estatus         || 'No iniciado';
  document.getElementById('m-nota').value            = c.nota            || '';
  document.getElementById('m-estado').value          = c.estado          || 'recibido';

  // Calcular y mostrar días (campo calculado, solo lectura)
  updateModalDias();

  // Limpiar listeners anteriores clonando los elementos
  ['m-fecha','m-fechafinal','m-estatus'].forEach(elId => {
    const el = document.getElementById(elId);
    if (el) {
      const clone = el.cloneNode(true);
      el.parentNode.replaceChild(clone, el);
      clone.addEventListener('change', () => {
        updateModalDias();
        validateModalFechaFinal();
      });
    }
  });
}

function closeModal() {
  document.getElementById('comm-modal').classList.add('hidden');
  state.editingId = null;
}

function saveModal() {
  const proj = activeProject();
  if (!proj) return;

  const fechaVal      = document.getElementById('m-fecha').value;
  const fechaFinalVal = document.getElementById('m-fechafinal').value;

  // Validar: fechaFinal debe ser >= fecha
  if (fechaVal && fechaFinalVal && fechaFinalVal < fechaVal) {
    toast('⚠ La Fecha Final debe ser igual o posterior a la Fecha de inicio', 'error');
    const el = document.getElementById('m-fechafinal');
    if (el) { el.style.borderColor = 'var(--danger)'; el.focus(); }
    return;
  }

  const estatusVal = document.getElementById('m-estatus').value;

  // Calcular días automáticamente
  const diasCalculados = calcularDiasComm({
    fecha:      fechaVal,
    fechaFinal: fechaFinalVal,
    estatus:    estatusVal,
  });

  const c = {
    id:              state.editingId || 'com-' + Date.now(),
    correlativo:     document.getElementById('m-correlativo').value.trim(),
    fecha:           fechaVal,
    horaExacta:      document.getElementById('m-hora').value.trim(),
    interaccion:     document.getElementById('m-interaccion').value,
    enviado:         document.getElementById('m-interaccion').value === 'ETED',
    recibido:        document.getElementById('m-interaccion').value === 'KEPCO',
    canal:           document.getElementById('m-canal').value,
    tipoInformacion: document.getElementById('m-tipo').value.trim(),
    descripcion:     document.getElementById('m-descripcion').value.trim(),
    documento:       document.getElementById('m-documento').value.trim(),
    fechaFinal:      fechaFinalVal,
    diasLaborables:  diasCalculados,
    estatus:         estatusVal,
    nota:            document.getElementById('m-nota').value.trim(),
    estado:          document.getElementById('m-estado').value,
  };

  if (state.editingId) {
    const idx = proj.comunicaciones.findIndex(x => x.id === state.editingId);
    if (idx >= 0) proj.comunicaciones[idx] = c;
  } else {
    proj.comunicaciones.push(c);
  }

  saveToLocalStorage();
  closeModal();
  render();
  toast('Comunicación guardada', 'success');
}

function deleteComm(id) {
  if (!confirm('¿Eliminar esta comunicación?')) return;
  const proj = activeProject();
  if (!proj) return;
  proj.comunicaciones = proj.comunicaciones.filter(c => c.id !== id);
  saveToLocalStorage();
  render();
  toast('Comunicación eliminada');
}

// ─── Modal días helpers ────────────────────────────────────
function updateModalDias() {
  const fechaEl      = document.getElementById('m-fecha');
  const fechaFinalEl = document.getElementById('m-fechafinal');
  const estatusEl    = document.getElementById('m-estatus');
  const displayEl    = document.getElementById('dias-preview');
  if (!displayEl) return;

  const tmpComm = {
    fecha:      fechaEl?.value      || '',
    fechaFinal: fechaFinalEl?.value || '',
    estatus:    estatusEl?.value    || 'No iniciado',
  };
  const dias = calcularDiasComm(tmpComm);
  const umbral = state.config.umbralDias;

  if (dias === null) {
    displayEl.textContent = 'Sin fechas para calcular';
    displayEl.style.background = '';
    displayEl.style.color = 'var(--text3)';
    return;
  }

  const umbral80 = umbral * 0.8;
  if (dias > umbral) {
    displayEl.textContent = `⚠ ${dias} días – supera umbral (${umbral})`;
    displayEl.style.background = 'var(--danger-bg)';
    displayEl.style.color = 'var(--danger)';
  } else if (dias >= umbral80) {
    displayEl.textContent = `⚡ ${dias} días – cerca del umbral (${umbral})`;
    displayEl.style.background = 'var(--warn-bg)';
    displayEl.style.color = 'var(--warn)';
  } else {
    displayEl.textContent = `✓ ${dias} días – dentro del umbral (${umbral})`;
    displayEl.style.background = 'var(--ok-bg)';
    displayEl.style.color = 'var(--ok)';
  }
}

function validateModalFechaFinal() {
  const fechaEl      = document.getElementById('m-fecha');
  const fechaFinalEl = document.getElementById('m-fechafinal');
  if (!fechaEl || !fechaFinalEl) return;
  if (fechaFinalEl.value && fechaEl.value && fechaFinalEl.value < fechaEl.value) {
    fechaFinalEl.style.borderColor = 'var(--danger)';
    fechaFinalEl.title = '⚠ La Fecha Final debe ser igual o posterior a la Fecha';
  } else {
    fechaFinalEl.style.borderColor = '';
    fechaFinalEl.title = '';
  }
}

// ─── Projects ──────────────────────────────────────────────
function renderProjects() {
  const list = document.getElementById('projects-list');
  if (!state.proyectos.length) {
    list.innerHTML = `<div class="empty-state"><p>No hay proyectos. Crea uno nuevo.</p></div>`;
    return;
  }
  list.innerHTML = state.proyectos.map(p => `
    <div class="project-card ${p.id === state.activeProjectId ? 'active' : ''}" onclick="switchProject('${p.id}')">
      <div class="project-dot"></div>
      <div class="project-info">
        <div class="name">${esc(p.nombre)}</div>
        <div class="meta">${esc(p.entidadLocal||'ETED')} ↔ ${esc(p.contratista?.nombre||'KEPCO')} &nbsp;·&nbsp; ${p.comunicaciones.length} comunicaciones &nbsp;·&nbsp; Inicio: ${p.fechaInicio||'—'}</div>
      </div>
      <div class="project-actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm" onclick="openEditProject('${p.id}')">✏️ Editar</button>
        <button class="btn btn-sm btn-danger" onclick="deleteProject('${p.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

function switchProject(id) {
  state.activeProjectId = id;
  state.view = 'lista';
  state.filters = { texto:'', interaccion:'', canal:'', tipo:'', estado:'' };
  render();
}

function openNewProject() {
  showProjectModal({});
}

function openEditProject(id) {
  const p = state.proyectos.find(x => x.id === id);
  if (p) showProjectModal(p);
}

function showProjectModal(p) {
  const modal = document.getElementById('project-modal');
  modal.classList.remove('hidden');
  document.getElementById('pm-id').value           = p.id || '';
  document.getElementById('pm-nombre').value       = p.nombre || '';
  document.getElementById('pm-desc').value         = p.descripcion || '';
  document.getElementById('pm-inicio').value       = p.fechaInicio || '';
  document.getElementById('pm-entidad-local').value = p.entidadLocal || 'ETED';
  document.getElementById('pm-contratista').value  = p.contratista?.nombre || '';
  document.getElementById('pm-rnc').value          = p.contratista?.rnc || '';
  document.getElementById('pm-correo').value       = p.contratista?.correo || '';
  document.getElementById('pm-tel').value          = p.contratista?.telefono || '';
  document.getElementById('pm-umbral').value       = state.config.umbralDias;
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.add('hidden');
}

function saveProjectModal() {
  const id     = document.getElementById('pm-id').value || ('proj-' + Date.now());
  const nombre = document.getElementById('pm-nombre').value.trim();
  if (!nombre) { alert('El nombre del proyecto es requerido.'); return; }

  state.config.umbralDias = Number(document.getElementById('pm-umbral').value) || 5;

  const existing = state.proyectos.find(p => p.id === id);
  if (existing) {
    existing.nombre       = nombre;
    existing.descripcion  = document.getElementById('pm-desc').value.trim();
    existing.fechaInicio  = document.getElementById('pm-inicio').value;
    existing.entidadLocal = document.getElementById('pm-entidad-local').value.trim() || 'ETED';
    existing.contratista  = {
      nombre:   document.getElementById('pm-contratista').value.trim(),
      rnc:      document.getElementById('pm-rnc').value.trim(),
      correo:   document.getElementById('pm-correo').value.trim(),
      telefono: document.getElementById('pm-tel').value.trim(),
    };
  } else {
    state.proyectos.push({
      id,
      nombre,
      descripcion:  document.getElementById('pm-desc').value.trim(),
      fechaInicio:  document.getElementById('pm-inicio').value,
      estado:       'activo',
      entidadLocal: document.getElementById('pm-entidad-local').value.trim() || 'ETED',
      contratista: {
        nombre:   document.getElementById('pm-contratista').value.trim(),
        rnc:      document.getElementById('pm-rnc').value.trim(),
        correo:   document.getElementById('pm-correo').value.trim(),
        telefono: document.getElementById('pm-tel').value.trim(),
      },
      comunicaciones: [],
    });
    state.activeProjectId = id;
  }

  saveToLocalStorage();
  closeProjectModal();
  render();
  toast('Proyecto guardado', 'success');
}

function deleteProject(id) {
  if (!confirm('¿Eliminar este proyecto y todas sus comunicaciones?')) return;
  state.proyectos = state.proyectos.filter(p => p.id !== id);
  if (state.activeProjectId === id) {
    state.activeProjectId = state.proyectos[0]?.id || null;
  }
  saveToLocalStorage();
  render();
  toast('Proyecto eliminado');
}

// ─── Import / Export ───────────────────────────────────────
async function exportJSON() {
  if (!state.proyectos || state.proyectos.length === 0) {
    toast('No hay proyectos para exportar', 'warn');
    return;
  }

  try {
    // Intentamos usar el selector de carpetas (Solo soportado en Chrome/Edge/Opera/Chromium)
    if (window.showDirectoryPicker) {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      for (const p of state.proyectos) {
        const nombreProyecto = p.nombre ? `-${p.nombre.trim().replace(/\s+/g, '-')}` : '';
        const filename = `eted-dashboard${nombreProyecto}-${new Date().toISOString().slice(0,10)}.json`;
        const data = { version:'1.0', config: state.config, proyectos: [p] };
        
        const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
      }
      toast(`Exportados ${state.proyectos.length} archivo(s) JSON a la carpeta seleccionada`, 'success');
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // El usuario canceló la selección de la carpeta
    console.error('Error al guardar en la carpeta:', err);
    toast('Error guardando en la carpeta, usando método tradicional', 'warn');
  }

  // Fallback si el navegador no permite elegir carpeta (ej. Firefox o Safari)
  state.proyectos.forEach(p => {
    const nombreProyecto = p.nombre ? `-${p.nombre.trim().replace(/\s+/g, '-')}` : '';
    const data = { version:'1.0', config: state.config, proyectos: [p] };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
    const a    = document.createElement('a');

    a.href     = URL.createObjectURL(blob);
    a.download = `eted-dashboard${nombreProyecto}-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  });
  
  toast(`Exportados ${state.proyectos.length} archivo(s) JSON`, 'success');
}

function importJSON() {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        if (!d.proyectos) throw new Error('Formato inválido');
        if (!confirm(`¿Importar ${d.proyectos.length} proyecto(s)? Los proyectos se añadirán a los existentes (o se actualizarán si ya existen).`)) return;
        
        let agregados = 0;
        let actualizados = 0;

        d.proyectos.forEach(importedProj => {
          const idx = state.proyectos.findIndex(p => p.id === importedProj.id);
          if (idx >= 0) {
            state.proyectos[idx] = importedProj;
            actualizados++;
          } else {
            state.proyectos.push(importedProj);
            agregados++;
          }
        });

        if (d.config) state.config = { ...state.config, ...d.config };
        
        if (!state.activeProjectId && state.proyectos.length > 0) {
          state.activeProjectId = state.proyectos[0].id;
        }

        saveToLocalStorage();
        render();
        toast(`Importados: ${agregados} nuevos, ${actualizados} actualizados.`, 'success');
      } catch (err) {
        toast('Error al importar: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── Gantt / Timeline ──────────────────────────────────────

// Gantt column definitions — each has a key, label, and value extractor
const GANTT_COLS = [
  { key: 'correlativo',     label: '#',            w: '60px',  extract: c => c.correlativo || '' },
  { key: 'fecha',           label: 'Fecha',        w: '120px', extract: c => c.fecha || '' },
  { key: 'horaExacta',      label: 'Hora',         w: '65px',  extract: c => c.horaExacta || '' },
  { key: 'interaccion',     label: 'Actor',        w: '90px',  extract: c => c.interaccion || '' },
  { key: 'canal',           label: 'Canal',        w: '90px',  extract: c => c.canal || '' },
  { key: 'tipoInformacion', label: 'Tipo',         w: '100px', extract: c => c.tipoInformacion || '' },
  { key: 'descripcion',     label: 'Descripción',  w: '22%',   extract: c => c.descripcion || '' },
  { key: 'documento',       label: 'Documento',    w: '16%',   extract: c => c.documento || '' },
  { key: 'diasLaborables',  label: 'Días',         w: '65px',  extract: c => c.diasLaborables !== null && c.diasLaborables !== undefined ? String(c.diasLaborables) : '' },
  { key: 'fechaFinal',      label: 'Fecha Final',  w: '110px', extract: c => c.fechaFinal || '' },
  { key: 'estatus',         label: 'Estatus',      w: '95px',  extract: c => c.estatus || 'No iniciado' },
  { key: 'nota',            label: 'Nota',         w: '14%',   extract: c => c.nota || '' },
];

// Which cols are hidden (user-toggled); initially none
if (!state.ganttHiddenCols) state.ganttHiddenCols = new Set();
// Whether to auto-hide empty cols
if (state.ganttAutoHide === undefined) state.ganttAutoHide = false;

function renderGantt() {
  const comms = filteredComms().filter(c => c.fecha);
  const wrap  = document.getElementById('gantt-svg-wrap');

  if (!comms.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:60px"><p>Sin datos para mostrar en el timeline.</p></div>`;
    renderGanttColPanel(comms);
    return;
  }

  // Determine which cols have at least one non-empty value
  const hasData = {};
  GANTT_COLS.forEach(col => {
    hasData[col.key] = comms.some(c => col.extract(c).trim() !== '');
  });

  // Active columns = not manually hidden, and (if autoHide) has data
  const activeCols = GANTT_COLS.filter(col => {
    if (state.ganttHiddenCols.has(col.key)) return false;
    if (state.ganttAutoHide && !hasData[col.key]) return false;
    return true;
  });

  // ── SVG timeline strip (top) ───────────────────────────────
  const dates   = comms.map(c => new Date(c.fecha + 'T12:00:00')).sort((a,b)=>a-b);
  const minDate = new Date(dates[0]); minDate.setDate(1);
  const maxDate = new Date(dates[dates.length-1]);
  maxDate.setMonth(maxDate.getMonth()+1); maxDate.setDate(1);
  const totalMs = maxDate - minDate;

  const HEADER_H = 36;
  const ROW_H    = 34;
  const svgH     = HEADER_H + comms.length * ROW_H + 4;

  function xPct(dateStr) {
    return ((new Date(dateStr+'T12:00:00') - minDate) / totalMs * 100).toFixed(3) + '%';
  }

  // Month bands
  let months = [];
  let cur = new Date(minDate);
  while (cur < maxDate) {
    const next = new Date(cur); next.setMonth(next.getMonth()+1);
    const label = cur.toLocaleDateString('es-DO',{month:'short', year:'2-digit'}).toUpperCase();
    months.push({ label, xPct: xPct(cur.toISOString().slice(0,10)), x2Pct: xPct(next.toISOString().slice(0,10)), idx: months.length });
    cur = next;
  }

  const colorMap = { ETED:'#1d4ed8', KEPCO:'#0f766e' };
  const canalIcon = { digital:'✉', fisico:'📄' };

  const monthBands = months.map(m => `
    <rect x="${m.xPct}" y="0" width="${m.x2Pct}" height="${HEADER_H}"
      fill="${m.idx%2===0?'#f0f2f5':'#e8ebf0'}" style="width:calc(${m.x2Pct} - ${m.xPct})"/>
    <text x="calc(${m.xPct} + (${m.x2Pct} - ${m.xPct})/2)" y="${HEADER_H/2}"
      text-anchor="middle" dominant-baseline="central"
      style="font-family:'DM Sans',sans-serif;font-size:10px;fill:#5a6072;font-weight:600">${m.label}</text>
    <line x1="${m.xPct}" y1="0" x2="${m.xPct}" y2="${svgH}" stroke="#c8cdd6" stroke-width=".5"/>`
  ).join('');

  // Today
  const todayPct = xPct(new Date().toISOString().slice(0,10));
  const todayLine = `<line x1="${todayPct}" y1="${HEADER_H}" x2="${todayPct}" y2="${svgH}"
    stroke="#1d4ed8" stroke-width="1.5" stroke-dasharray="4 3" opacity=".8"/>
    <text x="${todayPct}" y="${HEADER_H+12}"
      style="font-family:'DM Sans',sans-serif;font-size:9px;fill:#1d4ed8;font-weight:700">HOY</text>`;

  // Row bars
  const rowBars = comms.map((c,i) => {
    const y   = HEADER_H + i * ROW_H;
    const col = colorMap[c.interaccion] || '#888';
    const px  = xPct(c.fecha);
    const icon = canalIcon[c.canal] || '·';
    return `
      <rect x="0" y="${y}" width="100%" height="${ROW_H}" fill="${i%2===0?'#f7f8fa':'#fff'}" opacity=".7"/>
      <rect x="${px}" y="${y+9}" width="12" height="16" rx="2" fill="${col}" opacity=".9"/>
      <text x="${px}" y="${y + ROW_H/2 + 1}" dominant-baseline="central"
        style="font-family:'DM Sans',sans-serif;font-size:9px;fill:#5a6072" dx="16">
        ${icon} ${c.fecha.slice(5)}
      </text>
      ${c.diasLaborables !== null && c.diasLaborables !== undefined ? `
        <rect x="${px}" y="${y+8}" width="28" height="14" rx="7" fill="${c.diasLaborables > state.config.umbralDias?'#fef2f2':'#f0fdf4'}" dx="70"/>` : ''}
      <line x1="0" y1="${y+ROW_H}" x2="100%" y2="${y+ROW_H}" stroke="#e2e5ea" stroke-width=".5"/>`;
  }).join('');

  // ── HTML table (below SVG) ─────────────────────────────────
  const colgroup = activeCols.map(col =>
    `<col style="width:${col.w}" />`
  ).join('');

  const thead = activeCols.map(col =>
    `<th class="gt-th" data-col="${col.key}" title="Click para ocultar columna" onclick="toggleGanttCol('${col.key}')">${col.label} <span style="opacity:.4;font-size:10px">✕</span></th>`
  ).join('');

  const tbody = comms.map((c, i) => {
    const cells = activeCols.map(col => {
      const val = col.extract(c);
      return `<td class="gt-td">${renderGanttCell(col.key, val, c)}</td>`;
    }).join('');
    return `<tr class="${i%2===0?'gt-zebra':''}" onclick="startInlineEdit('${c.id}')" style="cursor:pointer" title="Clic para editar">${cells}</tr>`;
  }).join('');

  wrap.innerHTML = `
    <!-- SVG timeline strip -->
    <div style="overflow-x:auto;border-bottom:2px solid var(--border)">
      <svg width="100%" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="min-width:600px;display:block">
        ${monthBands}
        ${rowBars}
        ${todayLine}
      </svg>
    </div>
    <!-- Data table -->
    <div style="overflow-x:auto">
      <table class="gt-table">
        <colgroup>${colgroup}</colgroup>
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;

  renderGanttColPanel(comms, hasData);
}

function renderGanttCell(key, val, c) {
  if (!val && val !== 0) return '<span style="color:var(--text3);font-size:11px">—</span>';
  switch(key) {
    case 'interaccion':
      const { local, contratista } = getEntityNames();
      const isLocal = c.enviado || c.interaccion === 'ETED';
      return isLocal
        ? `<span class="badge badge-eted">${esc(local)} →</span>`
        : `<span class="badge badge-kepco">← ${esc(contratista)}</span>`;
    case 'canal':
      return c.canal === 'digital'
        ? `<span class="badge badge-digital">✉ Digital</span>`
        : `<span class="badge badge-fisico">📄 Físico</span>`;
    case 'diasLaborables': {
      const n = Number(val);
      const cls = diasColorClass(n);
      return `<span class="${cls}">${n}d</span>`;
    }
    case 'fecha':
      return `<span style="font-size:12px;white-space:nowrap">${formatDate(val,'')}</span>`;
    case 'tipoInformacion':
      return `<span class="badge" style="background:var(--surface2);color:var(--text2);font-size:10px">${esc(val)}</span>`;
    case 'documento':
      return `<span class="doc-name" title="${esc(val)}" style="font-size:11px">${esc(val)}</span>`;
    default:
      return `<span style="font-size:12px">${esc(val)}</span>`;
  }
}

function renderGanttColPanel(comms, hasData = {}) {
  const panel = document.getElementById('gantt-col-panel');
  if (!panel) return;

  const toggles = GANTT_COLS.map(col => {
    const isEmpty  = !hasData[col.key];
    const isHidden = state.ganttHiddenCols.has(col.key);
    const autoHid  = state.ganttAutoHide && isEmpty;
    return `
      <label class="col-toggle ${isEmpty ? 'col-empty' : ''} ${isHidden || autoHid ? 'col-off' : ''}"
        title="${isEmpty ? 'Sin datos' : ''}"
        style="opacity:${autoHid ? '.45' : '1'}">
        <input type="checkbox" ${isHidden ? '' : 'checked'}
          ${autoHid ? 'disabled' : ''}
          onchange="toggleGanttCol('${col.key}', this.checked)" />
        ${col.label}${isEmpty ? ' <em style="font-size:10px;color:var(--text3)">(vacía)</em>' : ''}
      </label>`;
  }).join('');

  panel.innerHTML = `
    <div class="col-panel-inner">
      <span class="col-panel-title">Columnas visibles</span>
      <label class="col-toggle-auto">
        <input type="checkbox" id="gantt-auto-hide" ${state.ganttAutoHide?'checked':''}
          onchange="setGanttAutoHide(this.checked)" />
        Ocultar vacías automáticamente
      </label>
      <div class="col-toggles">${toggles}</div>
    </div>`;
}

function toggleGanttCol(key, checked) {
  if (checked === undefined) {
    // Called from th click → toggle
    if (state.ganttHiddenCols.has(key)) state.ganttHiddenCols.delete(key);
    else state.ganttHiddenCols.add(key);
  } else {
    if (checked) state.ganttHiddenCols.delete(key);
    else state.ganttHiddenCols.add(key);
  }
  renderGantt();
}

function setGanttAutoHide(val) {
  state.ganttAutoHide = val;
  renderGantt();
}

function escSvg(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Top-level event bindings ──────────────────────────────
function bindTopEvents() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      renderActiveView();
      updateTabHighlight();
    });
  });

  // Project selector click → proyectos view
  document.getElementById('project-selector').addEventListener('click', () => {
    state.view = 'proyectos';
    renderActiveView();
    updateTabHighlight();
  });

  // New comm button
  document.getElementById('btn-new-comm').addEventListener('click', openNewModal);

  // Import/Export
  document.getElementById('btn-export').addEventListener('click', exportJSON);
  document.getElementById('btn-import').addEventListener('click', importJSON);

  // New project button
  document.getElementById('btn-new-project').addEventListener('click', openNewProject);

  // Modal comm
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveModal);

  // Modal project
  document.getElementById('pm-close').addEventListener('click', closeProjectModal);
  document.getElementById('pm-cancel').addEventListener('click', closeProjectModal);
  document.getElementById('pm-save').addEventListener('click', saveProjectModal);

  // Backdrop click close
  document.getElementById('comm-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('project-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeProjectModal();
  });

  // Gantt scale
  document.getElementById('gantt-scale-sel').addEventListener('change', e => {
    state.ganttScale = e.target.value;
    renderGantt();
  });

  // Table sort
  document.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => sortBy(th.dataset.sort));
  });

  // Filters
  bindFilterEvents();

  // Reset data button
  document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm('¿Resetear datos al archivo data.json original?')) return;
    localStorage.removeItem('eted_dashboard');
    await loadFromJson();
    state.activeProjectId = state.proyectos[0]?.id || null;
    render();
    toast('Datos restaurados desde data.json', 'success');
  });
}

// ─── Toast ────────────────────────────────────────────────
function toast(msg, type='') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' '+type : ''}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
