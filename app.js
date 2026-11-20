const STORAGE_KEY = "folga-pap-data-v2";
const LEGACY_STORAGE_PREFIX = "folga-pap-data-v1-";
const PEOPLE = [{
  id: String(window.APP_USER.id),
  name: window.APP_USER.name,
  role: window.APP_USER.role,
  title: window.APP_USER.role,
  department: window.APP_USER.department,
  initials: window.APP_USER.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
  color: "#dcebd9",
  balance: window.APP_USER.annualLeaveDays,
  hireDate: window.APP_USER.hireDate || "2025-01-01",
  isActive: window.APP_USER.isActive !== false,
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
    settings: { annualDays: 22, conflictLimit: 2, notifications: true, companyName: "Nexona Area", planName: "Plano Equipa" },
  };
}

function readStore() {
  const seed = makeSeed();
  const savedStores = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(LEGACY_STORAGE_PREFIX)) continue;
      const legacy = JSON.parse(localStorage.getItem(key));
      if (legacy?.people && legacy?.requests) savedStores.push(legacy);
    }
    const shared = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (shared?.people && shared?.requests) savedStores.push(shared);
  } catch (error) { console.warn("Não foi possível carregar os dados guardados.", error); }
  if (!savedStores.length) return seed;

  const people = new Map();
  const requests = new Map();
  savedStores.forEach((saved) => {
    saved.people.forEach((person) => people.set(String(person.id), person));
    saved.requests.forEach((request) => requests.set(String(request.id), request));
  });
  const profile = PEOPLE[0];
  const existingProfile = people.get(String(profile.id));
  people.set(String(profile.id), { ...existingProfile, ...profile, color: existingProfile?.color || profile.color });
  seed.people = [...people.values()];
  seed.requests = [...requests.values()];
  seed.settings = savedStores[0].settings || seed.settings;
  return seed;
}

let state = readStore();
save();
const backend = window.FOLGA_SUPABASE;
const isDemoSession = String(window.APP_USER.id).startsWith("demo-");
let currentView = "inicio";
let calendarDate = new Date();
let requestFilter = "Todos";
let searchTerm = "";
let calendarDepartment = "Todos";
let windowAudit = [];
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

async function syncBackendData() {
  if (!backend || isDemoSession) return;
  try {
    const [{ data: profiles }, { data: requests }, { data: notifications }, { data: audit }, { data: company }] = await Promise.all([
      backend.from("profiles").select("id, full_name, role, department, job_title, hire_date, annual_leave_days, is_active, email_notifications, in_app_notifications"),
      backend.from("leave_requests").select("id, user_id, start_date, end_date, days_count, absence_type, note, status, decision_note, created_at"),
      backend.from("notifications").select("id, title, message, read_at, created_at").order("created_at", { ascending: false }).limit(20),
      backend.from("leave_audit").select("request_id, actor_id, action, note, created_at").order("created_at", { ascending: false }).limit(100),
      backend.from("company_settings").select("company_name, plan_name, annual_days, conflict_limit, notifications_enabled").eq("id", 1).maybeSingle(),
    ]);
    if (profiles?.length) {
      const palette = ["#e7e4f1", "#dcebd9", "#f5ddd0", "#d8e7eb", "#f3e3aa"];
      state.people = profiles.map((profile, index) => ({
        id: String(profile.id), name: profile.full_name, role: profile.role,
        title: profile.job_title || "Colaborador", department: profile.department,
        initials: initials(profile.full_name), color: palette[index % palette.length],
        balance: profile.annual_leave_days, hireDate: profile.hire_date, isActive: profile.is_active,
        emailNotifications: profile.email_notifications, inAppNotifications: profile.in_app_notifications,
      }));
      state.currentUserId = String(window.APP_USER.id);
    }
    if (requests) {
      state.requests = requests.map((request) => ({
        id: request.id, userId: request.user_id, start: request.start_date, end: request.end_date,
        days: request.days_count, type: request.absence_type, status: request.status,
        note: request.note, created: request.created_at.slice(0, 10), decisionNote: request.decision_note,
      }));
    }
    if (company) {
      state.settings = {
        ...state.settings,
        annualDays: company.annual_days,
        conflictLimit: company.conflict_limit,
        notifications: company.notifications_enabled,
        companyName: company.company_name,
        planName: company.plan_name,
      };
    }
    window.FOLGA_NOTIFICATIONS = notifications || [];
    windowAudit = audit || [];
  } catch (error) { console.warn("Não foi possível sincronizar dados do Supabase.", error); }
  render();
}

async function syncBackendRequest(request) {
  if (!backend || isDemoSession) return;
  const payload = {
    user_id: request.userId, start_date: request.start, end_date: request.end,
    days_count: request.days, absence_type: request.type, note: request.note,
  };
  const { data, error } = await backend.from("leave_requests").insert(payload).select("id").single();
  if (error) throw error;
  request.id = data.id;
}

async function syncBackendDecision(id, status, decisionNote = "") {
  if (!backend || isDemoSession) return;
  const { error } = await backend.from("leave_requests").update({
    status,
    decision_note: decisionNote || null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function dateAtNoon(value) {
  return new Date(`${value}T12:00:00`);
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 12);
}

function portugueseHolidays(year) {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const corpusChristi = new Date(easter);
  corpusChristi.setDate(easter.getDate() + 60);
  const fixed = [
    [1, 1], [4, 25], [5, 1], [6, 10], [8, 15],
    [10, 5], [11, 1], [12, 1], [12, 8], [12, 25],
  ];
  const holidays = new Set(fixed.map(([month, day]) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`));
  [goodFriday, easter, corpusChristi].forEach((date) => holidays.add(localISO(date)));
  return holidays;
}

function businessDays(start, end) {
  let count = 0;
  const date = dateAtNoon(start);
  const last = dateAtNoon(end);
  const holidays = portugueseHolidays(date.getFullYear());
  if (last.getFullYear() !== date.getFullYear()) {
    for (let year = date.getFullYear(); year <= last.getFullYear(); year += 1) {
      portugueseHolidays(year).forEach((holiday) => holidays.add(holiday));
    }
  }
  while (date <= last) {
    const iso = localISO(date);
    if (date.getDay() !== 0 && date.getDay() !== 6 && !holidays.has(iso)) count += 1;
    date.setDate(date.getDate() + 1);
  }
  return count;
}

function annualLeaveEntitlement(person, year = new Date().getFullYear()) {
  if (!person?.hireDate) return Math.max(22, Number(person?.balance) || 22);
  const hireDate = dateAtNoon(person.hireDate);
  if (hireDate.getFullYear() > year) return 0;
  if (hireDate.getFullYear() < year) return Math.max(22, Number(person?.balance) || 22);
  let completeMonths = (year - hireDate.getFullYear()) * 12 + (12 - hireDate.getMonth());
  if (hireDate.getDate() > 1) completeMonths -= 1;
  completeMonths = Math.max(0, Math.min(12, completeMonths));
  return Math.min(20, completeMonths * 2);
}

function personAvatar(person, extraClass = "") {
  return `<span class="person-avatar ${extraClass}" style="background:${person.color}">${escapeHtml(person.initials || initials(person.name))}</span>`;
}

function statusClass(status) {
  return status === "Aprovado" ? "status-approved" : status === "Pendente" ? "status-pending" : "status-rejected";
}

function companyName() {
  return state.settings.companyName || "Nexona Area";
}

function toggleWorkspaceMenu() {
  document.querySelector(".workspace-popover")?.remove();
  const popover = document.createElement("div");
  popover.className = "workspace-popover";
  const targetOptions = isManager()
    ? `<button type="button" data-action="workspace-admin"><strong>Configurações da empresa</strong><small>Alterar nome, plano e regras</small></button>`
    : `<button type="button" data-view="equipa"><strong>O meu perfil</strong><small>Consultar saldo e dados pessoais</small></button>`;
  popover.innerHTML = `<div class="popover-title">Espaço de trabalho</div><div class="workspace-summary"><strong>${escapeHtml(companyName())}</strong><span>${escapeHtml(state.settings.planName || "Plano Equipa")}</span></div>${targetOptions}<button type="button" data-view="calendario"><strong>Calendário</strong><small>${isManager() ? "Ver planeamento da equipa" : "Ver os meus períodos de férias"}</small></button>`;
  document.body.append(popover);
  setTimeout(() => document.addEventListener("click", function closeWorkspace(event) {
    if (!popover.contains(event.target) && !event.target.closest("[data-action='open-workspace']")) {
      popover.remove();
      document.removeEventListener("click", closeWorkspace);
    }
  }), 0);
}

function setProfile() {
  const person = currentUser();
  const workspaceAvatar = document.querySelector("#workspace-avatar");
  if (workspaceAvatar) workspaceAvatar.textContent = companyName().trim().charAt(0).toUpperCase();
  const workspaceName = document.querySelector("#workspace-name");
  if (workspaceName) workspaceName.textContent = companyName();
  const workspacePlan = document.querySelector("#workspace-plan");
  if (workspacePlan) workspacePlan.textContent = state.settings.planName || "Plano Equipa";
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
  else if (currentView === "relatorios") page.innerHTML = renderReportsPage();
  else if (currentView === "pedidos") page.innerHTML = renderRequestsPage();
  else if (currentView === "equipa") page.innerHTML = renderTeamPage();
  else if (currentView === "administracao") page.innerHTML = renderAdminPage();
  else page.innerHTML = renderOverview();
}

function renderOverview() {
  const person = currentUser();
  const myRequests = state.requests.filter((request) => String(request.userId) === String(person.id));
  const usedDays = myRequests.filter((request) => request.status === "Aprovado" && dateAtNoon(request.start).getFullYear() === new Date().getFullYear()).reduce((total, request) => total + request.days, 0);
  const scopedRequests = isManager() ? state.requests : myRequests;
  const pending = scopedRequests.filter((request) => request.status === "Pendente");
  const upcoming = scopedRequests.filter((request) => request.status === "Aprovado" && request.end >= dateOffset(0)).sort((a, b) => a.start.localeCompare(b.start));
  const annualEntitlement = annualLeaveEntitlement(person);
  const daysLeft = Math.max(0, annualEntitlement - usedDays);
  const createButton = `<button class="primary-button" data-action="new-request"><span class="button-icon">＋</span>Novo pedido</button>`;
  if (!isManager()) {
    const nextHoliday = upcoming[0];
    const daysUntilNext = nextHoliday ? Math.max(0, Math.ceil((dateAtNoon(nextHoliday.start) - dateAtNoon(dateOffset(0))) / 86400000)) : null;
    return `${pageHeading("ESPAÇO PESSOAL", `Olá, ${escapeHtml(person.name.split(" ")[0])}`, "Acompanha o teu saldo e os teus pedidos de férias.", createButton)}
      <section class="overview-grid">
        <article class="metric-card"><div class="metric-top">Saldo disponível <span class="metric-icon green">◷</span></div><div class="metric-value"><strong>${daysLeft}</strong><span>dias</span></div><div class="metric-foot">de ${annualEntitlement} dias anuais</div></article>
        <article class="metric-card"><div class="metric-top">Os meus pedidos pendentes <span class="metric-icon orange">◷</span></div><div class="metric-value"><strong>${pending.length}</strong><span>${pending.length === 1 ? "pedido" : "pedidos"}</span></div><div class="metric-foot">A aguardar decisão do administrador</div></article>
        <article class="metric-card"><div class="metric-top">Dias utilizados <span class="metric-icon coral">↗</span></div><div class="metric-value"><strong>${usedDays}</strong><span>dias</span></div><div class="metric-foot">Neste ano</div></article>
        <article class="metric-card"><div class="metric-top">Próximas férias <span class="metric-icon yellow">▦</span></div><div class="metric-value"><strong>${daysUntilNext ?? "—"}</strong><span>${daysUntilNext === null ? "sem data" : daysUntilNext === 1 ? "dia" : "dias"}</span></div><div class="metric-foot">${nextHoliday ? `${shortDate.format(dateAtNoon(nextHoliday.start))} – ${shortDate.format(dateAtNoon(nextHoliday.end))}` : "Ainda sem férias aprovadas"}</div></article>
      </section>
      <section class="dashboard-columns">
        <article class="panel"><div class="panel-header"><div><h2 class="panel-title">O meu calendário</h2><p class="panel-note">Os teus pedidos e férias aprovadas</p></div><button class="text-link" data-view="calendario">Abrir calendário ↗</button></div>${renderMiniCalendar()}</article>
        <article class="panel team-panel"><div class="panel-header"><div><h2 class="panel-title">Próximas férias</h2><p class="panel-note">Os teus períodos aprovados</p></div><button class="text-link" data-view="pedidos">Os meus pedidos ↗</button></div><div class="team-list">${renderUpcomingRows(upcoming.slice(0, 4))}</div></article>
      </section>
      <section class="panel activity-panel"><div class="panel-header"><div><h2 class="panel-title">Atividade dos meus pedidos</h2><p class="panel-note">Acompanha as alterações recentes</p></div><button class="text-link" data-view="pedidos">Ver pedidos ↗</button></div><div class="activity-list">${renderActivity()}</div></section>`;
  }
  const companyUsedDays = state.requests.filter((request) => request.status === "Aprovado" && dateAtNoon(request.start).getFullYear() === new Date().getFullYear()).reduce((total, request) => total + request.days, 0);
  return `${pageHeading("BEM-VINDO DE VOLTA", `Olá, ${escapeHtml(person.name.split(" ")[0])} 👋`, "Aqui está o resumo das férias da tua equipa.", createButton)}
    <section class="overview-grid">
      <article class="metric-card"><div class="metric-top">Colaboradores ativos <span class="metric-icon green">♧</span></div><div class="metric-value"><strong>${state.people.filter((employee) => employee.isActive !== false).length}</strong><span>pessoas</span></div><div class="metric-foot">Registadas na equipa</div></article>
      <article class="metric-card"><div class="metric-top">Pedidos pendentes <span class="metric-icon orange">◷</span></div><div class="metric-value"><strong>${pending.length}</strong><span>${pending.length === 1 ? "pedido" : "pedidos"}</span></div><div class="metric-foot">${isManager() ? "A aguardar a tua decisão" : "A aguardar aprovação"}</div></article>
      <article class="metric-card"><div class="metric-top">De férias este mês <span class="metric-icon yellow">▦</span></div><div class="metric-value"><strong>${countAwayThisMonth()}</strong><span>pessoas</span></div><div class="metric-foot">Na equipa Nexona Area</div></article>
      <article class="metric-card"><div class="metric-top">Dias aprovados este ano <span class="metric-icon coral">↗</span></div><div class="metric-value"><strong>${companyUsedDays}</strong><span>dias</span></div><div class="metric-foot">Total da equipa</div></article>
    </section>
    <section class="dashboard-columns">
      <article class="panel"><div class="panel-header"><div><h2 class="panel-title">Calendário da equipa</h2><p class="panel-note">Férias planeadas para os próximos dias</p></div><button class="text-link" data-view="calendario">Ver calendário ↗</button></div>${renderMiniCalendar()}</article>
      <article class="panel team-panel"><div class="panel-header"><div><h2 class="panel-title">A equipa</h2><p class="panel-note">${state.people.length} colaboradores ativos</p></div><button class="text-link" data-view="equipa">Ver equipa ↗</button></div><div class="team-list">${renderUpcomingRows(upcoming.slice(0, 4))}</div><div class="team-progress"><span></span></div><div class="team-progress-label"><span>Planeamento de férias</span><span>${Math.min(100, Math.round((state.requests.filter((item) => item.status === "Aprovado").length / Math.max(1, state.people.length * 2)) * 100))}%</span></div></article>
    </section>
    <section class="panel activity-panel"><div class="panel-header"><div><h2 class="panel-title">Pedidos recentes</h2><p class="panel-note">Acompanha a atividade de férias da equipa</p></div><button class="text-link" data-view="pedidos">Todos os pedidos ↗</button></div><div class="activity-list">${renderActivity()}</div></section>`;
}

function countAwayThisMonth() {
  const now = new Date();
  const monthStartDate = localISO(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEndDate = localISO(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return new Set(state.requests.filter((request) => request.status === "Aprovado" && request.start <= monthEndDate && request.end >= monthStartDate).map((request) => request.userId)).size;
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
  const visible = isManager() ? state.requests : state.requests.filter((request) => String(request.userId) === String(currentUser().id));
  const latest = [...visible].sort((a, b) => b.created.localeCompare(a.created)).slice(0, 4);
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
    const dayRequests = state.requests.filter((request) => ["Pendente", "Aprovado"].includes(request.status) && iso >= request.start && iso <= request.end && (isManager() || String(request.userId) === String(currentUser().id)));
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

function printReport() {
  window.print();
}

function exportVisibleRequests() {
  const requests = visibleRequests();
  const csvRows = [["Colaborador", "Tipo", "Início", "Fim", "Dias", "Estado"], ...requests.map((request) => [
    personById(request.userId)?.name || "", request.type, request.start, request.end, request.days, request.status,
  ])];
  const csv = "\uFEFF" + csvRows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "pedidos-nexora.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Relatório exportado.");
}

function renderRequestsPage() {
  const headingActions = `<button class="secondary-button" data-action="export-requests">Exportar CSV</button><button class="secondary-button" data-action="print-report">Imprimir relatório</button><button class="primary-button" data-action="new-request"><span class="button-icon">＋</span>Novo pedido</button>`;
  const heading = pageHeading("GESTÃO DE AUSÊNCIAS", "Pedidos de férias", isManager() ? "Consulta e gere os pedidos de toda a equipa." : "Consulta o estado dos teus pedidos de férias.", headingActions);
  return `${heading}<section class="view-panel"><div class="toolbar-row"><div class="toolbar-left"><label class="search-field"><span>⌕</span><input id="request-search" type="search" placeholder="Pesquisar colaborador" value="${escapeHtml(searchTerm)}" /></label></div><div class="toolbar-right"><select class="filter-select" id="status-filter" aria-label="Filtrar estado">${["Todos", "Pendente", "Aprovado", "Rejeitado", "Cancelado"].map((status) => `<option ${requestFilter === status ? "selected" : ""}>${status}</option>`).join("")}</select></div></div><article class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Colaborador</th><th>Tipo</th><th>Período</th><th>Duração</th><th>Estado</th><th>Submetido</th><th>Ações</th></tr></thead><tbody>${requestRows(visibleRequests())}</tbody></table></div></article></section>`;
}

function filteredCalendarRequests() {
  return state.requests.filter((request) => {
    if (!isManager() && String(request.userId) !== String(currentUser().id)) return false;
    if (isManager() && calendarDepartment !== "Todos") {
      const person = personById(request.userId);
      if (person?.department !== calendarDepartment) return false;
    }
    return ["Pendente", "Aprovado"].includes(request.status);
  });
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
    const events = filteredCalendarRequests().filter((request) => iso >= request.start && iso <= request.end);
    const chips = full ? events.slice(0, 2).map((request) => {
      const person = personById(request.userId);
      return person ? `<span class="event-chip ${request.status === "Pendente" ? "pending" : "approved"}">${escapeHtml(person.name.split(" ")[0])} · ${request.status === "Pendente" ? "Pendente" : "Férias"}</span>` : "";
    }).join("") + (events.length > 2 ? `<span class="event-overflow">+${events.length - 2} mais</span>` : "") : events.length ? `<span class="day-dots">${events.slice(0, 3).map((request) => `<i class="${request.status === "Pendente" ? "pending" : "approved"}"></i>`).join("")}</span>` : `<span class="day-dots"></span>`;
    markup += `<div class="calendar-day ${current.getMonth() !== month ? "outside" : ""} ${iso === dateOffset(0) ? "today" : ""}"><span>${current.getDate()}</span>${chips}</div>`;
  }
  return markup;
}

function renderCalendarPage() {
  const title = monthFormat.format(calendarDate).replace(/^./, (letter) => letter.toUpperCase());
  const heading = isManager() ? ["PLANEAMENTO", "Calendário da equipa", "Visualiza as férias aprovadas e os pedidos pendentes da equipa."] : ["ESPAÇO PESSOAL", "O meu calendário", "Consulta apenas os teus pedidos e períodos de férias."];
  const departmentOptions = isManager() ? [`<select class="filter-select" id="calendar-department"><option>Todos</option>${[...new Set(state.people.map((person) => person.department))].map((department) => `<option ${calendarDepartment === department ? "selected" : ""}>${escapeHtml(department)}</option>`).join("")}</select>`] : [""];
  return `${pageHeading(heading[0], heading[1], heading[2], `<button class="secondary-button" data-action="today"><span class="button-icon">◷</span>Hoje</button>`)}${departmentOptions[0] ? `<div class="calendar-filter">${departmentOptions[0]}</div>` : ""}<div class="calendar-page-toolbar"><span class="calendar-month">${title}</span><div class="calendar-controls"><button data-action="calendar-prev" aria-label="Mês anterior">‹</button><button data-action="calendar-next" aria-label="Mês seguinte">›</button></div></div><section class="full-calendar"><div class="calendar-grid">${monthCells(calendarDate, true)}</div></section><div class="calendar-legend"><span><i class="legend-approved"></i>Férias aprovadas</span><span><i class="legend-pending"></i>Pedido pendente</span></div>`;
}

function renderReportsPage() {
  if (!isManager()) return renderOverview();
  const approved = state.requests.filter((request) => request.status === "Aprovado");
  const pending = state.requests.filter((request) => request.status === "Pendente");
  const rejected = state.requests.filter((request) => request.status === "Rejeitado");
  const totalPeople = state.people.length;
  const approvedDays = approved.reduce((sum, request) => sum + request.days, 0);
  const departmentRows = [...new Set(state.people.map((person) => person.department))].map((department) => {
    const people = state.people.filter((person) => person.department === department);
    const ids = new Set(people.map((person) => String(person.id)));
    const days = approved.filter((request) => ids.has(String(request.userId))).reduce((sum, request) => sum + request.days, 0);
    const percent = totalPeople ? Math.min(100, Math.round(days / Math.max(1, totalPeople * 22) * 100)) : 0;
    return `<div class="report-bar-row"><div class="report-bar-label"><strong>${escapeHtml(department)}</strong><span>${days} dias aprovados</span></div><div class="report-bar"><span style="width:${percent}%"></span></div></div>`;
  }).join("");
  return `${pageHeading("ANÁLISE", "Relatórios", "Indicadores de férias e atividade da equipa.", `<button class="secondary-button" data-action="export-requests">Exportar CSV</button>`)}<section class="overview-grid"><article class="metric-card"><div class="metric-top">Dias aprovados <span class="metric-icon green">↗</span></div><div class="metric-value"><strong>${approvedDays}</strong><span>dias</span></div></article><article class="metric-card"><div class="metric-top">Pedidos pendentes <span class="metric-icon orange">◷</span></div><div class="metric-value"><strong>${pending.length}</strong><span>pedidos</span></div></article><article class="metric-card"><div class="metric-top">Pedidos rejeitados <span class="metric-icon coral">×</span></div><div class="metric-value"><strong>${rejected.length}</strong><span>pedidos</span></div></article><article class="metric-card"><div class="metric-top">Colaboradores <span class="metric-icon yellow">♧</span></div><div class="metric-value"><strong>${totalPeople}</strong><span>ativos</span></div></article></section><section class="dashboard-columns"><article class="panel report-panel"><div class="panel-header"><div><h2 class="panel-title">Dias aprovados por departamento</h2><p class="panel-note">Distribuição anual das férias</p></div></div><div class="report-bars">${departmentRows || `<div class="empty-state">Sem dados suficientes.</div>`}</div></article><article class="panel report-panel"><div class="panel-header"><div><h2 class="panel-title">Estado dos pedidos</h2><p class="panel-note">Visão geral</p></div></div><div class="report-status"><div class="report-status-row"><span class="report-status-dot approved"></span><strong>Aprovados</strong><b>${approved.length}</b></div><div class="report-status-row"><span class="report-status-dot pending"></span><strong>Pendentes</strong><b>${pending.length}</b></div><div class="report-status-row"><span class="report-status-dot rejected"></span><strong>Rejeitados</strong><b>${rejected.length}</b></div></div></article></section><section class="panel audit-panel"><div class="panel-header"><div><h2 class="panel-title">Histórico de auditoria</h2><p class="panel-note">Últimas alterações nos pedidos</p></div></div><div class="activity-list">${renderAuditRows()}</div></section>`;
}

function renderAuditRows() {
  if (!windowAudit.length) return `<div class="empty-state">Ainda não existe histórico registado.</div>`;
  return windowAudit.slice(0, 8).map((entry) => {
    const actor = personById(entry.actor_id);
    const request = state.requests.find((item) => String(item.id) === String(entry.request_id));
    return `<div class="activity-row"><span class="activity-marker">${entry.action === "Aprovado" ? "✓" : entry.action === "Rejeitado" ? "×" : "·"}</span><div class="activity-copy"><strong>${escapeHtml(actor?.name || "Utilizador")}</strong> marcou como ${escapeHtml(entry.action.toLowerCase())}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}<br><span>${request ? `${shortDate.format(dateAtNoon(request.start))} – ${shortDate.format(dateAtNoon(request.end))}` : "Pedido"}</span></div><span class="activity-time">${relativeDate(entry.created_at.slice(0, 10))}</span></div>`;
  }).join("");
}

function renderTeamPage() {
  const visiblePeople = isManager() ? state.people : state.people.filter((person) => String(person.id) === String(currentUser().id));
  const people = visiblePeople.filter((person) => !searchTerm || person.name.toLowerCase().includes(searchTerm.toLowerCase()) || person.department.toLowerCase().includes(searchTerm.toLowerCase()));
  const cards = people.map((person) => {
    const used = state.requests.filter((request) => request.userId === person.id && request.status === "Aprovado" && dateAtNoon(request.start).getFullYear() === new Date().getFullYear()).reduce((sum, request) => sum + request.days, 0);
    const entitlement = annualLeaveEntitlement(person);
    const editButton = isManager() ? `<button class="text-link" data-action="edit-employee" data-id="${person.id}">Editar perfil ↗</button>` : "";
    return `<article class="employee-card ${person.isActive === false ? "employee-inactive" : ""}"><div class="employee-card-top">${personAvatar(person)}<span class="role-tag">${person.isActive === false ? "Inativo" : escapeHtml(person.role)}</span></div><h3>${escapeHtml(person.name)}</h3><p>${escapeHtml(person.title || person.department)} · ${escapeHtml(person.department)}</p><div class="employee-details"><span>Saldo disponível</span><strong>${Math.max(0, entitlement - used)} de ${entitlement} dias</strong></div>${editButton ? `<div class="employee-actions">${editButton}</div>` : ""}</article>`;
  }).join("");
  const button = isManager() ? `<button class="primary-button" data-action="new-employee"><span class="button-icon">＋</span>Adicionar</button>` : "";
  return `${pageHeading("PESSOAS", isManager() ? "A tua equipa" : "O meu perfil", isManager() ? `${state.people.length} colaboradores em ${new Set(state.people.map((person) => person.department)).size} departamentos.` : "Consulta o teu perfil e saldo de férias.", button)}${isManager() ? `<div class="toolbar-row"><label class="search-field"><span>⌕</span><input id="team-search" type="search" placeholder="Pesquisar pessoa ou departamento" value="${escapeHtml(searchTerm)}" /></label></div>` : ""}<section class="team-grid">${cards || `<div class="no-results">Não foram encontrados colaboradores.</div>`}</section>`;
}

function renderAdminPage() {
  if (!isManager()) return renderOverview();
  const pendingCount = state.requests.filter((request) => request.status === "Pendente").length;
  return `${pageHeading("CONFIGURAÇÃO", "Administração", "Define as regras de férias e acompanha a atividade da empresa.")}<div class="settings-grid"><div><article class="panel settings-section"><h2 class="panel-title">Política de férias</h2><p class="panel-note">Regras aplicadas aos colaboradores da empresa.</p><div class="setting-line"><div><strong>Nome da empresa</strong><small>Nome apresentado no espaço de trabalho</small></div><input class="setting-input setting-input-wide" id="company-name" type="text" maxlength="40" value="${escapeHtml(companyName())}" /></div><div class="setting-line"><div><strong>Nome do plano</strong><small>Descrição apresentada no seletor</small></div><input class="setting-input setting-input-wide" id="workspace-plan-name" type="text" maxlength="40" value="${escapeHtml(state.settings.planName || "Plano Equipa")}" /></div><div class="setting-line"><div><strong>Dias anuais por defeito</strong><small>Portugal continental: mínimo legal de 22 dias úteis</small></div><input class="setting-input" id="annual-days" type="number" min="22" max="60" value="${Math.max(22, state.settings.annualDays)}" /></div><div class="setting-line"><div><strong>Limite de ausências simultâneas</strong><small>Número máximo de pessoas de férias ao mesmo tempo</small></div><input class="setting-input" id="conflict-limit" type="number" min="1" max="20" value="${state.settings.conflictLimit}" /></div><div class="setting-line"><div><strong>Notificações no sistema</strong><small>Alertas para pedidos e decisões</small></div><label class="switch-control"><input class="switch" id="notifications-setting" type="checkbox" ${state.settings.notifications ? "checked" : ""} /><span>Ativado</span></label></div><div class="settings-actions"><button class="primary-button" data-action="save-settings">Guardar alterações</button></div></article><article class="panel settings-section"><h2 class="panel-title">Dados locais</h2><p class="panel-note">Este protótipo guarda os dados neste navegador.</p><div class="setting-line"><div><strong>Repor dados de demonstração</strong><small>Apaga as alterações e restaura os dados iniciais.</small></div><button class="danger-button" data-action="reset-data">Repor dados</button></div></article></div><aside><article class="panel settings-section"><h2 class="panel-title">Resumo da empresa</h2><div class="balance-stat"><strong>${state.people.length}</strong><span>colaboradores registados</span></div><div class="setting-line"><div><strong>Pedidos pendentes</strong><small>A aguardar decisão do responsável</small></div><span class="setting-value">${pendingCount}</span></div><div class="setting-line"><div><strong>Departamentos</strong><small>Equipas ativas</small></div><span class="setting-value">${new Set(state.people.map((person) => person.department)).size}</span></div></article></aside></div>`;
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
  openModal("Novo pedido de férias", "Escolhe as datas e envia o pedido para aprovação.", `<div class="form-field"><label for="request-person">Colaborador</label>${isManager() ? `<select class="form-control" name="userId" id="request-person">${state.people.map((employee) => `<option value="${employee.id}" ${employee.id === person.id ? "selected" : ""}>${escapeHtml(employee.name)} · ${escapeHtml(employee.department)}</option>`).join("")}</select>` : `<input type="hidden" name="userId" value="${person.id}" /><input class="form-control" value="${escapeHtml(person.name)}" disabled />`}</div><div class="form-row"><div class="form-field"><label for="request-start">Primeiro dia</label><input class="form-control" id="request-start" name="start" type="date" min="${dateOffset(0)}" required /></div><div class="form-field"><label for="request-end">Último dia</label><input class="form-control" id="request-end" name="end" type="date" min="${dateOffset(0)}" required /></div></div><div class="form-field"><label for="request-department">Tipo de ausência</label><select class="form-control" id="request-department" name="type"><option>Férias</option><option>Assunto pessoal</option></select></div><div class="form-field"><label for="request-note">Nota para o responsável <span style="font-weight:400;color:#969d93">(opcional)</span></label><textarea class="form-control" id="request-note" name="note" placeholder="Partilha algum detalhe útil..."></textarea></div><p class="form-hint" id="request-hint">Os fins de semana e feriados portugueses não são descontados do saldo.</p>`, (form) => {
    const userId = form.get("userId");
    const start = form.get("start");
    const end = form.get("end");
    if (!start || !end || end < start) { showToast("Confirma as datas do pedido."); return; }
    const days = businessDays(start, end);
    if (!days) { showToast("O período tem de incluir pelo menos um dia útil."); return; }
    const employee = personById(userId);
    const used = state.requests.filter((request) => request.userId === userId && request.status === "Aprovado" && dateAtNoon(request.start).getFullYear() === new Date().getFullYear()).reduce((sum, request) => sum + request.days, 0);
    const entitlement = annualLeaveEntitlement(employee);
    if (days > Math.max(0, entitlement - used)) { showToast("O pedido excede o saldo de férias disponível."); return; }
    if (overlapping(userId, start, end) + 1 > state.settings.conflictLimit) { showToast("Aviso: há várias pessoas de férias neste período."); }
    const request = { id: `r-${Date.now()}`, userId, start, end, days, type: form.get("type"), status: "Pendente", note: form.get("note"), created: dateOffset(0) }; 
    state.requests.unshift(request);
    save(); closeModal(); render(); showToast("Pedido enviado para aprovação.");
    syncBackendRequest(request).catch(() => showToast("O pedido foi guardado localmente. Verifique o Supabase."));
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
  if (backend && !isDemoSession) {
    openModal("Adicionar colaborador", "As contas reais são criadas no Supabase Authentication.", `<div class="empty-state"><strong>Criação segura de conta</strong>Crie o utilizador em Authentication → Users e execute o SQL para atribuir o perfil e o departamento.</div><div class="form-field"><label>SQL de exemplo</label><textarea class="form-control" readonly>update public.profiles set role = 'Colaborador', department = 'Operações', job_title = 'Colaborador', hire_date = '2026-11-19', annual_leave_days = 22 where id = (select id from auth.users where email = 'funcionario@exemplo.pt');</textarea></div>`, () => closeModal());
    modalLayer.querySelector(".modal-footer").innerHTML = `<button type="button" class="secondary-button" data-action="close-modal">Fechar</button>`;
    return;
  }
  openModal("Adicionar colaborador", "Cria um novo perfil para a equipa.", `<div class="form-field"><label for="employee-name">Nome completo</label><input class="form-control" id="employee-name" name="name" required maxlength="60" /></div><div class="form-row"><div class="form-field"><label for="employee-role">Perfil</label><select class="form-control" id="employee-role" name="role"><option>Colaborador</option><option>Responsável</option></select></div><div class="form-field"><label for="employee-department">Departamento</label><input class="form-control" id="employee-department" name="department" required maxlength="40" /></div></div><div class="form-row"><div class="form-field"><label for="employee-hire-date">Data de admissão</label><input class="form-control" id="employee-hire-date" name="hireDate" type="date" value="${dateOffset(-365)}" required /></div><div class="form-field"><label for="employee-balance">Dias anuais de férias</label><input class="form-control" id="employee-balance" name="balance" type="number" min="22" max="60" value="${Math.max(22, state.settings.annualDays)}" required /></div></div><div class="form-field"><label for="employee-title">Função</label><input class="form-control" id="employee-title" name="title" maxlength="50" placeholder="Ex.: Designer" /></div>`, (form) => {
    const name = String(form.get("name")).trim();
    const department = String(form.get("department")).trim();
    if (!name || !department) { showToast("Preenche o nome e o departamento."); return; }
    const palette = ["#e7e4f1", "#dcebd9", "#f5ddd0", "#d8e7eb", "#f3e3aa"];
    state.people.push({ id: `u-${Date.now()}`, name, role: form.get("role"), title: String(form.get("title")).trim() || "Colaborador", department, initials: initials(name), color: palette[state.people.length % palette.length], balance: Math.max(22, Number(form.get("balance")) || 22), hireDate: String(form.get("hireDate") || "2025-01-01"), isActive: true });
    save(); closeModal(); render(); showToast("Colaborador adicionado à equipa.");
  });
  modalLayer.querySelector(".modal-footer .primary-button").textContent = "Adicionar colaborador";
}

function openProfileModal() {
  const person = currentUser();
  openModal("O meu perfil", "Altere a palavra-passe e as preferências da conta.", `<div class="form-field"><label>Nome</label><input class="form-control" value="${escapeHtml(person.name)}" readonly /></div><div class="form-field"><label>E-mail</label><input class="form-control" value="${escapeHtml(window.APP_USER.email || "")}" readonly /></div><div class="form-field"><label>Nova palavra-passe</label><input class="form-control" name="password" type="password" minlength="6" autocomplete="new-password" placeholder="Deixe vazio para não alterar" /></div><div class="setting-line"><div><strong>Notificações no sistema</strong><small>Mostrar novos pedidos e decisões</small></div><input class="switch" name="inAppNotifications" type="checkbox" ${person.inAppNotifications === false ? "" : "checked"} /></div><div class="setting-line"><div><strong>Notificações por e-mail</strong><small>Receber decisões por e-mail</small></div><input class="switch" name="emailNotifications" type="checkbox" ${person.emailNotifications === false ? "" : "checked"} /></div>`, async (form) => {
    const password = String(form.get("password") || "");
    if (password && password.length < 6) { showToast("A palavra-passe deve ter pelo menos 6 caracteres."); return; }
    if (password && backend && !isDemoSession) {
      const { error } = await backend.auth.updateUser({ password });
      if (error) { showToast("Não foi possível alterar a palavra-passe."); return; }
    }
    if (backend && !isDemoSession) {
      person.emailNotifications = form.get("emailNotifications") === "on";
      person.inAppNotifications = form.get("inAppNotifications") === "on";
      const { error } = await backend.rpc("update_notification_preferences", {
        wants_email: form.get("emailNotifications") === "on",
        wants_in_app: form.get("inAppNotifications") === "on",
      });
      if (error) { showToast("Não foi possível guardar as preferências."); return; }
    }
    closeModal(); showToast(password ? "Perfil e palavra-passe atualizados." : "Preferências atualizadas.");
  });
  modalLayer.querySelector(".modal-footer .primary-button").textContent = "Guardar perfil";
}

function editEmployeeModal(id) {
  const person = personById(id);
  if (!person) return;
  openModal("Editar colaborador", "Atualize os dados do perfil e o estado da conta.", `<div class="form-field"><label>Nome completo</label><input class="form-control" name="name" value="${escapeHtml(person.name)}" required /></div><div class="form-row"><div class="form-field"><label>Perfil</label><select class="form-control" name="role"><option ${person.role === "Colaborador" ? "selected" : ""}>Colaborador</option><option ${person.role === "Responsável" ? "selected" : ""}>Responsável</option><option ${person.role === "Administrador" ? "selected" : ""}>Administrador</option></select></div><div class="form-field"><label>Departamento</label><input class="form-control" name="department" value="${escapeHtml(person.department)}" required /></div></div><div class="form-row"><div class="form-field"><label>Função</label><input class="form-control" name="title" value="${escapeHtml(person.title || "Colaborador")}" /></div><div class="form-field"><label>Dias anuais</label><input class="form-control" name="balance" type="number" min="22" max="60" value="${person.balance || 22}" required /></div></div><div class="form-field"><label>Data de admissão</label><input class="form-control" name="hireDate" type="date" value="${person.hireDate || dateOffset(-365)}" required /></div><label class="setting-line"><span><strong>Colaborador ativo</strong><small>Desativar impede o acesso sem apagar o histórico</small></span><input class="switch" name="isActive" type="checkbox" ${person.isActive === false ? "" : "checked"} /></label>`, async (form) => {
    const name = String(form.get("name")).trim();
    const department = String(form.get("department")).trim();
    if (!name || !department) { showToast("Preencha o nome e o departamento."); return; }
    person.name = name;
    person.role = String(form.get("role"));
    person.department = department;
    person.title = String(form.get("title")).trim() || "Colaborador";
    person.balance = Math.max(22, Number(form.get("balance")) || 22);
    person.hireDate = String(form.get("hireDate"));
    person.isActive = form.get("isActive") === "on";
    person.initials = initials(name);
    save(); closeModal(); render(); showToast("Perfil atualizado.");
    if (backend && !isDemoSession) {
      const { error } = await backend.rpc("update_employee_profile", { employee_id: id, employee_name: name, employee_role: person.role, employee_department: department, employee_title: person.title, employee_hire_date: person.hireDate, employee_leave_days: person.balance, employee_active: person.isActive });
      if (error) showToast("O perfil ficou local. Verifique as permissões do Supabase.");
    }
  });
  modalLayer.querySelector(".modal-footer .primary-button").textContent = "Guardar alterações";
}

function openHelpModal() {
  const employeeHelp = `<div class="help-list"><details open><summary>Como submeto um pedido de férias?</summary><p>Escolha “Novo pedido”, selecione as datas e envie para aprovação do responsável.</p></details><details><summary>Como acompanho o meu pedido?</summary><p>Abra “Pedidos”. Os pedidos pendentes aguardam decisão, os aprovados foram aceites e os rejeitados não avançam.</p></details><details><summary>Posso cancelar um pedido?</summary><p>Enquanto estiver pendente, pode cancelá-lo na página “Pedidos”. Depois de aprovado ou rejeitado, apenas o administrador pode alterar o estado.</p></details><details><summary>Como consulto o meu calendário?</summary><p>O calendário mostra apenas os seus pedidos pendentes e férias aprovadas. Não são apresentados dados de outros funcionários.</p></details><details><summary>Como são calculados os meus dias disponíveis?</summary><p>Em Portugal continental, o mínimo anual é de 22 dias úteis. Fins de semana e feriados nacionais não são descontados. Quem foi admitido durante o ano pode ter direito proporcional.</p></details></div>`;
  const managerHelp = `<div class="help-list"><details open><summary>Como aprovo ou rejeito pedidos?</summary><p>Abra “Pedidos”, consulte os pedidos pendentes da equipa e escolha “Aprovar” ou “Rejeitar”.</p></details><details><summary>Como funciona o calendário da equipa?</summary><p>O calendário apresenta pedidos pendentes e férias aprovadas de todos os colaboradores, com cores e legenda distintas.</p></details><details><summary>Como adiciono um funcionário?</summary><p>Aceda a “Equipa”, escolha “Adicionar” e indique nome, perfil, departamento, data de admissão e dias anuais.</p></details><details><summary>Como altero as regras da empresa?</summary><p>Entre em “Administração” para definir dias anuais por defeito, limite de ausências simultâneas e notificações.</p></details><details><summary>Como são calculadas as férias?</summary><p>O sistema usa 22 dias úteis como mínimo em Portugal continental, excluindo fins de semana e feriados. No ano de admissão pode aplicar o direito proporcional.</p></details></div>`;
  const role = isManager() ? "Administrador" : "Funcionário";
  modalLayer.innerHTML = `<section class="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><div><h2 id="modal-title">Centro de apoio</h2><p>${role} · Respostas ao seu perfil</p></div><button class="modal-close" type="button" data-action="close-modal" aria-label="Fechar">×</button></header><div class="modal-form">${isManager() ? managerHelp : employeeHelp}<div class="modal-footer"><button type="button" class="primary-button" data-action="close-modal">Fechar</button></div></div></section>`;
  modalLayer.hidden = false;
}

const helpButton = document.querySelector("[data-action='open-help']");
helpButton?.addEventListener("click", openHelpModal);

function showToast(message) {
  const region = document.querySelector("#toast-region");
  region.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { region.innerHTML = ""; }, 3200);
}

async function changeRequest(id, status) {
  const request = state.requests.find((item) => item.id === id);
  if (!request) return;
  if (["Aprovado", "Rejeitado"].includes(status) && (!isManager() || String(request.userId) === String(currentUser().id))) return;
  if (status === "Cancelado" && String(request.userId) !== String(currentUser().id)) return;
  if (status === "Rejeitado" && !window.confirm("Queres rejeitar este pedido?")) return;
  let decisionNote = "";
  if (isManager()) {
    decisionNote = window.prompt(status === "Aprovado" ? "Observação da aprovação (opcional):" : "Motivo da rejeição (opcional):", "") || "";
  }
  request.status = status;
  request.decisionNote = decisionNote;
  save(); render();
  showToast(status === "Aprovado" ? "Pedido aprovado." : status === "Rejeitado" ? "Pedido rejeitado." : "Pedido cancelado.");
  if (backend && !isDemoSession) {
    syncBackendDecision(id, status, decisionNote).catch(() => showToast("A decisão foi alterada localmente. Verifique o Supabase."));
  }
}

async function markNotificationsRead() {
  if (!backend || isDemoSession) return;
  await backend.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
}

function toggleNotifications() {
  document.querySelector(".notification-popover")?.remove();
  const notifications = window.FOLGA_NOTIFICATIONS || [];
  const pending = state.requests.filter((request) => request.status === "Pendente" && (isManager() || request.userId === currentUser().id));
  const items = notifications.length ? notifications.filter((item) => !item.read_at).map((item) => `<div class="popover-item"><span>●</span><div><strong>${escapeHtml(item.title)}</strong><br><small>${escapeHtml(item.message)}</small></div></div>`).join("") : pending.slice(0, 4).map((request) => `<div class="popover-item"><span>●</span><div><strong>${escapeHtml(personById(request.userId)?.name || "Colaborador")}</strong> · pedido pendente<br><small>${shortDate.format(dateAtNoon(request.start))} – ${shortDate.format(dateAtNoon(request.end))}</small></div></div>`).join("");
  const popover = document.createElement("div");
  popover.className = "notification-popover";
  popover.innerHTML = `<div class="popover-title">Notificações</div>${items || `<div class="popover-item">Não tens notificações por ler.</div>`}`;
  document.body.append(popover);
  markNotificationsRead();
  setTimeout(() => document.addEventListener("click", function closePopover(event) {
    if (!popover.contains(event.target) && !event.target.closest("#notification-button")) { popover.remove(); document.removeEventListener("click", closePopover); }
  }), 0);
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-view]");
  if (nav) {
    if (nav.dataset.view === "administracao" && !isManager()) return;
    currentView = nav.dataset.view;
    searchTerm = "";
    document.querySelector("#sidebar").classList.remove("open");
    render();
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action) {
    const { action: name, id } = action.dataset;
    if (["new-employee", "save-settings", "reset-data"].includes(name) && !isManager()) return;
    if (name === "open-workspace") toggleWorkspaceMenu();
    else if (name === "workspace-admin") { currentView = "administracao"; render(); }
    else if (name === "export-requests") exportVisibleRequests();
    else if (name === "print-report") printReport();
    else if (name === "new-request") newRequestModal();
    else if (name === "new-employee") newEmployeeModal();
    else if (name === "edit-employee") editEmployeeModal(id);
    else if (name === "open-profile") openProfileModal();
    else if (name === "close-modal") closeModal();
    else if (name === "approve") changeRequest(id, "Aprovado");
    else if (name === "reject") changeRequest(id, "Rejeitado");
    else if (name === "cancel") changeRequest(id, "Cancelado");
    else if (name === "calendar-prev" || name === "mini-prev") { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1); render(); }
    else if (name === "calendar-next" || name === "mini-next") { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1); render(); }
    else if (name === "today") { calendarDate = new Date(); render(); }
    else if (name === "save-settings") {
      state.settings.annualDays = Math.min(60, Math.max(22, Number(document.querySelector("#annual-days").value) || 22));
      state.settings.conflictLimit = Math.min(20, Math.max(1, Number(document.querySelector("#conflict-limit").value) || 2));
      state.settings.notifications = document.querySelector("#notifications-setting").checked;
      state.settings.companyName = String(document.querySelector("#company-name")?.value || "Nexona Area").trim() || "Nexona Area";
      state.settings.planName = String(document.querySelector("#workspace-plan-name")?.value || "Plano Equipa").trim() || "Plano Equipa";
      save(); render(); showToast("Definições guardadas.");
      if (backend && !isDemoSession) {
        backend.from("company_settings").update({
          company_name: state.settings.companyName,
          plan_name: state.settings.planName,
          annual_days: state.settings.annualDays,
          conflict_limit: state.settings.conflictLimit,
          notifications_enabled: state.settings.notifications,
          updated_at: new Date().toISOString(),
        }).eq("id", 1).then(({ error }) => {
          if (error) showToast("A definição ficou local. Verifique o Supabase.");
        });
      }
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
  if (event.target.id === "calendar-department") { calendarDepartment = event.target.value; render(); }
});

if (backend && !isDemoSession) {
  syncBackendData();
} else {
  render();
}