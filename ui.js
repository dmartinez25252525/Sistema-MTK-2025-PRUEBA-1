import { API_BASE } from "./api.js";

const token = localStorage.getItem("mtk_token");
const user  = JSON.parse(localStorage.getItem("mtk_user") || "{}");
if (!token) window.location.href = "./login.html";

// Header (top derecho)
const uinfo = document.getElementById("userInfo");
if (uinfo) uinfo.textContent = `${user.nickname || user.email} | ${user.rol || "-"}`;
const wname = document.getElementById("welcomeName");
if (wname) wname.textContent = user.nickname || user.email;
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) btnLogout.addEventListener("click", () => {
  localStorage.removeItem("mtk_token");
  localStorage.removeItem("mtk_user");
  window.location.href = "./login.html";
});

// Roles
const isAdmin = user.rol === "Administrador";
const isSec   = user.rol === "Secretaria";
const isSensei= !isAdmin && !isSec;

// Menú
const baseMod = [
  { id:"usuarios",  label:"Usuarios",     icon:"bi-people-fill",       section:"menu"       , show:isAdmin },
  { id:"alumnos",   label:"Alumnos",      icon:"bi-person-lines-fill", section:"menu"       , show:isAdmin || isSec || isSensei },
  { id:"asistencia",label:"Asistencia",   icon:"bi-check2-square",     section:"menu"       , show:isAdmin || isSec || isSensei },

  { id:"pagos",     label:"Pagos",        icon:"bi-cash-coin",         section:"pagos"      , show:isAdmin || isSec },
  { id:"calendario",label:"Calendario",   icon:"bi-calendar-event",    section:"actividades", show:isAdmin || isSec || isSensei },
  { id:"notificaciones",label:"Notificaciones", icon:"bi-bell-fill",   section:"actividades", show:isAdmin || isSec },

  { id:"torneos",   label:"Torneos",      icon:"bi-trophy-fill",       section:"rendimiento", show:isAdmin || isSec || isSensei },
  { id:"spartans",  label:"Spartans",     icon:"bi-shield-fill-check", section:"rendimiento", show:isAdmin || isSec || isSensei },
  { id:"medallero", label:"Medallero",    icon:"bi-graph-up-arrow",    section:"analisis"   , show:isAdmin || isSec },

  { id:"perfil",    label:"Mi Perfil",    icon:"bi-person-circle",     section:"menu"       , show:true }
];

const containers = {
  menu: document.getElementById("menu"),
  pagos: document.getElementById("menu-pagos"),
  actividades: document.getElementById("menu-actividades"),
  rendimiento: document.getElementById("menu-rendimiento"),
  analisis: document.getElementById("menu-analisis")
};

baseMod.filter(m => m.show).forEach(m => {
  const ul = containers[m.section] || containers.menu;
  if (!ul) return;
  const li = document.createElement("li");
  li.className = "nav-item";
  li.innerHTML = `
    <a href="#" class="nav-link d-flex align-items-center gap-2" data-mod="${m.id}">
      <i class="bi ${m.icon}"></i><span>${m.label}</span>
    </a>`;
  ul.appendChild(li);
});

function activateLink(a){
  document.querySelectorAll(".nav .nav-link").forEach(x => x.classList.remove("active"));
  a.classList.add("active");
}

function renderModulo(mod){
  if (mod === "usuarios" && !isAdmin){
    document.getElementById("content").innerHTML = `<div class="alert alert-warning m-0">No autorizado</div>`;
    return;
  }
  if (mod === "asistencia") return renderAsistencia();

  if (mod === "pagos") return renderPagos();
  if (mod === "usuarios") return renderUsuarios();
  if (mod === "alumnos") return renderAlumnos();


  const desc = {
    alumnos: "Gestión de alumnos con filtros (edad, horario, cinta, programa).",
    asistencia: "Asistencia con switch 3 estados (verde/amarillo/rojo), historial y PDF.",
    pagos: "Mensualidades (no Antigua), uniformes, playeras, exámenes. Reportes en PDF.",
    torneos: "Gestión de torneos y rendimiento.",
    spartans: "Equipo de competencia (asistencia y planificación propios).",
    calendario: "Planificación y actividades.",
    notificaciones: "Envía notificaciones a senseis por sede o general.",
    medallero: "Resultados WKC/WAKO (Spartans y MTK).",
    usuarios: "Creación/roles/permisos (solo Admin).",
    perfil: "Perfil del usuario con foto."
  }[mod] || "Módulo";

  document.getElementById("content").innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0 text-capitalize">${mod}</h4>
    </div>
    <div class="border-bottom mb-3"></div>
    <p>${desc}</p>
    <div class="alert alert-info">Conectaremos este módulo a su API correspondiente.</div>
  `;
}

function renderAsistencia(){
  // Si ya traes sedes desde el login, reemplaza este arreglo:
  const sedes = [
    { idSedes: 1, Nombre: "Gym Central" },
    { idSedes: 2, Nombre: "Sede Joyabaj" },
    { idSedes: 3, Nombre: "Antigua - Club El Esfuerzo" },
    { idSedes: 4, Nombre: "Antigua - San Juan el Obispo" },
    { idSedes: 5, Nombre: "Antigua - San Mateo Milpas Altas" },
  ];
  const hoy = new Date().toISOString().slice(0,10);
  let pending = new Map(); // personaId -> {estado:'A'|'J'|'F', observaciones}
  let currentHorarioId = null;

  const headersAuth = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${localStorage.getItem("mtk_token") || ""}`
  };

  const byId = (id)=>document.getElementById(id);
  const escapeHtml = (s="") => String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const sedeOps = sedes.map(s => `<option value="${s.idSedes}">${s.Nombre}</option>`).join("");

  document.getElementById("content").innerHTML = `
    <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
      <div>
        <label class="form-label small fw-semibold m-0">Sede</label>
        <select id="asiSede" class="form-select form-select-sm" style="min-width:260px;">${sedeOps}</select>
      </div>
      <div>
        <label class="form-label small fw-semibold m-0">Fecha</label>
        <input id="asiFecha" type="date" class="form-control form-control-sm" value="${hoy}">
      </div>
      <div>
        <label class="form-label small fw-semibold m-0">Horario</label>
        <select id="asiHorario" class="form-select form-select-sm" style="min-width:240px;">
          <option value="">— Sin horarios —</option>
        </select>
      </div>
      <div class="ms-auto d-flex gap-2">
        <button id="btnResumen" class="btn btn-outline-secondary btn-sm"><i class="bi bi-percent"></i> Resumen</button>
        <button id="btnPdf" class="btn btn-danger btn-sm" disabled><i class="bi bi-filetype-pdf"></i> Exportar PDF</button>
        <button id="btnUndo" class="btn btn-outline-warning btn-sm" disabled><i class="bi bi-arrow-counterclockwise"></i> Deshacer</button>
        <button id="btnSave" class="btn btn-success btn-sm" disabled><i class="bi bi-save2-fill"></i> Guardar</button>
      </div>
    </div>
    <div class="small text-muted mb-2" id="pendingInfo">Sin cambios pendientes.</div>
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th style="width:50px;">#</th>
            <th>Alumno</th>
            <th style="width:260px;">Estado</th>
            <th style="width:260px;">Observaciones</th>
          </tr>
        </thead>
        <tbody id="asiBody"><tr><td colspan="4" class="text-center text-muted">—</td></tr></tbody>
      </table>
    </div>
    <div id="asiResumen" class="mt-3"></div>
  `;

  byId("asiSede").addEventListener("change", loadHorarios);
  byId("asiFecha").addEventListener("change", loadHorarios);
  byId("asiHorario").addEventListener("change", () => {
    currentHorarioId = byId("asiHorario").value || null;
    reloadAlumnos();
  });
  byId("btnSave").addEventListener("click", onSaveAll);
  byId("btnUndo").addEventListener("click", () => reloadAlumnos());
  byId("btnResumen").addEventListener("click", onResumenClick);
  byId("btnPdf").addEventListener("click", onExportPdf);

  loadHorarios();

  function setPending(personaId, estado, obs){
    pending.set(String(personaId), { estado, observaciones: obs || "" });
    updatePendingUI();
  }
  function clearPending(){ pending.clear(); updatePendingUI(); }
  function updatePendingUI(){
    const q = pending.size;
    byId("pendingInfo").textContent = q>0 ? `${q} cambio(s) sin guardar.` : "Sin cambios pendientes.";
    byId("btnSave").disabled = q === 0;
    byId("btnUndo").disabled = q === 0;
    byId("btnPdf").disabled = !currentHorarioId;
  }

  async function loadHorarios(){
    clearPending();
    byId("asiBody").innerHTML = `<tr><td colspan="4" class="text-center text-muted">—</td></tr>`;
    byId("asiResumen").innerHTML = "";

    const sedeId = byId("asiSede").value;
    const fecha  = byId("asiFecha").value;

    const sel = byId("asiHorario");
    sel.innerHTML = `<option value="">Cargando...</option>`;

    const r = await fetch(`${API_BASE}/asistencia/horarios?sedeId=${encodeURIComponent(sedeId)}&fecha=${encodeURIComponent(fecha)}`, { headers: headersAuth });
    const j = await r.json();
    const ops = j.ok ? (j.data||[]) : [];

    if (!ops.length){
      sel.innerHTML = `<option value="">— Sin horarios —</option>`;
      currentHorarioId = null;
      updatePendingUI();
      return;
    }
    sel.innerHTML = ops.map(o => `<option value="${o.id}">${o.label}</option>`).join("");
    currentHorarioId = String(ops[0].id);
    sel.value = currentHorarioId;

    reloadAlumnos();
  }

  async function reloadAlumnos(){
    clearPending();
    const sedeId    = byId("asiSede").value;
    const fecha     = byId("asiFecha").value;
    const horarioId = currentHorarioId;

    if (!horarioId){
      byId("asiBody").innerHTML = `<tr><td colspan="4" class="text-center text-muted">Selecciona un horario</td></tr>`;
      updatePendingUI();
      return;
    }

    const r = await fetch(
      `${API_BASE}/asistencia/alumnos?sedeId=${encodeURIComponent(sedeId)}&fecha=${encodeURIComponent(fecha)}&horarioId=${encodeURIComponent(horarioId)}`,
      { headers: headersAuth }
    );
    const j = await r.json();
    const rows = (j.ok && Array.isArray(j.data)) ? j.data : [];

    const tbody = byId("asiBody");
    if (!rows.length){
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No hay alumnos en este horario.</td></tr>`;
      updatePendingUI();
      return;
    }

    tbody.innerHTML = rows.map((r, i) => {
      // Mapea el estado actual a letra
      const letra = r.estadoId===1 ? "A" : r.estadoId===2 ? "J" : "F";
      const obs = r.Observaciones || "";
      return `
        <tr data-persona="${r.idPersonas}">
          <td>${i+1}</td>
          <td>${escapeHtml(r.alumno)}</td>
          <td>
            <div class="btn-group w-100" role="group" aria-label="Estado asistencia">
              <!-- Orden solicitado: Verde (A), Amarillo (J), Rojo (F) -->
              <button class="btn btn-sm btn-outline-success state-opt ${letra==='A'?'active':''}" data-state="A" title="Asistió (A)">
                <i class="bi bi-check2-circle"></i>
              </button>
              <button class="btn btn-sm btn-outline-warning state-opt ${letra==='J'?'active':''}" data-state="J" title="Justificado (J)">
                <i class="bi bi-exclamation-circle"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger state-opt ${letra==='F'?'active':''}" data-state="F" title="Faltó (F)">
                <i class="bi bi-x-circle"></i>
              </button>
            </div>
          </td>
          <td>
            <input type="text" class="form-control form-control-sm obs-input" placeholder="Nota / reporte (opcional)" value="${escapeHtml(obs)}">
          </td>
        </tr>`;
    }).join("");

    tbody.querySelectorAll(".state-opt").forEach(btn => {
      btn.addEventListener("click", () => {
        const tr = btn.closest("tr");
        tr.querySelectorAll(".state-opt").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const personaId = tr.getAttribute("data-persona");
        const estado = btn.dataset.state; // A/J/F
        const obs = tr.querySelector(".obs-input").value || "";
        setPending(personaId, estado, obs);
      });
    });
    tbody.querySelectorAll(".obs-input").forEach(inp => {
      inp.addEventListener("input", () => {
        const tr = inp.closest("tr");
        const personaId = tr.getAttribute("data-persona");
        const active = tr.querySelector(".state-opt.active");
        const estado = active ? active.dataset.state : "F";
        setPending(personaId, estado, inp.value || "");
      });
    });

    updatePendingUI();
  }

  async function onSaveAll(){
    const sedeId    = Number(byId("asiSede").value);
    const fecha     = byId("asiFecha").value;
    const horarioId = Number(currentHorarioId);
    if (!horarioId || pending.size===0) return;

    const items = Array.from(pending.entries()).map(([personaId, v]) => ({
      personaId: Number(personaId),
      estado: String(v.estado),                  // 'A'|'J'|'F'
      observaciones: v.observaciones || ""       // nota
    }));

    const r = await fetch(`${API_BASE}/asistencia/marcar-multiple`,{
      method:"POST",
      headers: headersAuth,
      body: JSON.stringify({ sedeId, fecha, horarioId, items })
    });
    const j = await r.json();
    if (!j.ok) return alert(j.msg || "Error al guardar");
    clearPending();
    reloadAlumnos();
  }

  async function onResumenClick(){
    const sedeId    = byId("asiSede").value;
    const fecha     = byId("asiFecha").value;
    const horarioId = currentHorarioId || "";

    const r = await fetch(
      `${API_BASE}/asistencia/resumen?sedeId=${encodeURIComponent(sedeId)}&desde=${encodeURIComponent(fecha)}&hasta=${encodeURIComponent(fecha)}&horarioId=${encodeURIComponent(horarioId)}`,
      { headers: headersAuth }
    );
    const j = await r.json();
    if (!j.ok) return;

    const s = j.data || [];
    const total = j.total || 0;
    const pct = (id)=> (s.find(x => Number(x.estadoId)===id)?.porcentaje || 0);

    byId("asiResumen").innerHTML = `
      <div class="card p-3">
        <div class="row g-2">
          <div class="col-12 col-md-3"><div class="alert alert-success m-0">Asistió: ${pct(1)}%</div></div>
          <div class="col-12 col-md-3"><div class="alert alert-warning m-0">Justificado: ${pct(2)}%</div></div>
          <div class="col-12 col-md-3"><div class="alert alert-danger m-0">Faltó: ${pct(0)}%</div></div>
          <div class="col-12 col-md-3"><div class="alert alert-secondary m-0">Total marcadas: ${total}</div></div>
        </div>
      </div>`;
  }

  function onExportPdf(){
    const sedeId    = byId("asiSede").value;
    const fecha     = byId("asiFecha").value;
    const horarioId = currentHorarioId;
    if (!horarioId) return;
    // Sólo abre el PDF; el backend genera según BD (estados ya guardados)
    window.open(`${API_BASE}/asistencia/pdf?sedeId=${encodeURIComponent(sedeId)}&fecha=${encodeURIComponent(fecha)}&horarioId=${encodeURIComponent(horarioId)}`,"_blank");
  }
}


function renderPagos(){
  const byId = (id)=>document.getElementById(id);
  const esc = (s="") => String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const yearNow = new Date().getFullYear();
  const SEDES_ANTIGUA = new Set([3,4,5]);

  document.getElementById("content").innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0">Pagos</h4>
      <div class="d-flex gap-2">
        <select id="pgSede" class="form-select form-select-sm" style="min-width:260px"></select>
        <input id="pgAnio" type="number" class="form-control form-control-sm" style="width:110px" value="${yearNow}">
        <button id="pgRef" class="btn btn-sm btn-outline-secondary" title="Refrescar"><i class="bi bi-arrow-repeat"></i></button>
      </div>
    </div>

    <ul class="nav nav-tabs" id="pgTabs" role="tablist">
      <li class="nav-item"><button class="nav-link active" data-target="#paneMensualidad" type="button" role="tab">Mensualidad</button></li>
      <li class="nav-item"><button class="nav-link" data-target="#paneExamenes" type="button" role="tab">Exámenes</button></li>
      <li class="nav-item"><button class="nav-link" data-target="#panePlayeras" type="button" role="tab">Playeras</button></li>
      <li class="nav-item"><button class="nav-link" data-target="#paneUniformes" type="button" role="tab">Uniformes</button></li>
    </ul>

    <div class="tab-content border border-top-0 p-3">
      <!-- Mensualidad -->
      <div class="tab-pane fade show active" id="paneMensualidad" role="tabpanel">
        <div class="row g-3">
          <div class="col-12 col-md-3">
            <div id="mnMeses" class="list-group"></div>
          </div>
          <div class="col-12 col-md-9">
            <div class="table-responsive">
              <table class="table table-sm align-middle">
                <thead class="table-light">
                  <tr><th style="width:60px;">Id</th><th>Nombre Alumno</th><th style="width:120px;">Monto</th><th style="width:120px;">Solvente</th></tr>
                </thead>
                <tbody id="mnBody"><tr><td colspan="4" class="text-center text-muted">Selecciona un mes…</td></tr></tbody>
              </table>
            </div>

            <div class="d-flex justify-content-between align-items-center mt-3">
              <div class="small text-muted" id="mnInfoAntigua" style="display:none;">En las sedes de Antigua no se cobra mensualidad.</div>
              <div class="d-flex gap-2">
                <button id="mnPdf" class="btn btn-danger" title="Exportar PDF del mes"><i class="bi bi-filetype-pdf"></i> Exportar PDF</button>
                <button id="mnUndo" class="btn btn-outline-secondary" disabled><i class="bi bi-arrow-counterclockwise"></i> Deshacer</button>
                <button id="mnSave" class="btn btn-primary" disabled><i class="bi bi-save2"></i> Guardar Cambios</button>
              </div>
            </div>
            <div class="small text-muted mt-2" id="mnPend">Sin cambios pendientes.</div>
          </div>
        </div>
      </div>

      <!-- Exámenes -->
      <div class="tab-pane fade" id="paneExamenes" role="tabpanel">
        <div class="row g-2 mb-2">
          <div class="col-auto"><input id="exDesde" type="date" class="form-control form-control-sm"></div>
          <div class="col-auto"><input id="exHasta" type="date" class="form-control form-control-sm"></div>
          <div class="col-auto"><button id="exRef" class="btn btn-sm btn-outline-secondary"><i class="bi bi-search"></i></button></div>
        </div>
        <div class="row g-3">
          <div class="col-12 col-lg-7">
            <div class="table-responsive">
              <table class="table table-sm align-middle">
                <thead class="table-light"><tr><th>Fecha</th><th>Alumno</th><th>Monto</th><th>Descripción</th><th>Estado</th></tr></thead>
                <tbody id="exBody"><tr><td colspan="5" class="text-center text-muted">—</td></tr></tbody>
              </table>
            </div>
          </div>
          <div class="col-12 col-lg-5">
            <div class="card">
              <div class="card-header fw-semibold">Registrar examen</div>
              <div class="card-body">
                <div class="row g-2">
                  <div class="col-12"><select id="exPersona" class="form-select form-select-sm"></select></div>
                  <div class="col-6"><input id="exFecha" type="date" class="form-control form-control-sm"></div>
                  <div class="col-6"><input id="exMonto" type="number" step="0.01" class="form-control form-control-sm" placeholder="Monto"></div>
                  <div class="col-12"><input id="exDesc" class="form-control form-control-sm" placeholder="Descripción"></div>
                  <div class="col-12">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" id="exEstado" checked>
                      <label class="form-check-label" for="exEstado">Pagado</label>
                    </div>
                  </div>
                  <div class="col-12 d-flex justify-content-end">
                    <button id="exCrear" class="btn btn-success btn-sm"><i class="bi bi-plus-circle"></i> Registrar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Playeras -->
      <div class="tab-pane fade" id="panePlayeras" role="tabpanel">
        <div class="row g-2 mb-2">
          <div class="col-auto"><input id="plDesde" type="date" class="form-control form-control-sm"></div>
          <div class="col-auto"><input id="plHasta" type="date" class="form-control form-control-sm"></div>
          <div class="col-auto"><button id="plRef" class="btn btn-sm btn-outline-secondary"><i class="bi bi-search"></i></button></div>
        </div>
        <div class="row g-3">
          <div class="col-12 col-lg-7">
            <div class="table-responsive">
              <table class="table table-sm align-middle">
                <thead class="table-light"><tr><th>Fecha</th><th>Alumno</th><th>Playera</th><th>Talla</th><th>Cant.</th><th>Monto</th><th>Estado</th></tr></thead>
                <tbody id="plBody"><tr><td colspan="7" class="text-center text-muted">—</td></tr></tbody>
              </table>
            </div>
          </div>
          <div class="col-12 col-lg-5">
            <div class="card">
              <div class="card-header fw-semibold">Registrar playera (MTK gris, Q60)</div>
              <div class="card-body">
                <div class="row g-2">
                  <div class="col-12"><select id="plPersona" class="form-select form-select-sm"></select></div>
                  <div class="col-6"><input id="plFecha" type="date" class="form-control form-control-sm"></div>
                  <div class="col-6"><input id="plCant" type="number" min="1" class="form-control form-control-sm" placeholder="Cantidad" value="1"></div>
                  <div class="col-12"><select id="plItem" class="form-select form-select-sm"></select></div>
                  <div class="col-12">
                    <div class="form-check form-switch mt-1">
                      <input class="form-check-input" type="checkbox" id="plEstado" checked>
                      <label class="form-check-label" for="plEstado">Pagado</label>
                    </div>
                  </div>
                  <div class="col-12 d-flex justify-content-end">
                    <button id="plCrear" class="btn btn-success btn-sm"><i class="bi bi-plus-circle"></i> Registrar</button>
                  </div>
                  <div class="col-12 small text-muted">* El monto es fijo Q60 por playera (automático).</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Uniformes -->
      <div class="tab-pane fade" id="paneUniformes" role="tabpanel">
        <div class="row g-2 mb-2">
          <div class="col-auto"><input id="unDesde" type="date" class="form-control form-control-sm"></div>
          <div class="col-auto"><input id="unHasta" type="date" class="form-control form-control-sm"></div>
          <div class="col-auto"><button id="unRef" class="btn btn-sm btn-outline-secondary"><i class="bi bi-search"></i></button></div>
        </div>
        <div class="row g-3">
          <div class="col-12 col-lg-7">
            <div class="table-responsive">
              <table class="table table-sm align-middle">
                <thead class="table-light"><tr><th>Fecha</th><th>Alumno</th><th>Detalle</th><th>Monto</th><th>Estado</th></tr></thead>
                <tbody id="unBody"><tr><td colspan="5" class="text-center text-muted">—</td></tr></tbody>
              </table>
            </div>
          </div>
          <div class="col-12 col-lg-5">
            <div class="card">
              <div class="card-header fw-semibold">Registrar uniforme</div>
              <div class="card-body">
                <div class="row g-2">
                  <div class="col-12"><select id="unPersona" class="form-select form-select-sm"></select></div>
                  <div class="col-6"><input id="unFecha" type="date" class="form-control form-control-sm"></div>
                  <div class="col-6"><input id="unMonto" type="number" step="0.01" class="form-control form-control-sm" placeholder="Monto"></div>
                  <div class="col-12"><input id="unDetalle" class="form-control form-control-sm" placeholder="Detalle (opcional)"></div>
                  <div class="col-12">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" id="unEstado" checked>
                      <label class="form-check-label" for="unEstado">Pagado</label>
                    </div>
                  </div>
                  <div class="col-12 d-flex justify-content-end">
                    <button id="unCrear" class="btn btn-success btn-sm"><i class="bi bi-plus-circle"></i> Registrar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;

  // ===== Pestañas sin depender de Bootstrap JS
  const tabs = document.querySelectorAll("#pgTabs .nav-link");
  const panes = document.querySelectorAll(".tab-pane");
  tabs.forEach(btn=>{
    btn.addEventListener("click", ()=>{
      tabs.forEach(b=>b.classList.remove("active"));
      panes.forEach(p=>p.classList.remove("show","active"));
      btn.classList.add("active");
      const pane = document.querySelector(btn.dataset.target);
      if (pane){ pane.classList.add("show","active"); }
    });
  });

  // Estado interno
  let mesesCache = [];   // mensualidad
  let mesActivo = null;
  let pending = new Map(); // `${mes}:${personaId}` -> {mes, personaId, pagado, monto}
  let alumnosCache = []; // para selects
  let playerasCat = [];

  (async ()=>{
    await loadCatalogos();
    initDefaultDates();
    bindEvents();
    await loadMensualidad();
    await loadAlumnosForForms();
    await loadExamenes();
    await loadPlayeras();
    await loadUniformes();
  })();

  function bindEvents(){
    byId("pgRef").addEventListener("click", refreshAll);
    byId("pgSede").addEventListener("change", refreshAll);
    byId("pgAnio").addEventListener("change", loadMensualidad);

    byId("mnSave").addEventListener("click", onSaveMensualidad);
    byId("mnUndo").addEventListener("click", ()=>{ pending.clear(); updatePend(); renderMes(mesActivo); });
    byId("mnPdf").addEventListener("click", onExportMensualidadPdf);

    byId("exRef").addEventListener("click", loadExamenes);
    byId("exCrear").addEventListener("click", crearExamen);

    byId("plRef").addEventListener("click", loadPlayeras);
    byId("plCrear").addEventListener("click", crearPlayera);

    byId("unRef").addEventListener("click", loadUniformes);
    byId("unCrear").addEventListener("click", crearUniforme);
  }

  async function refreshAll(){
    await loadMensualidad();
    await loadAlumnosForForms();
    await loadExamenes();
    await loadPlayeras();
    await loadUniformes();
  }

  function initDefaultDates(){
    const d1 = new Date(); d1.setDate(1);
    const d2 = new Date(); d2.setMonth(d2.getMonth()+1,0);
    const sDate = (d)=>d.toISOString().slice(0,10);
    byId("exDesde").value = byId("plDesde").value = byId("unDesde").value = sDate(d1);
    byId("exHasta").value = byId("plHasta").value = byId("unHasta").value = sDate(d2);
  }

  async function loadCatalogos(){
    const j = await fetch(`${API_BASE}/pagos/catalogos`).then(r=>r.json());
    const sedes = j?.data?.sedes || [];
    playerasCat = j?.data?.playeras || [];
    byId("pgSede").innerHTML = sedes.map(s=>`<option value="${s.idSedes}">${esc(s.Nombre)}</option>`).join("");
    byId("plItem").innerHTML = playerasCat.map(p=>`<option value="${p.idPlayeras}">${esc(p.Descripcion)} — Talla ${esc(p.Medida)}</option>`).join("");
  }

  // --------- Mensualidad
  function updatePend(){
    const q = pending.size;
    byId("mnPend").textContent = q ? `${q} cambio(s) sin guardar.` : "Sin cambios pendientes.";
    byId("mnSave").disabled = q===0;
    byId("mnUndo").disabled = q===0;
  }

  async function loadMensualidad(){
    pending.clear(); updatePend();
    const sedeId = Number(byId("pgSede").value||1);
    const anio = Number(byId("pgAnio").value)||yearNow;

    const j = await fetch(`${API_BASE}/pagos/mensualidad?sedeId=${sedeId}&anio=${anio}`).then(r=>r.json());
    mesesCache = j.ok ? (j.meses||[]) : [];
    byId("mnInfoAntigua").style.display = (j.isAntigua ? "block" : "none");

    renderMesesList();
    const m = (new Date().getMonth()+1);
    const pick = mesesCache.find(x=>x.mes===m) ? m : (mesesCache[0]?.mes||null);
    if (pick) selectMes(pick);

    if (SEDES_ANTIGUA.has(sedeId)) {
      byId("mnBody").innerHTML = `<tr><td colspan="4" class="text-center text-muted">En las sedes de Antigua no se cobra mensualidad.</td></tr>`;
    }
  }

  function renderMesesList(){
    const ul = byId("mnMeses");
    if (!mesesCache.length){ ul.innerHTML = `<div class="list-group-item text-muted">Sin meses</div>`; return; }
    ul.innerHTML = mesesCache.map(x=>`
      <button type="button" class="list-group-item list-group-item-action ${x.mes===mesActivo?'active':''}" data-mes="${x.mes}">
        ${esc(x.label)}
      </button>
    `).join("");
    ul.querySelectorAll(".list-group-item").forEach(b=>{
      b.addEventListener("click", ()=> selectMes(Number(b.dataset.mes)));
    });
  }

  function selectMes(m){ mesActivo=m; renderMes(m); renderMesesList(); }

  function renderMes(m){
    const sedeId = Number(byId("pgSede").value||1);
    const isAntigua = SEDES_ANTIGUA.has(sedeId);
    const data = mesesCache.find(x=>x.mes===m);
    const tb = byId("mnBody");
    if (!data || !data.alumnos.length){
      tb.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No hay alumnos.</td></tr>`; return;
    }
    tb.innerHTML = data.alumnos.map(a=>{
      const k = `${m}:${a.idPersonas}`;
      const pend = pending.get(k);
      const pagado = pend ? pend.pagado : !!a.pagado;
      const monto  = pend ? pend.monto  : (a.monto ?? 200);
      return `
        <tr data-persona="${a.idPersonas}">
          <td>${a.idPersonas}</td>
          <td>${esc(a.alumno)}</td>
          <td><input type="number" min="0" step="0.01" class="form-control form-control-sm mnMonto" value="${Number(monto).toFixed(2)}" ${isAntigua?'disabled':''}></td>
          <td>
            <div class="form-check form-switch m-0">
              <input class="form-check-input mnChk" type="checkbox" ${pagado?'checked':''} ${isAntigua?'disabled':''}>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    if (!isAntigua) {
      tb.querySelectorAll(".mnMonto").forEach(inp=>{
        inp.addEventListener("input", ()=>onRowChange(inp.closest("tr")));
      });
      tb.querySelectorAll(".mnChk").forEach(ch=>{
        ch.addEventListener("change", ()=>onRowChange(ch.closest("tr")));
      });
    }
  }

  function onRowChange(tr){
    const personaId = Number(tr.getAttribute("data-persona"));
    const monto  = Number(tr.querySelector(".mnMonto").value)||0;
    const pagado = tr.querySelector(".mnChk").checked;
    const k = `${mesActivo}:${personaId}`;
    pending.set(k, { mes: mesActivo, personaId, pagado, monto });
    updatePend();
  }

  async function onSaveMensualidad(){
    if (!mesActivo || pending.size===0) return;
    const sedeId = Number(byId("pgSede").value||1);
    if (SEDES_ANTIGUA.has(sedeId)) return;
    const anio = Number(byId("pgAnio").value)||yearNow;
    const cambios = Array.from(pending.values());
    const r = await fetch(`${API_BASE}/pagos/mensualidad/guardar`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ anio, sedeId, cambios })
    });
    const j = await r.json();
    if (!j.ok) return alert(j.msg || "Error guardando mensualidad");
    pending.clear(); updatePend();
    await loadMensualidad();
    selectMes(mesActivo);
  }

  function onExportMensualidadPdf(){
    if (!mesActivo) return alert("Selecciona un mes.");
    const sedeId = Number(byId("pgSede").value||1);
    const anio = Number(byId("pgAnio").value)||yearNow;
    if (SEDES_ANTIGUA.has(sedeId)) return alert("En Antigua no se cobra mensualidad.");
    const url = `${API_BASE}/pagos/mensualidad/pdf?sedeId=${encodeURIComponent(sedeId)}&anio=${encodeURIComponent(anio)}&mes=${encodeURIComponent(mesActivo)}`;
    window.open(url, "_blank");
  }

  // --------- Formularios (alumnos por sede)
  async function loadAlumnosForForms(){
    const sedeId = Number(byId("pgSede").value||1);
    const hoy = new Date().toISOString().slice(0,10);
    const r = await fetch(`${API_BASE}/asistencia/alumnos?sedeId=${encodeURIComponent(sedeId)}&fecha=${encodeURIComponent(hoy)}`).then(r=>r.json());
    const rows = (r.ok && Array.isArray(r.data)) ? r.data : [];
    alumnosCache = rows.map(a => ({ idPersonas: a.idPersonas, alumno: a.alumno }));

    const opts = alumnosCache.map(a => `<option value="${a.idPersonas}">${esc(a.alumno)}</option>`).join("");
    byId("exPersona").innerHTML = opts;
    byId("plPersona").innerHTML = opts;
    byId("unPersona").innerHTML = opts;
  }

  // --------- Exámenes
  async function loadExamenes(){
    const sedeId = Number(byId("pgSede").value||1);
    const desde = byId("exDesde").value; const hasta = byId("exHasta").value;
    const j = await fetch(`${API_BASE}/pagos/examenes?sedeId=${sedeId}&desde=${desde}&hasta=${hasta}`).then(r=>r.json());
    const tb = byId("exBody"); const rows = j.data||[];
    if (!rows.length){ tb.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Sin registros</td></tr>`; return; }
    tb.innerHTML = rows.map(r=>`
      <tr>
        <td>${esc(r.Fecha)}</td>
        <td>${esc(r.alumno)}</td>
        <td>Q.${Number(r.Monto).toFixed(2)}</td>
        <td>${esc(r.Descripcion||"")}</td>
        <td>${r.Estado?'<span class="badge bg-success">Pagado</span>':'<span class="badge bg-secondary">Pendiente</span>'}</td>
      </tr>
    `).join("");
  }
  async function crearExamen(){
    const payload = {
      personaId: Number(byId("exPersona").value),
      fecha: byId("exFecha").value,
      monto: Number(byId("exMonto").value||0),
      descripcion: byId("exDesc").value,
      estado: byId("exEstado").checked ? 1 : 0
    };
    if (!payload.personaId || !payload.fecha || !payload.monto) return alert("Completa persona, fecha y monto.");
    const r = await fetch(`${API_BASE}/pagos/examenes/registrar`,{
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    const j = await r.json(); if (!j.ok) return alert(j.msg||"Error registrando examen");
    await loadExamenes();
  }

  // --------- Playeras
  async function loadPlayeras(){
    const sedeId = Number(byId("pgSede").value||1);
    const desde = byId("plDesde").value; const hasta = byId("plHasta").value;
    const j = await fetch(`${API_BASE}/pagos/playeras?sedeId=${sedeId}&desde=${desde}&hasta=${hasta}`).then(r=>r.json());
    const tb = byId("plBody"); const rows = j.data||[];
    if (!rows.length){ tb.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Sin registros</td></tr>`; return; }
    tb.innerHTML = rows.map(r=>`
      <tr>
        <td>${esc(r.Fecha)}</td>
        <td>${esc(r.alumno)}</td>
        <td>${esc(r.Descripcion||'-')}</td>
        <td>${esc(r.Medida||'-')}</td>
        <td>${Number(r.Cantidad||1)}</td>
        <td>Q.${Number(r.Monto).toFixed(2)}</td>
        <td>${r.Estado?'<span class="badge bg-success">Pagado</span>':'<span class="badge bg-secondary">Pendiente</span>'}</td>
      </tr>
    `).join("");
  }
  async function crearPlayera(){
    const payload = {
      personaId: Number(byId("plPersona").value),
      fecha: byId("plFecha").value,
      idPlayera: Number(byId("plItem").value),
      cantidad: Number(byId("plCant").value||1),
      estado: byId("plEstado").checked ? 1 : 0
    };
    if (!payload.personaId || !payload.fecha || !payload.idPlayera) return alert("Completa persona, fecha y playera.");
    const r = await fetch(`${API_BASE}/pagos/playeras/registrar`,{
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    const j = await r.json(); if (!j.ok) return alert(j.msg||"Error registrando playera");
    await loadPlayeras();
  }

  // --------- Uniformes
  async function loadUniformes(){
    const sedeId = Number(byId("pgSede").value||1);
    const desde = byId("unDesde").value; const hasta = byId("unHasta").value;
    const j = await fetch(`${API_BASE}/pagos/uniformes?sedeId=${sedeId}&desde=${desde}&hasta=${hasta}`).then(r=>r.json());
    const tb = byId("unBody"); const rows = j.data||[];
    if (!rows.length){ tb.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Sin registros</td></tr>`; return; }
    tb.innerHTML = rows.map(r=>`
      <tr>
        <td>${esc(r.Fecha)}</td>
        <td>${esc(r.alumno)}</td>
        <td>${esc(r.Detalle||'-')}</td>
        <td>Q.${Number(r.Monto).toFixed(2)}</td>
        <td>${r.Estado?'<span class="badge bg-success">Pagado</span>':'<span class="badge bg-secondary">Pendiente</span>'}</td>
      </tr>
    `).join("");
  }
  async function crearUniforme(){
    const payload = {
      personaId: Number(byId("unPersona").value),
      fecha: byId("unFecha").value,
      monto: Number(byId("unMonto").value||0),
      detalle: byId("unDetalle").value,
      estado: byId("unEstado").checked ? 1 : 0
    };
    if (!payload.personaId || !payload.fecha || !payload.monto) return alert("Completa persona, fecha y monto.");
    const r = await fetch(`${API_BASE}/pagos/uniformes/registrar`,{
      method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload)
    });
    const j = await r.json(); if (!j.ok) return alert(j.msg||"Error registrando uniforme");
    await loadUniformes();
  }
}


function renderUsuarios(){
  // Seguridad UI (solo Admin ve Usuarios)
  if (user.rol !== "Administrador"){
    document.getElementById("content").innerHTML = `<div class="alert alert-warning m-0">No autorizado</div>`;
    return;
  }

  const esc = (s="") => String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const byId = (id)=>document.getElementById(id);

  document.getElementById("content").innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0">Usuarios</h4>
      <div class="d-flex flex-wrap gap-2">
        <input id="usSearch" class="form-control form-control-sm" placeholder="Buscar (email, nickname, nombre)">
        <select id="usSede" class="form-select form-select-sm" style="min-width:220px"></select>
        <select id="usRol" class="form-select form-select-sm" style="min-width:220px"></select>
        <select id="usAct" class="form-select form-select-sm" style="width:120px">
          <option value="">Todos</option>
          <option value="1" selected>Activos</option>
          <option value="0">Inactivos</option>
        </select>
        <button id="usRef" class="btn btn-sm btn-outline-secondary"><i class="bi bi-search"></i></button>
        <button id="usNew" class="btn btn-sm btn-primary"><i class="bi bi-person-plus-fill"></i> Nuevo</button>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th>ID</th><th>Email</th><th>Nickname</th><th>Rol</th><th>Sede</th><th>Estado</th><th style="width:220px;">Acciones</th>
          </tr>
        </thead>
        <tbody id="usBody"><tr><td colspan="7" class="text-center text-muted">—</td></tr></tbody>
      </table>
    </div>

    <!-- Modal Crear/Editar -->
    <div class="modal fade" id="usModal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white py-2">
            <h5 class="modal-title" id="usTitle">Nuevo usuario</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-2">
              <div class="col-12"><div class="fw-semibold small text-muted">Datos de Persona</div></div>
              <div class="col-md-6"><input id="pPrimerNombre" class="form-control form-control-sm" placeholder="Primer nombre *"></div>
              <div class="col-md-6"><input id="pSegundoNombre" class="form-control form-control-sm" placeholder="Segundo nombre"></div>
              <div class="col-md-6"><input id="pPrimerApellido" class="form-control form-control-sm" placeholder="Primer apellido *"></div>
              <div class="col-md-6"><input id="pSegundoApellido" class="form-control form-control-sm" placeholder="Segundo apellido"></div>
              <div class="col-md-6"><input id="pTelefono" class="form-control form-control-sm" placeholder="Teléfono"></div>
              <div class="col-md-6"><input id="pEmergencia" class="form-control form-control-sm" placeholder="Persona emergencia"></div>
              <div class="col-md-6"><input id="pContacto" class="form-control form-control-sm" placeholder="Contacto emergencia"></div>
              <div class="col-md-3"><input id="pEdad" type="number" min="0" class="form-control form-control-sm" placeholder="Edad"></div>
              <div class="col-md-3"><input id="pFechaNac" type="date" class="form-control form-control-sm"></div>
              <div class="col-md-3"><input id="pAnioInicio" type="number" class="form-control form-control-sm" placeholder="Año inicio"></div>
              <div class="col-md-3"><select id="pGenero" class="form-select form-select-sm"></select></div>
              <div class="col-md-6"><select id="pSede" class="form-select form-select-sm"></select></div>

              <div class="col-12 mt-2"><div class="fw-semibold small text-muted">Usuario y Rol</div></div>
              <div class="col-md-6"><input id="uEmail" class="form-control form-control-sm" placeholder="Email *"></div>
              <div class="col-md-6"><input id="uNick" class="form-control form-control-sm" placeholder="Nickname *"></div>
              <div class="col-md-6"><input id="uPass" class="form-control form-control-sm" placeholder="Contraseña *"></div>
              <div class="col-md-6"><select id="uRol" class="form-select form-select-sm"></select></div>
              <div class="col-12">
                <div class="form-check form-switch mt-1">
                  <input class="form-check-input" type="checkbox" id="uActivo" checked>
                  <label class="form-check-label" for="uActivo">Activo</label>
                </div>
              </div>

              <input type="hidden" id="hidIdUsuario">
            </div>
          </div>
          <div class="modal-footer py-2">
            <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
            <button id="btnGuardarUsuario" class="btn btn-success btn-sm"><i class="bi bi-save2"></i> Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Estado UI
  let cacheCatalogos = { roles:[], sedes:[], generos:[] };
  let modal;
  const ensureModal = ()=>{
    if (modal) return modal;
    modal = new bootstrap.Modal(byId("usModal"));
    return modal;
  };

  // Eventos
  byId("usRef").addEventListener("click", loadUsuarios);
  byId("usNew").addEventListener("click", ()=> openModalNuevo());
  byId("btnGuardarUsuario").addEventListener("click", onGuardar);
  byId("usSearch").addEventListener("keydown", (e)=>{ if(e.key==="Enter") loadUsuarios(); });

  (async ()=>{
    await loadCatalogos();
    fillFiltros();
    await loadUsuarios();
  })();

  function authHeaders(){
    return { "Content-Type":"application/json", "Authorization": `Bearer ${token}` };
  }

  async function loadCatalogos(){
    const r = await fetch(`${API_BASE}/usuarios/catalogos`, { headers: authHeaders() });
    const j = await r.json();
    cacheCatalogos = j?.data || { roles:[], sedes:[], generos:[] };
    byId("uRol").innerHTML   = cacheCatalogos.roles.map(r=>`<option value="${r.idRoles}">${esc(r.Tipo_usuario)}</option>`).join("");
    byId("pSede").innerHTML  = cacheCatalogos.sedes.map(s=>`<option value="${s.idSedes}">${esc(s.Nombre)}</option>`).join("");
    byId("pGenero").innerHTML= cacheCatalogos.generos.map(g=>`<option value="${g.idGeneros}">${esc(g.Descripcion)}</option>`).join("");
  }

  function fillFiltros(){
    byId("usSede").innerHTML = `<option value="">Todas las sedes</option>` + cacheCatalogos.sedes.map(s=>`<option value="${s.idSedes}">${esc(s.Nombre)}</option>`).join("");
    byId("usRol").innerHTML  = `<option value="">Todos los roles</option>` + cacheCatalogos.roles.map(r=>`<option value="${r.idRoles}">${esc(r.Tipo_usuario)}</option>`).join("");
  }

  async function loadUsuarios(){
    const q = new URLSearchParams();
    const s = byId("usSearch").value.trim();
    const sedeId = byId("usSede").value;
    const rolId  = byId("usRol").value;
    const act    = byId("usAct").value;

    if (s) q.set("search", s);
    if (sedeId) q.set("sedeId", sedeId);
    if (rolId)  q.set("rolId",  rolId);
    if (act !== "") q.set("activos", act);

    const r = await fetch(`${API_BASE}/usuarios/listar?${q.toString()}`, { headers: authHeaders() });
    const j = await r.json();
    const tb = byId("usBody");
    const rows = j.ok ? (j.data||[]) : [];
    if (!rows.length){
      tb.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Sin resultados</td></tr>`;
      return;
    }

    tb.innerHTML = rows.map(r=>{
      const estado = Number(r.Activo)===1
        ? `<span class="badge bg-success">Activo</span>`
        : `<span class="badge bg-secondary">Inactivo</span>`;
      return `
        <tr>
          <td>${r.idUsuarios}</td>
          <td>${esc(r.email)}</td>
          <td>${esc(r.nickname)}</td>
          <td>${esc(r.rol?.Tipo_usuario||"")}</td>
          <td>${esc(r.persona?.SedeNombre||"")}</td>
          <td>${estado}</td>
          <td class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-primary" data-act="edit" data-id="${r.idUsuarios}"><i class="bi bi-pencil-square"></i></button>
            <button class="btn btn-sm btn-outline-warning" data-act="pass" data-id="${r.idUsuarios}"><i class="bi bi-key"></i></button>
            ${
              Number(r.Activo)===1
              ? `<button class="btn btn-sm btn-outline-secondary" data-act="toggle" data-id="${r.idUsuarios}" data-v="0"><i class="bi bi-person-dash"></i></button>`
              : `<button class="btn btn-sm btn-outline-success" data-act="toggle" data-id="${r.idUsuarios}" data-v="1"><i class="bi bi-person-check"></i></button>`
            }
          </td>
        </tr>
      `;
    }).join("");

    tb.querySelectorAll("button[data-act='edit']").forEach(b=> b.addEventListener("click", ()=> openModalEditar(Number(b.dataset.id))));
    tb.querySelectorAll("button[data-act='pass']").forEach(b=> b.addEventListener("click", ()=> cambiarPassword(Number(b.dataset.id))));
    tb.querySelectorAll("button[data-act='toggle']").forEach(b=> b.addEventListener("click", ()=> toggleActivo(Number(b.dataset.id), Number(b.dataset.v))));
  }

  function openModalNuevo(){
    byId("usTitle").textContent = "Nuevo usuario";
    byId("hidIdUsuario").value = "";
    ["pPrimerNombre","pSegundoNombre","pPrimerApellido","pSegundoApellido","pTelefono","pEmergencia","pContacto","pEdad","pFechaNac","pAnioInicio","uEmail","uNick","uPass"].forEach(id=> byId(id).value = "");
    byId("uActivo").checked = true;
    ensureModal().show();
  }

  async function openModalEditar(idUsuario){
    const r = await fetch(`${API_BASE}/usuarios/${idUsuario}`, { headers: authHeaders() });
    const j = await r.json();
    if (!j.ok) return alert(j.msg||"Error");

    const u = j.data;
    byId("usTitle").textContent = `Editar usuario #${u.idUsuarios}`;
    byId("hidIdUsuario").value = u.idUsuarios;

    byId("pPrimerNombre").value = u.persona.Primer_nombre || "";
    byId("pSegundoNombre").value = u.persona.Segundo_nombre || "";
    byId("pPrimerApellido").value = u.persona.Primer_apellido || "";
    byId("pSegundoApellido").value = u.persona.Segundo_apellido || "";
    byId("pTelefono").value = u.persona.Telefono || "";
    byId("pEmergencia").value = u.persona.Persona_emergencia || "";
    byId("pContacto").value = u.persona.Contacto_emergencia || "";
    byId("pEdad").value = u.persona.Edad || "";
    byId("pFechaNac").value = u.persona.Fecha_nac || "";
    byId("pAnioInicio").value = u.persona.Año_inicio || "";
    byId("pGenero").value = u.persona.Generos_idGeneros || "";
    byId("pSede").value = u.persona.Sedes_idSedes || "";

    byId("uEmail").value = u.email || "";
    byId("uNick").value = u.nickname || "";
    byId("uPass").value = ""; // no se muestra
    byId("uRol").value = u.rol.idRoles || "";
    byId("uActivo").checked = Number(u.Activo)===1;

    ensureModal().show();
  }

  async function onGuardar(){
    const payload = {
      persona: {
        Primer_nombre: byId("pPrimerNombre").value.trim(),
        Segundo_nombre: byId("pSegundoNombre").value.trim(),
        Primer_apellido: byId("pPrimerApellido").value.trim(),
        Segundo_apellido: byId("pSegundoApellido").value.trim(),
        Telefono: byId("pTelefono").value.trim(),
        Persona_emergencia: byId("pEmergencia").value.trim(),
        Contacto_emergencia: byId("pContacto").value.trim(),
        Edad: Number(byId("pEdad").value || 0),
        Fecha_nac: byId("pFechaNac").value || null,
        Año_inicio: Number(byId("pAnioInicio").value || 0),
        Sedes_idSedes: Number(byId("pSede").value),
        Generos_idGeneros: Number(byId("pGenero").value)
      },
      usuario: {
        email: byId("uEmail").value.trim(),
        nickname: byId("uNick").value.trim(),
        pasword: byId("uPass").value.trim(),
        Activo: byId("uActivo").checked ? 1 : 0
      },
      rolId: Number(byId("uRol").value)
    };

    const idUsuario = byId("hidIdUsuario").value;

    if (!payload.persona.Primer_nombre || !payload.persona.Primer_apellido || !payload.persona.Sedes_idSedes || !payload.persona.Generos_idGeneros) {
      return alert("Completa Persona: Primer nombre, Primer apellido, Sede, Género.");
    }

    if (!idUsuario) {
      if (!payload.usuario.email || !payload.usuario.nickname || !payload.usuario.pasword) {
        return alert("Completa email, nickname y contraseña.");
      }
      const r = await fetch(`${API_BASE}/usuarios/crear`, {
        method:"POST",
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if (!j.ok) return alert(j.msg || "Error creando usuario");
      ensureModal().hide();
      await loadUsuarios();
    } else {
      const putPayload = {
        persona: { ...payload.persona },
        usuario: { email: payload.usuario.email, nickname: payload.usuario.nickname, Activo: payload.usuario.Activo },
        rolId: payload.rolId
      };
      const r = await fetch(`${API_BASE}/usuarios/${idUsuario}`, {
        method:"PUT",
        headers: authHeaders(),
        body: JSON.stringify(putPayload)
      });
      const j = await r.json();
      if (!j.ok) return alert(j.msg || "Error actualizando usuario");
      ensureModal().hide();
      await loadUsuarios();
    }
  }

  async function cambiarPassword(idUsuario){
    const p = prompt("Nueva contraseña:");
    if (p===null) return;
    const pass = p.trim();
    if (!pass) return alert("Contraseña vacía.");
    const r = await fetch(`${API_BASE}/usuarios/${idUsuario}/password`, {
      method:"PUT",
      headers: authHeaders(),
      body: JSON.stringify({ pasword: pass })
    });
    const j = await r.json();
    if (!j.ok) return alert(j.msg || "Error actualizando contraseña");
    alert("Contraseña actualizada.");
  }

  async function toggleActivo(idUsuario, valor){
    const r = await fetch(`${API_BASE}/usuarios/${idUsuario}/activar`, {
      method:"PUT",
      headers: authHeaders(),
      body: JSON.stringify({ Activo: Number(valor) })
    });
    const j = await r.json();
    if (!j.ok) return alert(j.msg || "Error cambiando estado");
    await loadUsuarios();
  }
}




async function renderAlumnos(){
  const byId = (id)=>document.getElementById(id);
  const esc = (s="") => String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const headersAuth = { "Content-Type":"application/json", "Authorization": `Bearer ${localStorage.getItem("mtk_token")||""}` };
  const HOY = new Date().toISOString().slice(0,10);

  document.getElementById("content").innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="mb-0">Alumnos</h4>
      <div class="d-flex flex-wrap gap-2">
        <input id="alSearch" class="form-control form-control-sm" placeholder="Buscar (nombre, apellido)">
        <select id="alSede" class="form-select form-select-sm" style="min-width:220px"></select>
        <select id="alProg" class="form-select form-select-sm" style="min-width:220px"></select>
        <select id="alCinta" class="form-select form-select-sm" style="min-width:220px"></select>
        <input id="alEdadMin" type="number" class="form-control form-control-sm" style="width:110px" placeholder="Edad min">
        <input id="alEdadMax" type="number" class="form-control form-control-sm" style="width:110px" placeholder="Edad max">
        <button id="alRef" class="btn btn-sm btn-outline-secondary"><i class="bi bi-search"></i></button>
        <button id="alNew" class="btn btn-sm btn-primary"><i class="bi bi-person-plus-fill"></i> Nuevo</button>
      </div>
    </div>

    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead class="table-light">
          <tr>
            <th>ID</th><th>Nombre</th><th>Edad</th><th>Sede</th><th>Programa</th><th>Cinta</th><th style="width:340px;">Acciones</th>
          </tr>
        </thead>
        <tbody id="alBody"><tr><td colspan="7" class="text-center text-muted">—</td></tr></tbody>
      </table>
    </div>

    <!-- Modal Crear/Editar Alumno -->
    <div class="modal fade" id="alModal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white py-2">
            <h5 class="modal-title" id="alTitle">Nuevo alumno</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-2">
              <div class="col-12"><div class="fw-semibold small text-muted">Datos de Persona</div></div>
              <div class="col-md-6"><input id="aPrimerNombre" class="form-control form-control-sm" placeholder="Primer nombre *"></div>
              <div class="col-md-6"><input id="aSegundoNombre" class="form-control form-control-sm" placeholder="Segundo nombre"></div>
              <div class="col-md-6"><input id="aPrimerApellido" class="form-control form-control-sm" placeholder="Primer apellido *"></div>
              <div class="col-md-6"><input id="aSegundoApellido" class="form-control form-control-sm" placeholder="Segundo apellido"></div>
              <div class="col-md-6"><input id="aTelefono" class="form-control form-control-sm" placeholder="Teléfono"></div>
              <div class="col-md-6"><input id="aEmergencia" class="form-control form-control-sm" placeholder="Persona emergencia"></div>
              <div class="col-md-6"><input id="aContacto" class="form-control form-control-sm" placeholder="Contacto emergencia"></div>
              <div class="col-md-3"><input id="aEdad" type="number" min="0" class="form-control form-control-sm" placeholder="Edad"></div>
              <div class="col-md-3"><input id="aFechaNac" type="date" class="form-control form-control-sm"></div>
              <div class="col-md-3"><input id="aAnioInicio" type="number" class="form-control form-control-sm" placeholder="Año inicio"></div>
              <div class="col-md-3"><select id="aGenero" class="form-select form-select-sm"></select></div>
              <div class="col-md-6">
                <select id="aSede" class="form-select form-select-sm"></select>
                <div class="form-text">Selecciona la sede primero para ver horarios.</div>
              </div>
              <div class="col-12 small text-muted">* Campos obligatorios: Primer nombre, Primer apellido, Sede, Género.</div>
              <input type="hidden" id="aIdPersona">
            </div>

            <hr class="my-3">
            <div class="row g-2">
              <div class="col-12"><div class="fw-semibold small text-muted">Asignación inicial</div></div>
              <div class="col-md-4">
                <label class="form-label small mb-1">Programa</label>
                <select id="aPrograma" class="form-select form-select-sm"></select>
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1">Cinta (opcional)</label>
                <select id="aCintaIni" class="form-select form-select-sm"></select>
                <div class="form-text">Si no eliges, asigno la primera del programa (Blanca).</div>
              </div>
              <div class="col-md-4">
                <label class="form-label small mb-1">Día/Hora inicial <span class="text-danger">*</span></label>
                <select id="aHorario" class="form-select form-select-sm" required></select>
                <div id="aHorarioHelp" class="text-danger small d-none mt-1"><i class="bi bi-exclamation-triangle"></i> Debes seleccionar un horario.</div>
              </div>
            </div>

            <div id="editHorariosBox" class="d-none">
              <hr class="my-3">
              <div class="fw-semibold small text-muted mb-2">Horarios del alumno</div>
              <div class="row g-2 align-items-end">
                <div class="col-md-8">
                  <select id="hAddSel" class="form-select form-select-sm"></select>
                </div>
                <div class="col-md-4">
                  <button id="hAddBtn" class="btn btn-sm btn-outline-primary w-100"><i class="bi bi-plus-circle"></i> Agregar horario</button>
                </div>
              </div>
              <ul id="hList" class="list-group list-group-sm mt-2"></ul>
              <div class="form-text">Puedes agregar o quitar horarios del alumno.</div>
            </div>
          </div>
          <div class="modal-footer py-2">
            <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
            <button id="btnGuardarAlumno" class="btn btn-success btn-sm"><i class="bi bi-save2"></i> Guardar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Cinta -->
    <div class="modal fade" id="cintaModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-dark text-white py-2">
            <h6 class="modal-title">Asignar/Actualizar Cinta</h6>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="cintaPersonaId">
            <div class="mb-2">
              <label class="form-label small">Programa</label>
              <select id="cintaProg" class="form-select form-select-sm"></select>
            </div>
            <div>
              <label class="form-label small">Cinta</label>
              <select id="cintaSel" class="form-select form-select-sm"></select>
            </div>
          </div>
          <div class="modal-footer py-2">
            <button class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancelar</button>
            <button id="btnGuardarCinta" class="btn btn-success btn-sm"><i class="bi bi-check2-circle"></i> Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Estado
  let cache = { sedes:[], generos:[], programas:[], cintas:[] };
  let modalAlumno, modalCinta;
  let editHorarios = { personaId:null, sedeId:null, horariosDisponibles:[], horariosAsignados:[] };

  const ensureModalAlumno = ()=> (modalAlumno ||= new bootstrap.Modal(byId("alModal")));
  const ensureModalCinta  = ()=> (modalCinta  ||= new bootstrap.Modal(byId("cintaModal")));

  // Eventos
  byId("alRef").addEventListener("click", loadAlumnos);
  byId("alNew").addEventListener("click", ()=> openNuevo());
  byId("alSearch").addEventListener("keydown", (e)=>{ if (e.key==="Enter") loadAlumnos(); });
  byId("btnGuardarAlumno").addEventListener("click", onGuardarAlumno);
  byId("btnGuardarCinta").addEventListener("click", onGuardarCinta);

  // Carga inicial
  await loadCatalogos();
  fillFiltros();
  await loadAlumnos();

  // ---------- helpers UI ----------
  function fillFiltros(){
    byId("alSede").innerHTML = `<option value="">Todas las sedes</option>` + cache.sedes.map(s=>`<option value="${s.idSedes}">${esc(s.Nombre)}</option>`).join("");
    byId("alProg").innerHTML = `<option value="">Todos los programas</option>` + cache.programas.map(p=>`<option value="${p.idPrograma}">${esc(p.Descripcion)}</option>`).join("");
    byId("alCinta").innerHTML = `<option value="">Todas las cintas</option>` + cache.cintas.map(c=>`<option value="${c.idCinta}" data-prog="${c.Programa_idPrograma}">${esc(c.Color)}</option>`).join("");

    byId("alProg").addEventListener("change", ()=>{
      const progId = Number(byId("alProg").value||0);
      const opts = cache.cintas.filter(c => !progId || Number(c.Programa_idPrograma)===progId);
      byId("alCinta").innerHTML = `<option value="">Todas las cintas</option>` + opts.map(c=>`<option value="${c.idCinta}">${esc(c.Color)}</option>`).join("");
    });
  }

  async function loadCatalogos(){
    const j = await fetch(`${API_BASE}/alumnos/catalogos`, { headers: headersAuth }).then(r=>r.json());
    cache.sedes = j?.data?.sedes || [];
    cache.generos = j?.data?.generos || [];
    cache.programas = j?.data?.programas || [];
    cache.cintas = j?.data?.cintas || [];
  }

  function filtrosQuery(){
    const s = new URLSearchParams();
    const txt = byId("alSearch").value.trim();
    const sedeId = byId("alSede").value;
    const progId = byId("alProg").value;
    const cintaId = byId("alCinta").value;
    const eMin = byId("alEdadMin").value;
    const eMax = byId("alEdadMax").value;
    if (txt) s.set("q", txt);
    if (sedeId) s.set("sedeId", sedeId);
    if (progId) s.set("programaId", progId);
    if (cintaId) s.set("cintaId", cintaId);
    if (eMin) s.set("edadMin", eMin);
    if (eMax) s.set("edadMax", eMax);
    return s.toString();
  }

  async function loadAlumnos(){
    const q = filtrosQuery();
    const j = await fetch(`${API_BASE}/alumnos?${q}`, { headers: headersAuth }).then(r=>r.json());
    const rows = j.ok ? (j.data||[]) : [];
    const tb = byId("alBody");
    if (!rows.length){
      tb.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Sin resultados</td></tr>`;
      return;
    }
    tb.innerHTML = rows.map(r=>{
      const nombre = `${r.Primer_nombre} ${r.Segundo_nombre||""} ${r.Primer_apellido} ${r.Segundo_apellido||""}`.replace(/\s+/g,' ').trim();
      const prog = r.Programa || "-";
      const cinta = r.CintaColor || "-";
      return `
        <tr>
          <td>${r.idPersonas}</td>
          <td>${esc(nombre)}</td>
          <td>${Number(r.Edad||0)}</td>
          <td>${esc(r.Sede||"-")}</td>
          <td>${esc(prog)}</td>
          <td>${esc(cinta)}</td>
          <td class="d-flex flex-wrap gap-1">
            <button class="btn btn-sm btn-outline-primary" data-act="edit" data-id="${r.idPersonas}"><i class="bi bi-pencil-square"></i> Editar</button>
            <button class="btn btn-sm btn-outline-dark" data-act="cinta" data-id="${r.idPersonas}"><i class="bi bi-award-fill"></i> Cinta</button>
          </td>
        </tr>
      `;
    }).join("");

    tb.querySelectorAll("button[data-act='edit']").forEach(b=>{
      b.addEventListener("click", ()=> openEditar(Number(b.dataset.id)));
    });
    tb.querySelectorAll("button[data-act='cinta']").forEach(b=>{
      b.addEventListener("click", ()=> openCinta(Number(b.dataset.id)));
    });
  }

  // ---------- CRUD Alumno ----------
  function openNuevo(){
    byId("alTitle").textContent = "Nuevo alumno";
    byId("aIdPersona").value = "";
    ["aPrimerNombre","aSegundoNombre","aPrimerApellido","aSegundoApellido","aTelefono","aEmergencia","aContacto","aEdad","aFechaNac","aAnioInicio"].forEach(id=> byId(id).value = "");

    byId("aGenero").innerHTML = cache.generos.map(g=>`<option value="${g.idGeneros}">${esc(g.Descripcion)}</option>`).join("");
    byId("aSede").innerHTML   = cache.sedes.map(s=>`<option value="${s.idSedes}">${esc(s.Nombre)}</option>`).join("");

    byId("aPrograma").innerHTML = `<option value="">— elegir —</option>` + cache.programas.map(p=>`<option value="${p.idPrograma}">${esc(p.Descripcion)}</option>`).join("");
    byId("aCintaIni").innerHTML = `<option value="">(auto Blanca)</option>`;
    byId("aHorario").innerHTML  = `<option value="">(elige un horario)</option>`;
    byId("aHorarioHelp").classList.add("d-none");

    byId("aSede").addEventListener("change", fillHorariosIniciales);
    byId("aPrograma").addEventListener("change", ()=>{
      const pid = Number(byId("aPrograma").value||0);
      const opts = cache.cintas.filter(c => Number(c.Programa_idPrograma)===pid);
      byId("aCintaIni").innerHTML = `<option value="">(auto Blanca)</option>` + opts.map(c=>`<option value="${c.idCinta}">${esc(c.Color)}</option>`).join("");
    });

    fillHorariosIniciales();
    byId("editHorariosBox").classList.add("d-none");
    ensureModalAlumno().show();
  }

  async function fetchHorariosSede(sedeId){
    try {
      const r = await fetch(`${API_BASE}/alumnos/horarios?sedeId=${encodeURIComponent(sedeId)}`, { headers: headersAuth });
      if (!r.ok) return [];
      const j = await r.json();
      return j.ok ? (j.data||[]) : [];
    } catch { return []; }
  }
  async function fetchHorariosSedeFallbackAsistencia(sedeId){
    try {
      const r = await fetch(`${API_BASE}/asistencia/horarios?sedeId=${encodeURIComponent(sedeId)}&fecha=${encodeURIComponent(HOY)}`, { headers: headersAuth });
      if (!r.ok) return [];
      const j = await r.json();
      return j.ok ? (j.data||[]) : [];
    } catch { return []; }
  }

  async function fillHorariosIniciales(){
    const sedeId = Number(byId("aSede").value||0);
    const sel = byId("aHorario");
    if (!sedeId){ sel.innerHTML = `<option value="">(elige sede)</option>`; return; }
    sel.innerHTML = `<option value="">Cargando...</option>`;

    let ops = await fetchHorariosSede(sedeId);
    if (!ops.length) ops = await fetchHorariosSedeFallbackAsistencia(sedeId);

    sel.innerHTML = ops.length
      ? `<option value="">(elige un horario)</option>` + ops.map(o=>`<option value="${o.id}">${esc(o.label)}</option>`).join("")
      : `<option value="">(sin horarios para esta sede)</option>`;
  }

  async function openEditar(idPersona){
    const j = await fetch(`${API_BASE}/alumnos/${idPersona}`, { headers: headersAuth }).then(r=>r.json());
    if (!j.ok) return alert(j.msg||"Error");
    const p = j.data.persona;
    const horariosAsignados = j.data.horarios || [];

    byId("alTitle").textContent = `Editar alumno #${p.idPersonas}`;
    byId("aIdPersona").value = p.idPersonas;
    byId("aPrimerNombre").value = p.Primer_nombre || "";
    byId("aSegundoNombre").value = p.Segundo_nombre || "";
    byId("aPrimerApellido").value = p.Primer_apellido || "";
    byId("aSegundoApellido").value = p.Segundo_apellido || "";
    byId("aTelefono").value = p.Telefono || "";
    byId("aEmergencia").value = p.Persona_emergencia || "";
    byId("aContacto").value = p.Contacto_emergencia || "";
    byId("aEdad").value = p.Edad || "";
    byId("aFechaNac").value = p.Fecha_nac || "";
    byId("aAnioInicio").value = p.Año_inicio || "";

    byId("aGenero").innerHTML = cache.generos.map(g=>`<option value="${g.idGeneros}">${esc(g.Descripcion)}</option>`).join("");
    byId("aGenero").value = p.Generos_idGeneros || "";

    byId("aSede").innerHTML   = cache.sedes.map(s=>`<option value="${s.idSedes}">${esc(s.Nombre)}</option>`).join("");
    byId("aSede").value = p.Sedes_idSedes || "";
    byId("aSede").addEventListener("change", ()=> refreshHorariosDisponibles(p.idPersonas));

    byId("aPrograma").innerHTML = `<option value="">(sin cambio)</option>` + cache.programas.map(pg=>`<option value="${pg.idPrograma}">${esc(pg.Descripcion)}</option>`).join("");
    byId("aCintaIni").innerHTML = `<option value="">(sin cambio)</option>`;
    byId("aHorario").innerHTML  = `<option value="">(sin cambio)</option>`;
    byId("aHorarioHelp").classList.add("d-none");

    byId("editHorariosBox").classList.remove("d-none");
    editHorarios.personaId = p.idPersonas;
    editHorarios.sedeId = p.Sedes_idSedes;
    editHorarios.horariosAsignados = horariosAsignados;
    await refreshHorariosDisponibles(p.idPersonas);

    ensureModalAlumno().show();
  }

  async function refreshHorariosDisponibles(personaId){
    const sedeId = Number(byId("aSede").value||0);
    let disponibles = await fetchHorariosSede(sedeId);
    if (!disponibles.length) disponibles = await fetchHorariosSedeFallbackAsistencia(sedeId);
    editHorarios.horariosDisponibles = disponibles;

    byId("hAddSel").innerHTML = disponibles.map(o=>`<option value="${o.id}">${esc(o.label)}</option>`).join("");

    const ul = byId("hList");
    if (!editHorarios.horariosAsignados.length) {
      ul.innerHTML = `<li class="list-group-item small text-muted">Sin horarios asignados</li>`;
    } else {
      ul.innerHTML = editHorarios.horariosAsignados.map(h=>{
        const label = h.Dia
          ? `${h.Dia} ${String(h.Hora_inicio).slice(0,5)} - ${String(h.Hora_fin).slice(0,5)}`
          : `${String(h.Hora_inicio).slice(0,5)} - ${String(h.Hora_fin).slice(0,5)}`;
        return `
          <li class="list-group-item d-flex justify-content-between align-items-center">
            <span class="small">${esc(label)}</span>
            <button class="btn btn-xs btn-outline-danger" data-del="${h.horarioId}">
              <i class="bi bi-trash"></i>
            </button>
          </li>`;
      }).join("");
      ul.querySelectorAll("button[data-del]").forEach(btn=>{
        btn.addEventListener("click", async ()=>{
          const horarioId = Number(btn.getAttribute("data-del"));
          if (!confirm("Quitar este horario del alumno?")) return;
          const rr = await fetch(`${API_BASE}/alumnos/${personaId}/horarios/${horarioId}`, { method:"DELETE", headers: headersAuth });
          const jj = await rr.json();
          if (!jj.ok) return alert(jj.msg||"Error eliminando horario");
          editHorarios.horariosAsignados = editHorarios.horariosAsignados.filter(x=> Number(x.horarioId)!==horarioId );
          await refreshHorariosDisponibles(personaId);
        });
      });
    }

    byId("hAddBtn").onclick = async ()=>{
      const horarioId = Number(byId("hAddSel").value||0);
      if (!horarioId) return;
      const rr = await fetch(`${API_BASE}/alumnos/${personaId}/horarios`, { method:"POST", headers: headersAuth, body: JSON.stringify({ horarioId }) });
      const jj = await rr.json();
      if (!jj.ok) return alert(jj.msg||"Error agregando horario");
      const j2 = await fetch(`${API_BASE}/alumnos/${personaId}`, { headers: headersAuth }).then(r=>r.json());
      editHorarios.horariosAsignados = (j2.ok ? (j2.data?.horarios || []) : []);
      await refreshHorariosDisponibles(personaId);
    };
  }

  async function onGuardarAlumno(){
    const persona = {
      Primer_nombre: byId("aPrimerNombre").value.trim(),
      Segundo_nombre: byId("aSegundoNombre").value.trim(),
      Primer_apellido: byId("aPrimerApellido").value.trim(),
      Segundo_apellido: byId("aSegundoApellido").value.trim(),
      Telefono: byId("aTelefono").value.trim(),
      Persona_emergencia: byId("aEmergencia").value.trim(),
      Contacto_emergencia: byId("aContacto").value.trim(),
      Edad: Number(byId("aEdad").value || 0),
      Fecha_nac: byId("aFechaNac").value || null,
      Año_inicio: Number(byId("aAnioInicio").value || 0),
      Sedes_idSedes: Number(byId("aSede").value),
      Generos_idGeneros: Number(byId("aGenero").value),
      Ropa_personas_idRopa_personas: 1
    };
    if (!persona.Primer_nombre || !persona.Primer_apellido || !persona.Sedes_idSedes || !persona.Generos_idGeneros) {
      return alert("Completa: Primer nombre, Primer apellido, Sede, Género.");
    }

    const idPersona = byId("aIdPersona").value;

    if (!idPersona){
      const horarioIdVal = byId("aHorario").value;
      if (!horarioIdVal) {
        byId("aHorarioHelp").classList.remove("d-none");
        return;
      } else {
        byId("aHorarioHelp").classList.add("d-none");
      }

      const programaId = Number(byId("aPrograma").value || 0) || null;
      const cintaId    = Number(byId("aCintaIni").value || 0) || null;
      const horarioId  = Number(horarioIdVal);

      const payload = { persona, asignacion: { programaId, cintaId, horarioId } };
      const r = await fetch(`${API_BASE}/alumnos`, { method:"POST", headers: headersAuth, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j.ok) return alert(j.msg || "Error creando alumno con asignaciones");
      ensureModalAlumno().hide();
      await loadAlumnos();
    } else {
      const payload = { persona };
      const r = await fetch(`${API_BASE}/alumnos/${idPersona}`, { method:"PUT", headers: headersAuth, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!j.ok) return alert(j.msg || "Error actualizando alumno");
      ensureModalAlumno().hide();
      await loadAlumnos();
    }
  }

  // ---------- Cinta ----------
  function openCinta(idPersona){
    byId("cintaPersonaId").value = idPersona;
    byId("cintaProg").innerHTML = cache.programas.map(p=>`<option value="${p.idPrograma}">${esc(p.Descripcion)}</option>`).join("");
    const fillCintas = ()=>{
      const progId = Number(byId("cintaProg").value||0);
      const opts = cache.cintas.filter(c => Number(c.Programa_idPrograma)===progId);
      byId("cintaSel").innerHTML = opts.map(c=>`<option value="${c.idCinta}">${esc(c.Color)}</option>`).join("");
    };
    byId("cintaProg").onchange = fillCintas;
    fillCintas();
    ensureModalCinta().show();
  }

  async function onGuardarCinta(){
    const idPersona = Number(byId("cintaPersonaId").value);
    const cintaId = Number(byId("cintaSel").value);
    if (!idPersona || !cintaId) return alert("Selecciona programa y cinta.");
    const r = await fetch(`${API_BASE}/alumnos/${idPersona}/cinta`, {
      method:"PUT",
      headers: headersAuth,
      body: JSON.stringify({ cintaId })
    });
    const j = await r.json();
    if (!j.ok) return alert(j.msg || "Error guardando cinta");
    ensureModalCinta().hide();
    await loadAlumnos();
  }
}




// navegación
document.querySelectorAll(".nav .nav-link").forEach(a => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    activateLink(a);
    renderModulo(a.dataset.mod);
  });
});

