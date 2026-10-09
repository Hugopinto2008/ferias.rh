const STORAGE_KEY = `folga-pap-data-v1-${window.APP_USER.id}`;
const PEOPLE = [{
  id: String(window.APP_USER.id),
  name: window.APP_USER.name,
  role: window.APP_USER.role,
  title: window.APP_USER.role,
  department: window.APP_USER.department,
  initials: window.APP_USER.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
  color: "#dcebd9",
  balance: window.APP_USER.annualLeaveDays,
}];

function localISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localISO(date);
}

function makeSeed() {
  return {
    people: structuredClone(PEOPLE),
    requests: [],
    currentUserId: String(window.APP_USER.id),
    settings: { annualDays: 22, conflictLimit: 2, notifications: true },
  };
}

function readStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.people && saved.requests) return saved;
  } catch (error) { console.warn("Não foi possível carregar os dados guardados.", error); }
  const seed = makeSeed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

let state = readStore();
let currentView = "inicio";
let calendarDate = new Date();
let requestFilter = "Todos";
let searchTerm = "";
let toastTimeout;

const page = document.querySelector("#page-content");
const modalLayer = document.querySelector("#modal-layer");
const monthFormat = new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "long", year: "numeric" });
const personById = (id) => state.people.find((person) => String(person.id) === String(id));
const currentUser = () => personById(state.currentUserId) || state.people[0];
const isManager = () => ["Administrador", "Responsável"].includes(currentUser().role);
const initials = (name) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function dateAtNoon(value) {
  return new Date(`${value}T12:00:00`);
}

function businessDays(start, end) {
  let count = 0;
  const date = dateAtNoon(start);
  const last = dateAtNoon(end);
  while (date <= last) {
    if (date.getDay() !== 0 && date.getDay() !== 6) count += 1;
    date.setDate(date.getDate() + 1);
  }
  return count;
}

function personAvatar(person, extraClass = "") {
  return `<span class="person-avatar ${extraClass}" style="background:${person.color}">${escapeHtml(person.initials || initials(person.name))}</span>`;
}

function statusClass(status) {
  return status === "Aprovado" ? "status-approved" : status === "Pendente" ? "status-pending" : "status-rejected";
}

function setProfile() {
  const person = currentUser();
  document.querySelector("#profile-avatar").textContent = person.initials || initials(person.name);
  document.querySelector("#top-avatar").textContent = person.initials || initials(person.name);
  document.querySelector("#profile-name").textContent = person.name;
  document.querySelector("#profile-role").textContent = person.role;
  document.querySelector("#pending-count").textContent = state.requests.filter((request) => request.status === "Pendente" && (isManager() || request.userId === person.id)).length;
  document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("pt-PT", { weekday: "short", day: "numeric", month: "short" }).format(new Date());
}

function pageHeading(eyebrow, title, subtitle, button = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div>${button}</div>`;
}

function render() {
  setProfile();
  const canManage = currentUser().role === "Administrador";
  document.querySelector(".admin-label").hidden = !canManage;
  const adminNav = document.querySelector('.nav-item[data-view="administracao"]');
  if (adminNav) adminNav.hidden = !canManage;
  if (!canManage && currentView === "administracao") currentView = "inicio";
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === currentView));
  const activeNav = document.querySelector(`.nav-item[data-view="${currentView}"]`);
  document.querySelector("#breadcrumb-current").textContent = activeNav?.textContent.trim().replace(/\s+\d+$/, "") || "Visão geral";
  if (currentView === "calendario") page.innerHTML = renderCalendarPage();
  else if (currentView === "pedidos") page.innerHTML = renderRequestsPage();
  else if (currentView === "equipa") page.innerHTML = renderTeamPage();
  else if (currentView === "administracao") page.innerHTML = renderAdminPage();
  else page.innerHTML = renderOverview();
}

function renderOverview() {
  const person = currentUser();
  const myRequests = state.requests.filter((request) => request.userId === person.id);
  const usedDays = myRequests.filter((request) => request.status === "Aprovado" && dateAtNoon(request.start).getFullYear() === new Date().getFullYear()).reduce((total, request) => total + request.days, 0);
  const pending = state.requests.filter((request) => request.status === "Pendente" && (isManager() || request.userId === person.id));
  const upcoming = state.requests.filter((request) => request.status === "Aprovado" && request.end >= dateOffset(0)).sort((a, b) => a.start.localeCompare(b.start));
  const daysLeft = Math.max(0, person.balance - usedDays);
  const createButton = `<button class="primary-button" data-action="new-request"><span class="button-icon">＋</span>Novo pedido</button>`;
  return `${pageHeading("BEM-VINDO DE VOLTA", `Olá, ${escapeHtml(person.name.split(" ")[0])} 👋`, "Aqui está o resumo das férias da tua equipa.", createButton)}
    <section class="overview-grid">
      <article class="metric-card"><div class="metric-top">Os meus dias disponíveis <span class="metric-icon green">◷</span></div><div class="metric-value"><strong>${daysLeft}</strong><span>dias</span></div><div class="metric-foot">de ${person.balance} dias anuais</div></article>
      <article class="metric-card"><div class="metric-top">Pedidos pendentes <span class="metric-icon orange">◷</span></div><div class="metric-value"><strong>${pending.length}</strong><span>${pending.length === 1 ? "pedido" : "pedidos"}</span></div><div class="metric-foot">${isManager() ? "A aguardar a tua decisão" : "A aguardar aprovação"}</div></article>
      <article class="metric-card"><div class="metric-top">De férias este mês <span class="metric-icon yellow">▦</span></div><div class="metric-value"><strong>${countAwayThisMonth()}</strong><span>pessoas</span></div><div class="metric-foot">Na equipa Norte & Co.</div></article>
      <article class="metric-card"><div class="metric-top">Dias já utilizados <span class="metric-icon coral">↗</span></div><div class="metric-value"><strong>${usedDays}</strong><span>dias</span></div><div class="metric-foot"><b>${Math.max(0, person.balance - usedDays)} dias</b> ainda disponíveis</div></article>
    </section>
    <section class="dashboard-columns">
      <article class="panel"><div class="panel-header"><div><h2 class="panel-title">Calendário da equipa</h2><p class="panel-note">Férias planeadas para os próximos dias</p></div><button class="text-link" data-view="calendario">Ver calendário ↗</button></div>${renderMiniCalendar()}</article>
      <article class="panel team-panel"><div class="panel-header"><div><h2 class="panel-title">A equipa</h2><p class="panel-note">${state.people.length} colaboradores ativos</p></div><button class="text-link" data-view="equipa">Ver equipa ↗</button></div><div class="team-list">${renderUpcomingRows(upcoming.slice(0, 4))}</div><div class="team-progress"><span></span></div><div class="team-progress-label"><span>Planeamento de férias</span><span>${Math.min(100, Math.round((state.requests.filter((item) => item.status === "Aprovado").length / Math.max(1, state.people.length * 2)) * 100))}%</span></div></article>
    </section>
    <section class="panel activity-panel"><div class="panel-header"><div><h2 class="panel-title">Pedidos recentes</h2><p class="panel-note">Acompanha a atividade de férias da equipa</p></div><button class="text-link" data-view="pedidos">Todos os pedidos ↗</button></div><div class="activity-list">${renderActivity()}</div></section>`;
}

function countAwayThisMonth() {
  const now = new Date();
  return new Set(state.requests.filter((request) => request.status === "Aprovado" && new Date(request.start).getMonth() === now.getMonth() && new Date(request.start).getFullYear() === now.getFullYear()).map((request) => request.userId)).size;
}

function renderUpcomingRows(requests) {
  if (!requests.length) return `<div class="empty-state">Ainda não há férias aprovadas.</div>`;
  return requests.map((request) => {
    const person = personById(request.userId);
    if (!person) return "";
    return `<div class="team-row">${personAvatar(person)}<div class="person-copy"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.department)} · ${shortDate.format(dateAtNoon(request.start))}</small></div><span class="team-status ${statusClass(request.status)}">${request.status}</span></div>`;
  }).join("");
}

function renderActivity() {
  const latest = [...state.requests].sort((a, b) => b.created.localeCompare(a.created)).slice(0, 4);
  if (!latest.length) return `<div class="empty-state">Ainda não existem pedidos para mostrar.</div>`;
  return latest.map((request) => {
    const person = personById(request.userId);
    if (!person) return "";
    const text = request.status === "Pendente" ? "submeteu um pedido de férias" : request.status === "Aprovado" ? "tem férias aprovadas" : request.status === "Cancelado" ? "cancelou um pedido de férias" : "teve o pedido de férias recusado";
    return `<div class="activity-row"><span class="activity-marker">${request.status === "Pendente" ? "…" : request.status === "Aprovado" ? "✓" : "×"}</span><div class="activity-copy"><strong>${escapeHtml(person.name)}</strong> ${text}<br><span>${shortDate.format(dateAtNoon(request.start))} – ${shortDate.format(dateAtNoon(request.end))}</span></div><span class="activity-time">${relativeDate(request.created)}</span></div>`;
  }).join("");
}

function relativeDate(value) {
  const days = Math.round((dateAtNoon(value) - dateAtNoon(dateOffset(0))) / 86400000);
  if (days === 0) return "hoje";
  if (days === -1) return "ontem";
  return days < 0 ? `há ${Math.abs(days)} dias` : `daqui a ${days} dias`;
}

function monthStart(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }

function renderMiniCalendar() {
  const date = calendarDate;
  const month = date.getMonth();
  const year = date.getFullYear();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  let days = weekdays.map((day) => `<div class="calendar-weekday">${day}</div>`).join("");
  for (let index = 0; index < 35; index += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    const iso = localISO(current);
    const dayRequests = state.requests.filter((request) => ["Pendente", "Aprovado"].includes(request.status) && iso >= request.start && iso <= request.end);
    const dots = dayRequests.length ? `<span class="day-dots">${dayRequests.slice(0, 3).map(() => "<i></i>").join("")}</span>` : '<span class="day-dots"></span>';
    days += `<div class="calendar-day ${current.getMonth() !== month ? "outside" : ""} ${iso === dateOffset(0) ? "today" : ""}"><span>${current.getDate()}</span>${dots}</div>`;
  }
  return `<div class="calendar-toolbar"><span class="calendar-month">${monthFormat.format(date).replace(/^./, (letter) => letter.toUpperCase())}</span><div class="calendar-controls"><button data-action="mini-prev" aria-label="Mês anterior">‹</button><button data-action="mini-next" aria-label="Mês seguinte">›</button></div></div><div class="mini-calendar"><div class="calendar-grid">${days}</div></div>`;
}

function visibleRequests() {
  const user = currentUser();
  let requests = [...state.requests];
  if (!isManager()) requests = requests.filter((request) => request.userId === user.id);
  if (requestFilter !== "Todos") requests = requests.filter((request) => request.status === requestFilter);
  if (searchTerm) requests = requests.filter((request) => personById(request.userId)?.name.toLowerCase().includes(searchTerm.toLowerCase()));
  return requests.sort((a, b) => b.created.localeCompare(a.created));
}

function requestRows(requests) {
  if (!requests.length) return `<tr><td colspan="7"><div class="empty-state"><strong>Sem pedidos para mostrar</strong>Quando houver novidades, aparecem aqui.</div></td></tr>`;
  return requests.map((request) => {
    const person = personById(request.userId);
    if (!person) return "";
    const actions = request.status === "Pendente" && isManager() && request.userId !== currentUser().id ? `<div class="row-actions"><button class="small-action approve" data-action="approve" data-id="${request.id}">Aprovar</button><button class="small-action reject" data-action="reject" data-id="${request.id}">Rejeitar</button></div>` : request.status === "Pendente" && request.userId === currentUser().id ? `<button class="small-action reject" data-action="cancel" data-id="${request.id}">Cancelar</button>` : "—";
    return `<tr><td><div class="table-person">${personAvatar(person)}<span><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.department)}</small></span></div></td><td>${escapeHtml(request.type)}</td><td>${shortDate.format(dateAtNoon(request.start))} – ${shortDate.format(dateAtNoon(request.end))}</td><td>${request.days} ${request.days === 1 ? "dia" : "dias"}</td><td><span class="status-pill ${statusClass(request.status)}">${request.status}</span></td><td>${shortDate.format(dateAtNoon(request.created))}</td><td>${actions}</td></tr>`;
  }).join("");
}

function renderRequestsPage() {
  const heading = pageHeading("GESTÃO DE AUSÊNCIAS", "Pedidos de férias", isManager() ? "Consulta e gere os pedidos de toda a equipa." : "Consulta o estado dos teus pedidos de férias.", `<button class="primary-button" data-action="new-request"><span class="button-icon">＋</span>Novo pedido</button>`);
  return `${heading}<section class="view-panel"><div class="toolbar-row"><div class="toolbar-left"><label class="search-field"><span>⌕</span><input id="request-search" type="search" placeholder="Pesquisar colaborador" value="${escapeHtml(searchTerm)}" /></label></div><div class="toolbar-right"><select class="filter-select" id="status-filter" aria-label="Filtrar estado">${["Todos", "Pendente", "Aprovado", "Rejeitado", "Cancelado"].map((status) => `<option ${requestFilter === status ? "selected" : ""}>${status}</option>`).join("")}</select></div></div><article class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Colaborador</th><th>Tipo</th><th>Período</th><th>Duração</th><th>Estado</th><th>Submetido</th><th>Ações</th></tr></thead><tbody>${requestRows(visibleRequests())}</tbody></table></div></article></section>`;
}

function monthCells(date, full = false) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const cellCount = full ? 42 : 35;
  let markup = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => `<div class="calendar-weekday">${day}</div>`).join("");
  for (let index = 0; index < cellCount; index += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    const iso = localISO(current);
    const events = state.requests.filter((request) => ["Pendente", "Aprovado"].includes(request.status) && iso >= request.start && iso <= request.end);
    const chips = full ? events.slice(0, 2).map((request) => {
      const person = personById(request.userId);
      return person ? `<span class="event-chip ${request.status === "Pendente" ? "pending" : "approved"}">${escapeHtml(person.name.split(" ")[0])} · ${request.status === "Pendente" ? "Pendente" : "Férias"}</span>` : "";
    }).join("") : events.length ? `<span class="day-dots">${events.slice(0, 3).map(() => "<i></i>").join("")}</span>` : `<span class="day-dots"></span>`;
    markup += `<div class="calendar-day ${current.getMonth() !== month ? "outside" : ""} ${iso === dateOffset(0) ? "today" : ""}"><span>${current.getDate()}</span>${chips}</div>`;
  }
  return markup;
}

function renderCalendarPage() {
  const title = monthFormat.format(calendarDate).replace(/^./, (letter) => letter.toUpperCase());
  return `${pageHeading("PLANEAMENTO", "Calendário da equipa", "Visualiza as férias aprovadas e os pedidos pendentes.", `<button class="secondary-button" data-action="today"><span class="button-icon">◷</span>Hoje</button>`)}<div class="calendar-page-toolbar"><span class="calendar-month">${title}</span><div class="calendar-controls"><button data-action="calendar-prev" aria-label="Mês anterior">‹</button><button data-action="calendar-next" aria-label="Mês seguinte">›</button></div></div><section class="full-calendar"><div class="calendar-grid">${monthCells(calendarDate, true)}</div></section>`;
}

function renderTeamPage() {
  const people = state.people.filter((person) => !searchTerm || person.name.toLowerCase().includes(searchTerm.toLowerCase()) || person.department.toLowerCase().includes(searchTerm.toLowerCase()));
  const cards = people.map((person) => {
    const used = state.requests.filter((request) => request.userId === person.id && request.status === "Aprovado" && dateAtNoon(request.start).getFullYear() === new Date().getFullYear()).reduce((sum, request) => sum + request.days, 0);
    return `<article class="employee-card"><div class="employee-card-top">${personAvatar(person)}<span class="role-tag">${escapeHtml(person.role)}</span></div><h3>${escapeHtml(person.name)}</h3><p>${escapeHtml(person.title || person.department)} · ${escapeHtml(person.department)}</p><div class="employee-details"><span>Saldo disponível</span><strong>${Math.max(0, person.balance - used)} de ${person.balance} dias</strong></div></article>`;
  }).join("");
  const button = isManager() ? `<button class="primary-button" data-action="new-employee"><span class="button-icon">＋</span>Adicionar</button>` : "";
  return `${pageHeading("PESSOAS", "A tua equipa", `${state.people.length} colaboradores em ${new Set(state.people.map((person) => person.department)).size} departamentos.`, button)}<div class="toolbar-row"><label class="search-field"><span>⌕</span><input id="team-search" type="search" placeholder="Pesquisar pessoa ou departamento" value="${escapeHtml(searchTerm)}" /></label></div><section class="team-grid">${cards || `<div class="no-results">Não foram encontrados colaboradores.</div>`}</section>`;
}

function renderAdminPage() {
  const pendingCount = state.requests.filter((request) => request.status === "Pendente").length;
  return `${pageHeading("CONFIGURAÇÃO", "Administração", "Define as regras de férias e acompanha a atividade da empresa.")}<div class="settings-grid"><div><article class="panel settings-section"><h2 class="panel-title">Política de férias</h2><p class="panel-note">Regras aplicadas aos colaboradores da empresa.</p><div class="setting-line"><div><strong>Dias anuais por defeito</strong><small>Saldo atribuído a novos colaboradores</small></div><input class="setting-input" id="annual-days" type="number" min="1" max="60" value="${state.settings.annualDays}" /></div><div class="setting-line"><div><strong>Limite de ausências simultâneas</strong><small>Número máximo de pessoas de férias ao mesmo tempo</small></div><input class="setting-input" id="conflict-limit" type="number" min="1" max="20" value="${state.settings.conflictLimit}" /></div><div class="setting-line"><div><strong>Notificações no sistema</strong><small>Alertas para pedidos e decisões</small></div><input class="switch" id="notifications-setting" type="checkbox" ${state.settings.notifications ? "checked" : ""} /></div><button class="primary-button" data-action="save-settings">Guardar alterações</button></article><article class="panel settings-section"><h2 class="panel-title">Dados locais</h2><p class="panel-note">Este protótipo guarda os dados neste navegador.</p><div class="setting-line"><div><strong>Repor dados de demonstração</strong><small>Apaga as alterações e restaura os dados iniciais.</small></div><button class="danger-button" data-action="reset-data">Repor dados</button></div></article></div><aside><article class="panel settings-section"><h2 class="panel-title">Resumo da empresa</h2><div class="balance-stat"><strong>${state.people.length}</strong><span>colaboradores registados</span></div><div class="setting-line"><div><strong>Pedidos pendentes</strong><small>A aguardar decisão do responsável</small></div><span class="setting-value">${pendingCount}</span></div><div class="setting-line"><div><strong>Departamentos</strong><small>Equipas ativas</small></div><span class="setting-value">${new Set(state.people.map((person) => person.department)).size}</span></div></article></aside></div>`;
}

function openModal(title, subtitle, body, onSubmit) {
  modalLayer.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div><button class="modal-close" data-action="close-modal" aria-label="Fechar">×</button></header><form class="modal-form">${body}<div class="modal-footer"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button type="submit" class="primary-button">Guardar pedido</button></div></form></section>`;
  modalLayer.hidden = false;
  modalLayer.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  });
  modalLayer.addEventListener("click", closeOutsideModal, { once: true });
}

function closeOutsideModal(event) {
  if (event.target === modalLayer) closeModal();
}

function closeModal() {
  modalLayer.hidden = true;
  modalLayer.innerHTML = "";
}

function newRequestModal() {
  const person = currentUser();
  const departments = [...new Set(state.people.map((employee) => employee.department))];
  const overlapping = (userId, start, end) => {
    let maximum = 0;
    const date = dateAtNoon(start);
    const last = dateAtNoon(end);
    while (date <= last) {
      const day = date.toISOString().slice(0, 10);
      const peopleAway = new Set(state.requests.filter((request) => request.status === "Aprovado" && request.userId !== userId && request.start <= day && request.end >= day).map((request) => request.userId));
      maximum = Math.max(maximum, peopleAway.size);
      date.setDate(date.getDate() + 1);
    }
    return maximum;
  };
  openModal("Novo pedido de férias", "Escolhe as datas e envia o pedido para aprovação.", `<div class="form-field"><label for="request-person">Colaborador</label>${isManager() ? `<select class="form-control" name="userId" id="request-person">${state.people.map((employee) => `<option value="${employee.id}" ${employee.id === person.id ? "selected" : ""}>${escapeHtml(employee.name)} · ${escapeHtml(employee.department)}</option>`).join("")}</select>` : `<input type="hidden" name="userId" value="${person.id}" /><input class="form-control" value="${escapeHtml(person.name)}" disabled />`}</div><div class="form-row"><div class="form-field"><label for="request-start">Primeiro dia</label><input class="form-control" id="request-start" name="start" type="date" min="${dateOffset(0)}" required /></div><div class="form-field"><label for="request-end">Último dia</label><input class="form-control" id="request-end" name="end" type="date" min="${dateOffset(0)}" required /></div></div><div class="form-field"><label for="request-department">Tipo de ausência</label><select class="form-control" id="request-department" name="type"><option>Férias</option><option>Assunto pessoal</option></select></div><div class="form-field"><label for="request-note">Nota para o responsável <span style="font-weight:400;color:#969d93">(opcional)</span></label><textarea class="form-control" id="request-note" name="note" placeholder="Partilha algum detalhe útil..."></textarea></div><p class="form-hint" id="request-hint">Os dias de fim de semana não são descontados do saldo.</p>`, (form) => {
    const userId = form.get("userId");
    const start = form.get("start");
    const end = form.get("end");
    if (!start || !end || end < start) { showToast("Confirma as datas do pedido."); return; }
    const days = businessDays(start, end);
    if (!days) { showToast("O período tem de incluir pelo menos um dia útil."); return; }
    const employee = personById(userId);
    const used = state.requests.filter((request) => request.userId === userId && request.status === "Aprovado" && dateAtNoon(request.start).getFullYear() === new Date().getFullYear()).reduce((sum, request) => sum + request.days, 0);
    if (days > Math.max(0, employee.balance - used)) { showToast("O pedido excede o saldo de férias disponível."); return; }
    if (overlapping(userId, start, end) + 1 > state.settings.conflictLimit) { showToast("Aviso: há várias pessoas de férias neste período."); }
    state.requests.unshift({ id: `r-${Date.now()}`, userId, start, end, days, type: form.get("type"), status: "Pendente", note: form.get("note"), created: dateOffset(0) });
    save(); closeModal(); render(); showToast("Pedido enviado para aprovação.");
  });
  const startInput = modalLayer.querySelector("#request-start");
  const endInput = modalLayer.querySelector("#request-end");
  const updateHint = () => {
    if (startInput.value && endInput.value && endInput.value >= startInput.value) {
      const days = businessDays(startInput.value, endInput.value);
      modalLayer.querySelector("#request-hint").textContent = `${days} ${days === 1 ? "dia útil" : "dias úteis"} a descontar do saldo.`;
    }
  };
  startInput.addEventListener("change", () => { endInput.min = startInput.value; updateHint(); });
  endInput.addEventListener("change", updateHint);
}

function newEmployeeModal() {
  openModal("Adicionar colaborador", "Cria um novo perfil para a equipa.", `<div class="form-field"><label for="employee-name">Nome completo</label><input class="form-control" id="employee-name" name="name" required maxlength="60" /></div><div class="form-row"><div class="form-field"><label for="employee-role">Perfil</label><select class="form-control" id="employee-role" name="role"><option>Colaborador</option><option>Responsável</option></select></div><div class="form-field"><label for="employee-department">Departamento</label><input class="form-control" id="employee-department" name="department" required maxlength="40" /></div></div><div class="form-field"><label for="employee-title">Função</label><input class="form-control" id="employee-title" name="title" maxlength="50" placeholder="Ex.: Designer" /></div><div class="form-field"><label for="employee-balance">Dias anuais de férias</label><input class="form-control" id="employee-balance" name="balance" type="number" min="1" max="60" value="${state.settings.annualDays}" required /></div>`, (form) => {
    const name = String(form.get("name")).trim();
    const department = String(form.get("department")).trim();
    if (!name || !department) { showToast("Preenche o nome e o departamento."); return; }
    const palette = ["#e7e4f1", "#dcebd9", "#f5ddd0", "#d8e7eb", "#f3e3aa"];
    state.people.push({ id: `u-${Date.now()}`, name, role: form.get("role"), title: String(form.get("title")).trim() || "Colaborador", department, initials: initials(name), color: palette[state.people.length % palette.length], balance: Number(form.get("balance")) });
    save(); closeModal(); render(); showToast("Colaborador adicionado à equipa.");
  });
  modalLayer.querySelector(".modal-footer .primary-button").textContent = "Adicionar colaborador";
}

function showToast(message) {
  const region = document.querySelector("#toast-region");
  region.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { region.innerHTML = ""; }, 3200);
}

function changeRequest(id, status) {
  const request = state.requests.find((item) => item.id === id);
  if (!request) return;
  if (status === "Rejeitado" && !window.confirm("Queres rejeitar este pedido?")) return;
  request.status = status;
  save(); render();
  showToast(status === "Aprovado" ? "Pedido aprovado." : status === "Rejeitado" ? "Pedido rejeitado." : "Pedido cancelado.");
}

function toggleNotifications() {
  document.querySelector(".notification-popover")?.remove();
  const pending = state.requests.filter((request) => request.status === "Pendente" && (isManager() || request.userId === currentUser().id));
  const popover = document.createElement("div");
  popover.className = "notification-popover";
  popover.innerHTML = `<div class="popover-title">Notificações</div>${pending.length ? pending.slice(0, 4).map((request) => `<div class="popover-item"><span>●</span><div><strong>${escapeHtml(personById(request.userId)?.name || "Colaborador")}</strong> · pedido pendente<br><small>${shortDate.format(dateAtNoon(request.start))} – ${shortDate.format(dateAtNoon(request.end))}</small></div></div>`).join("") : `<div class="popover-item">Não tens notificações por ler.</div>`}`;
  document.body.append(popover);
  setTimeout(() => document.addEventListener("click", function closePopover(event) {
    if (!popover.contains(event.target) && !event.target.closest("#notification-button")) { popover.remove(); document.removeEventListener("click", closePopover); }
  }), 0);
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view]");
  if (nav) {
    currentView = nav.dataset.view;
    searchTerm = "";
    document.querySelector("#sidebar").classList.remove("open");
    render();
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action) {
    const { action: name, id } = action.dataset;
    if (name === "new-request") newRequestModal();
    else if (name === "new-employee") newEmployeeModal();
    else if (name === "close-modal") closeModal();
    else if (name === "approve") changeRequest(id, "Aprovado");
    else if (name === "reject") changeRequest(id, "Rejeitado");
    else if (name === "cancel") changeRequest(id, "Cancelado");
    else if (name === "calendar-prev" || name === "mini-prev") { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1); render(); }
    else if (name === "calendar-next" || name === "mini-next") { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1); render(); }
    else if (name === "today") { calendarDate = new Date(); render(); }
    else if (name === "save-settings") {
      state.settings.annualDays = Math.min(60, Math.max(1, Number(document.querySelector("#annual-days").value) || 22));
      state.settings.conflictLimit = Math.min(20, Math.max(1, Number(document.querySelector("#conflict-limit").value) || 2));
      state.settings.notifications = document.querySelector("#notifications-setting").checked;
      save(); render(); showToast("Definições guardadas.");
    } else if (name === "reset-data") {
      if (window.confirm("Esta ação apaga as alterações guardadas neste navegador. Continuar?")) { state = makeSeed(); save(); currentView = "inicio"; render(); showToast("Dados de demonstração repostos."); }
    }
  }
  if (event.target.closest("#notification-button")) toggleNotifications();
  if (event.target.closest("#mobile-menu")) document.querySelector("#sidebar").classList.toggle("open");
});

document.addEventListener("input", (event) => {
  if (event.target.id === "request-search" || event.target.id === "team-search") {
    const selection = event.target.selectionStart;
    searchTerm = event.target.value;
    render();
    const replacement = document.querySelector(`#${event.target.id}`);
    replacement?.focus();
    replacement?.setSelectionRange(selection, selection);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.id === "status-filter") { requestFilter = event.target.value; render(); }
});

render();