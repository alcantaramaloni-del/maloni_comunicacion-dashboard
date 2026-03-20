// ===== ETED Dashboard – auth.js =====
// Autenticación client-side segura para GitHub Pages
//
// Seguridad implementada:
//  • Contraseñas hasheadas con SHA-256 via Web Crypto API (nativa del browser)
//  • Sesiones en sessionStorage — se eliminan al cerrar el navegador/tab
//  • Roles: admin | editor | viewer (permisos aplicados por CSS + JS)
//  • Clave maestra de administrador para gestión de emergencia
//  • main.js se carga DINÁMICAMENTE solo tras autenticación exitosa
//
// Credenciales por defecto (cambiar en Panel Admin):
//  admin    / Admin1234!    → rol admin
//  maloni   / Admin1234!    → rol editor
//  viewer   / Viewer2026!   → rol viewer
//  Clave maestra: ETED@AdminKey2026!

'use strict';

const AUTH = (() => {

  // ─── Constantes ───────────────────────────────────────────
  const SESSION_KEY    = 'eted_session';
  const USERS_KEY      = 'eted_users';
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

  // ─── Crypto – SHA-256 vía Web Crypto API ──────────────────
  async function sha256(text) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ─── Almacenamiento de usuarios ───────────────────────────
  async function loadUsers() {
    // 1. Revisar localStorage primero (cambios en runtime)
    const saved = localStorage.getItem(USERS_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (_) {}
    }
    // 2. Fallback: users.json (archivo semilla del repositorio)
    try {
      const r = await fetch('users.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      localStorage.setItem(USERS_KEY, JSON.stringify(d));
      return d;
    } catch (e) {
      console.warn('[AUTH] No se pudo cargar users.json:', e.message);
      return { version: '1.0', adminKeyHash: '', users: [] };
    }
  }

  function saveUsers(data) {
    localStorage.setItem(USERS_KEY, JSON.stringify(data));
  }

  // ─── Sesión ───────────────────────────────────────────────
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (Date.now() - s.loginTime > SESSION_TTL_MS) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch (_) { return null; }
  }

  function setSession(user) {
    const s = {
      userId:    user.id,
      username:  user.username,
      nombre:    user.nombre,
      rol:       user.rol,
      loginTime: Date.now()
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    return s;
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ─── Autenticación ────────────────────────────────────────
  async function login(username, password, usersData) {
    const hash = await sha256(password);
    const user = usersData.users.find(u =>
      u.username.toLowerCase() === username.toLowerCase().trim() &&
      u.passwordHash === hash &&
      u.activo !== false
    );
    if (!user) return null;
    return setSession(user);
  }

  async function checkAdminKey(key, usersData) {
    const hash = await sha256(key);
    return hash === usersData.adminKeyHash;
  }

  // ─── Permisos por rol (CSS en <body>) ─────────────────────
  function applyRolePermissions(rol) {
    document.body.className = document.body.className
      .replace(/\brol-\w+\b/g, '').trim();
    document.body.classList.add('rol-' + rol);
  }

  // ─── Carga dinámica de main.js ────────────────────────────
  function loadMainApp() {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'main.js';
      s.onload  = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar main.js'));
      document.body.appendChild(s);
    });
  }

  // ─── UI: botones en topbar ────────────────────────────────
  function injectTopbarUI(session) {
    const actions = document.querySelector('.topbar-actions');
    if (!actions) return;

    const roleInfo = {
      admin:  { label: 'Admin',  icon: '👑', cls: 'auth-role-admin'  },
      editor: { label: 'Editor', icon: '✏️', cls: 'auth-role-editor' },
      viewer: { label: 'Viewer', icon: '👁',  cls: 'auth-role-viewer' }
    };
    const ri = roleInfo[session.rol] || { label: session.rol, icon: '?', cls: '' };
    const initials = session.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    const wrap = document.createElement('div');
    wrap.id = 'auth-topbar-wrap';
    wrap.innerHTML = `
      <div class="auth-user-widget" id="auth-user-widget">
        <div class="auth-avatar">${initials}</div>
        <div class="auth-user-meta">
          <span class="auth-user-name">${session.nombre}</span>
          <span class="auth-role-badge ${ri.cls}">${ri.icon} ${ri.label}</span>
        </div>
        <svg class="auth-caret" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="auth-dropdown hidden" id="auth-dropdown">
        <div class="auth-dropdown-header">
          <strong>${session.nombre}</strong>
          <small>@${session.username}</small>
        </div>
        <div class="auth-dropdown-divider"></div>
        ${session.rol === 'admin'
          ? '<button class="auth-dropdown-item" id="auth-btn-admin"><span>🔧</span> Panel de administración</button>'
          : ''}
        <button class="auth-dropdown-item auth-dropdown-danger" id="auth-btn-logout">
          <span>⬡</span> Cerrar sesión
        </button>
      </div>
    `;
    actions.insertBefore(wrap, actions.firstChild);

    // Toggle dropdown
    document.getElementById('auth-user-widget').addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('auth-dropdown').classList.toggle('hidden');
    });
    document.addEventListener('click', () => {
      document.getElementById('auth-dropdown')?.classList.add('hidden');
    });

    // Logout
    document.getElementById('auth-btn-logout').addEventListener('click', () => {
      if (confirm('¿Desea cerrar la sesión actual?')) {
        clearSession();
        window.location.reload();
      }
    });

    // Admin panel
    if (session.rol === 'admin') {
      document.getElementById('auth-btn-admin')?.addEventListener('click', () => {
        document.getElementById('auth-dropdown').classList.add('hidden');
        openAdminPanel();
      });
    }
  }

  // ─── Pantalla de login ────────────────────────────────────
  function renderLoginScreen() {
    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.innerHTML = `
      <div class="login-bg-pattern"></div>
      <div class="login-card">

        <!-- Logo -->
        <div class="login-logo-area">
          <div class="login-logo-mark">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="10" fill="#1d4ed8"/>
              <path d="M10 14h20M10 20h14M10 26h18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <div class="login-app-name">ETED Dashboard</div>
            <div class="login-app-sub">Ing. Maloni Alcantara Jimenez</div>
          </div>
        </div>

        <div class="login-headline">Inicie sesión para continuar</div>

        <!-- Error -->
        <div id="login-error" class="login-error-box hidden"></div>

        <!-- Form -->
        <div class="login-form-wrap">
          <div class="login-field-group">
            <label class="login-label" for="li-username">Usuario</label>
            <div class="login-input-row">
              <svg class="login-field-icon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/>
              </svg>
              <input class="login-input" type="text" id="li-username"
                placeholder="Nombre de usuario" autocomplete="username" spellcheck="false" />
            </div>
          </div>

          <div class="login-field-group">
            <label class="login-label" for="li-password">Contraseña</label>
            <div class="login-input-row">
              <svg class="login-field-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"/>
              </svg>
              <input class="login-input" type="password" id="li-password"
                placeholder="Contraseña" autocomplete="current-password" />
              <button class="login-eye-btn" id="li-eye" type="button" title="Mostrar/ocultar contraseña">
                <svg id="li-eye-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                  <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"/>
                </svg>
              </button>
            </div>
          </div>

          <button class="login-submit-btn" id="li-submit">
            <span id="li-btn-label">Iniciar sesión</span>
            <div id="li-spinner" class="login-spinner hidden"></div>
          </button>
        </div>

        <div class="login-footer-note">
          <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 4.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM8 7a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 7z"/>
          </svg>
          Sesión protegida · Comunicaciones ETED © 2026
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Autofocus
    setTimeout(() => document.getElementById('li-username')?.focus(), 80);

    // Show/hide password
    let pwdVisible = false;
    document.getElementById('li-eye').addEventListener('click', () => {
      pwdVisible = !pwdVisible;
      const inp = document.getElementById('li-password');
      inp.type = pwdVisible ? 'text' : 'password';
      document.getElementById('li-eye-icon').innerHTML = pwdVisible
        ? '<path fill-rule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 012.374 2.373l1.091 1.092a4 4 0 00-4.557-4.557z" clip-rule="evenodd"/><path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z"/>'
        : '<path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"/>';
    });

    // Enter key navigation
    document.getElementById('li-username').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('li-password').focus();
    });
    document.getElementById('li-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('li-submit').click();
    });
  }

  function showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (!el) return;
    el.textContent = '⚠ ' + msg;
    el.classList.remove('hidden', 'login-error-shake');
    void el.offsetWidth; // reflow para re-trigger la animación
    el.classList.add('login-error-shake');
  }

  function bindLoginSubmit(usersData) {
    const btn = document.getElementById('li-submit');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const username = (document.getElementById('li-username').value || '').trim();
      const password =  document.getElementById('li-password').value || '';

      if (!username || !password) {
        showLoginError('Por favor ingrese usuario y contraseña.');
        return;
      }

      // Estado de carga
      btn.disabled = true;
      document.getElementById('li-btn-label').textContent = 'Verificando…';
      document.getElementById('li-spinner').classList.remove('hidden');
      document.getElementById('login-error').classList.add('hidden');

      // Pequeña pausa para UX (y anti-brute-force psicológico)
      await new Promise(r => setTimeout(r, 480));

      const session = await login(username, password, usersData);

      if (session) {
        // Éxito → fade-out y cargar app
        const overlay = document.getElementById('login-overlay');
        overlay.classList.add('login-fade-out');
        setTimeout(async () => {
          overlay.remove();
          applyRolePermissions(session.rol);
          try {
            await loadMainApp();
          } catch (e) {
            alert('Error al cargar la aplicación: ' + e.message);
            return;
          }
          injectTopbarUI(session);
        }, 380);
      } else {
        // Fallo
        btn.disabled = false;
        document.getElementById('li-btn-label').textContent = 'Iniciar sesión';
        document.getElementById('li-spinner').classList.add('hidden');
        showLoginError('Usuario o contraseña incorrectos. Intente nuevamente.');
        document.getElementById('li-password').value = '';
        document.getElementById('li-password').focus();
      }
    });
  }

  // ─── Panel de administración ──────────────────────────────
  async function openAdminPanel() {
    const usersData = await loadUsers();
    const modal = document.createElement('div');
    modal.id = 'auth-admin-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = buildAdminPanelHTML(usersData);
    document.body.appendChild(modal);
    bindAdminPanelEvents(modal, usersData);
  }

  function buildAdminPanelHTML(usersData) {
    return `
      <div class="modal" style="max-width:780px">
        <div class="modal-header">
          <h2>🔧 Panel de Administración de Usuarios</h2>
          <button class="btn btn-sm" id="adm-close">✕</button>
        </div>
        <div class="modal-body" style="gap:20px">

          <!-- Verificación de clave maestra -->
          <div id="adm-key-wrap" class="adm-key-section">
            <div class="adm-key-inner">
              <svg style="width:20px;height:20px;color:var(--warn);flex-shrink:0" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/>
              </svg>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;margin-bottom:4px">Verificación de Clave Maestra</div>
                <div style="font-size:12px;color:var(--text3)">Ingrese la clave de administrador para gestionar usuarios.</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px">
              <input type="password" id="adm-key-input" placeholder="Clave de administrador…"
                style="font-family:var(--font);font-size:13px;border:1px solid var(--border);border-radius:var(--radius);padding:8px 12px;flex:1;min-width:200px;outline:none;transition:border-color .15s"
                onfocus="this.style.borderColor='var(--eted)'" onblur="this.style.borderColor='var(--border)'" />
              <button class="btn btn-primary" id="adm-key-verify">Verificar acceso</button>
            </div>
            <div id="adm-key-msg" style="font-size:12px;color:var(--danger);margin-top:6px;min-height:18px"></div>
          </div>

          <!-- Sección de usuarios (oculta hasta verificar) -->
          <div id="adm-users-wrap" class="hidden">

            <!-- Tabla de usuarios -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <span style="font-size:14px;font-weight:600">👥 Usuarios registrados</span>
              <button class="btn btn-primary btn-sm" id="adm-new-user">+ Nuevo usuario</button>
            </div>
            <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:16px">
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <thead>
                  <tr style="background:var(--surface2)">
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border)">Usuario</th>
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border)">Nombre</th>
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border)">Rol</th>
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border)">Estado</th>
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border)">Creado</th>
                    <th style="padding:10px 14px;text-align:left;font-size:11px;color:var(--text2);font-weight:600;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid var(--border)">Acciones</th>
                  </tr>
                </thead>
                <tbody id="adm-tbody"></tbody>
              </table>
            </div>

            <!-- Formulario de usuario (add/edit) -->
            <div id="adm-form-wrap" class="hidden adm-form-section">
              <div class="section-title" id="adm-form-title" style="grid-column:1/-1;margin-bottom:16px">Nuevo usuario</div>
              <input type="hidden" id="auf-id" />
              <div class="form-row">
                <div class="form-group">
                  <label>Usuario *</label>
                  <input type="text" id="auf-username" placeholder="nombre_usuario" />
                </div>
                <div class="form-group">
                  <label>Nombre completo *</label>
                  <input type="text" id="auf-nombre" placeholder="Nombre Apellido" />
                </div>
                <div class="form-group">
                  <label>Contraseña <span id="auf-pwd-hint" style="font-size:10px;color:var(--text3);font-weight:400"></span></label>
                  <input type="password" id="auf-password" placeholder="Mín. 6 caracteres" autocomplete="new-password" />
                </div>
                <div class="form-group">
                  <label>Rol *</label>
                  <select id="auf-rol">
                    <option value="viewer">👁 Viewer – Solo lectura</option>
                    <option value="editor">✏️ Editor – Puede crear y editar</option>
                    <option value="admin">👑 Admin – Control total</option>
                  </select>
                </div>
              </div>
              <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
                <button class="btn btn-sm" id="auf-cancel">Cancelar</button>
                <button class="btn btn-primary btn-sm" id="auf-save">💾 Guardar usuario</button>
              </div>
            </div>
          </div>

        </div>
        <div class="modal-footer" style="justify-content:space-between">
          <span style="font-size:11px;color:var(--text3)">⚠ Cambios guardados en localStorage del navegador. Exporte para actualizar users.json.</span>
          <button class="btn btn-sm" id="adm-export">⬇ Exportar users.json</button>
        </div>
      </div>
    `;
  }

  function buildUserRow(u) {
    const rolBadge = { admin: 'style="background:var(--eted-bg);color:var(--eted);border:1px solid var(--eted-bd)"', editor: 'style="background:var(--kepco-bg);color:var(--kepco);border:1px solid var(--kepco-bd)"', viewer: 'style="background:var(--digital-bg);color:var(--digital)"' };
    const rolLabel = { admin: '👑 Admin', editor: '✏️ Editor', viewer: '👁 Viewer' };
    const active   = u.activo !== false;
    return `
      <tr style="border-bottom:1px solid var(--border);transition:background .1s" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''">
        <td style="padding:10px 14px"><code style="font-size:13px;font-weight:600">${esc(u.username)}</code></td>
        <td style="padding:10px 14px">${esc(u.nombre)}</td>
        <td style="padding:10px 14px"><span class="badge" ${rolBadge[u.rol] || ''}>${rolLabel[u.rol] || u.rol}</span></td>
        <td style="padding:10px 14px"><span class="badge" style="background:${active ? 'var(--ok-bg)' : 'var(--danger-bg)'};color:${active ? 'var(--ok)' : 'var(--danger)'}">${active ? '✓ Activo' : '✗ Inactivo'}</span></td>
        <td style="padding:10px 14px;font-size:12px;color:var(--text3)">${u.creado || '—'}</td>
        <td style="padding:10px 14px">
          <div style="display:flex;gap:4px">
            <button class="btn btn-sm adm-row-edit" data-id="${u.id}">✏️</button>
            <button class="btn btn-sm adm-row-toggle" data-id="${u.id}">${active ? 'Desactivar' : 'Activar'}</button>
            <button class="btn btn-sm btn-danger adm-row-del" data-id="${u.id}">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function bindAdminPanelEvents(modal, usersData) {
    // Cerrar
    modal.querySelector('#adm-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Verificar clave
    const doVerify = async () => {
      const key = modal.querySelector('#adm-key-input').value;
      const ok  = await checkAdminKey(key, usersData);
      if (ok) {
        modal.querySelector('#adm-key-wrap').classList.add('hidden');
        modal.querySelector('#adm-users-wrap').classList.remove('hidden');
        refreshTable();
      } else {
        const msg = modal.querySelector('#adm-key-msg');
        msg.textContent = '✗ Clave incorrecta. Intente nuevamente.';
        setTimeout(() => { msg.textContent = ''; }, 3000);
        modal.querySelector('#adm-key-input').value = '';
        modal.querySelector('#adm-key-input').focus();
      }
    };
    modal.querySelector('#adm-key-verify').addEventListener('click', doVerify);
    modal.querySelector('#adm-key-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') doVerify();
    });

    // Refrescar tabla
    function refreshTable() {
      modal.querySelector('#adm-tbody').innerHTML =
        usersData.users.map(buildUserRow).join('');
      bindRowActions();
    }

    // Mostrar formulario
    function showForm(userId) {
      modal.querySelector('#adm-form-wrap').classList.remove('hidden');
      modal.querySelector('#auf-id').value = userId || '';

      if (userId) {
        const u = usersData.users.find(u => u.id === userId);
        modal.querySelector('#adm-form-title').textContent = `Editar: @${u.username}`;
        modal.querySelector('#auf-username').value = u.username;
        modal.querySelector('#auf-nombre').value   = u.nombre;
        modal.querySelector('#auf-password').value = '';
        modal.querySelector('#auf-rol').value      = u.rol;
        modal.querySelector('#auf-pwd-hint').textContent = '(vacío = no cambiar)';
      } else {
        modal.querySelector('#adm-form-title').textContent = 'Nuevo usuario';
        ['#auf-username','#auf-nombre','#auf-password'].forEach(id => {
          modal.querySelector(id).value = '';
        });
        modal.querySelector('#auf-rol').value = 'viewer';
        modal.querySelector('#auf-pwd-hint').textContent = '(obligatoria)';
      }
      modal.querySelector('#auf-username').focus();
    }

    modal.querySelector('#adm-new-user').addEventListener('click', () => showForm(null));
    modal.querySelector('#auf-cancel').addEventListener('click', () => {
      modal.querySelector('#adm-form-wrap').classList.add('hidden');
    });

    // Guardar usuario
    modal.querySelector('#auf-save').addEventListener('click', async () => {
      const id       = modal.querySelector('#auf-id').value;
      const username = (modal.querySelector('#auf-username').value || '').trim();
      const nombre   = (modal.querySelector('#auf-nombre').value || '').trim();
      const password =  modal.querySelector('#auf-password').value;
      const rol      =  modal.querySelector('#auf-rol').value;

      if (!username || !nombre) {
        alert('⚠ Usuario y nombre completo son obligatorios.'); return;
      }

      if (id) {
        // Editar existente
        const idx = usersData.users.findIndex(u => u.id === id);
        if (idx === -1) return;
        // Verificar username único (excepto él mismo)
        const dup = usersData.users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.id !== id);
        if (dup) { alert('⚠ Ya existe otro usuario con ese nombre.'); return; }
        usersData.users[idx].username = username;
        usersData.users[idx].nombre   = nombre;
        usersData.users[idx].rol      = rol;
        if (password) {
          if (password.length < 6) { alert('⚠ La contraseña debe tener al menos 6 caracteres.'); return; }
          usersData.users[idx].passwordHash = await sha256(password);
        }
      } else {
        // Crear nuevo
        if (!password || password.length < 6) {
          alert('⚠ La contraseña es obligatoria y debe tener al menos 6 caracteres.'); return;
        }
        const dup = usersData.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        if (dup) { alert('⚠ Ya existe un usuario con ese nombre.'); return; }
        usersData.users.push({
          id:           'user-' + Date.now(),
          username, nombre, rol,
          passwordHash: await sha256(password),
          activo:       true,
          creado:       new Date().toISOString().slice(0, 10)
        });
      }

      saveUsers(usersData);
      modal.querySelector('#adm-form-wrap').classList.add('hidden');
      refreshTable();
    });

    // Acciones por fila
    function bindRowActions() {
      modal.querySelectorAll('.adm-row-edit').forEach(btn => {
        btn.addEventListener('click', () => showForm(btn.dataset.id));
      });
      modal.querySelectorAll('.adm-row-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const u = usersData.users.find(u => u.id === btn.dataset.id);
          if (!u) return;
          u.activo = u.activo === false;
          saveUsers(usersData);
          refreshTable();
        });
      });
      modal.querySelectorAll('.adm-row-del').forEach(btn => {
        btn.addEventListener('click', () => {
          const u = usersData.users.find(u => u.id === btn.dataset.id);
          if (!u) return;
          if (!confirm(`¿Eliminar el usuario "${u.username}"? Esta acción es irreversible.`)) return;
          usersData.users = usersData.users.filter(x => x.id !== u.id);
          saveUsers(usersData);
          refreshTable();
        });
      });
    }

    // Exportar users.json actualizado
    modal.querySelector('#adm-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(usersData, null, 2)], { type: 'application/json' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = 'users.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  // ─── Punto de entrada ─────────────────────────────────────
  async function init() {
    const session = getSession();
    if (session) {
      // Sesión válida → cargar app directamente
      applyRolePermissions(session.rol);
      try {
        await loadMainApp();
      } catch (e) {
        console.error('[AUTH] Error cargando main.js:', e);
      }
      injectTopbarUI(session);
    } else {
      // Sin sesión → mostrar login
      const usersData = await loadUsers();
      renderLoginScreen();
      bindLoginSubmit(usersData);
    }
  }

  // API pública mínima
  return { init };

})();

// Arrancar
AUTH.init();
