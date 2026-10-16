<?php
declare(strict_types=1);

require_once __DIR__ . '/config/auth.php';
$user = requireAuthenticatedUser();
$isAdministrator = $user['role'] === 'Administrador';
?>
<!doctype html>
<html lang="pt">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f5f5f0" />
    <title>Férias — Gestão de equipa</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <script>
      window.APP_USER = <?= json_encode([
          'id' => (int) $user['id'],
          'name' => $user['name'],
          'email' => $user['email'],
          'role' => $user['role'],
          'department' => $user['department'] ?? 'Sem departamento',
          'annualLeaveDays' => (int) $user['annual_leave_days'],
      ], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>;
    </script>
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <a class="brand" href="index.php" aria-label="Folga, início">
          <span class="brand-mark">f.</span>
          <span class="brand-name">folga<span class="brand-dot">.</span></span>
        </a>

        <div class="workspace-label">ESPAÇO DE TRABALHO</div>
        <div class="workspace-switch">
          <span class="workspace-avatar">N</span>
          <span class="workspace-copy"><strong>Norte &amp; Co.</strong><small>Plano Equipa</small></span>
          <span class="chevron">⌄</span>
        </div>

        <div class="nav-label">MENU</div>
        <nav class="main-nav" aria-label="Navegação principal">
          <button class="nav-item active" data-view="inicio"><span class="nav-icon">⌂</span>Visão geral</button>
          <button class="nav-item" data-view="calendario"><span class="nav-icon">▦</span>Calendário</button>
          <button class="nav-item" data-view="pedidos"><span class="nav-icon">▤</span>Pedidos <span class="nav-count" id="pending-count">0</span></button>
          <button class="nav-item" data-view="equipa"><span class="nav-icon">♧</span>Equipa</button>
        </nav>

        <?php if ($isAdministrator): ?>
          <div class="nav-label admin-label">GESTÃO</div>
          <nav class="main-nav" aria-label="Gestão">
            <button class="nav-item" data-view="administracao"><span class="nav-icon">⚙</span>Administração</button>
          </nav>
        <?php endif; ?>

        <div class="sidebar-bottom">
          <div class="help-block">
            <span class="help-icon">?</span>
            <div><strong>Precisa de ajuda?</strong><small>Consulte o centro de apoio</small></div>
            <span class="help-arrow">↗</span>
          </div>
          <div class="profile-switch">
            <span class="avatar avatar-green" id="profile-avatar"></span>
            <span class="profile-copy"><strong id="profile-name"></strong><small id="profile-role"></small></span>
            <form class="logout-form" method="post" action="logout.php">
              <input type="hidden" name="csrf_token" value="<?= htmlspecialchars(csrfToken(), ENT_QUOTES, 'UTF-8') ?>" />
              <button class="logout-button" type="submit" title="Terminar sessão" aria-label="Terminar sessão">↪</button>
            </form>
          </div>
        </div>
      </aside>

      <main class="main-area">
        <header class="topbar">
          <button class="mobile-menu" id="mobile-menu" aria-label="Abrir menu">☰</button>
          <div class="breadcrumbs"><span>Norte &amp; Co.</span><span class="crumb-slash">/</span><strong id="breadcrumb-current">Visão geral</strong></div>
          <div class="topbar-actions">
            <span class="today-label" id="today-label"></span>
            <button class="icon-button notification-button" id="notification-button" aria-label="Notificações"><span>♧</span><i></i></button>
            <span class="top-avatar" id="top-avatar" aria-hidden="true"></span>
          </div>
        </header>

        <div class="page-content" id="page-content"></div>
      </main>
    </div>
    <div class="toast-region" id="toast-region" aria-live="polite"></div>
    <div class="modal-layer" id="modal-layer" hidden></div>
    <script src="app.js"></script>
  </body>
</html>