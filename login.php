<?php
declare(strict_types=1);

require_once __DIR__ . '/config/auth.php';
startAppSession();

$errorMessage = '';
$databaseReady = true;
$profile = (string) ($_POST['profile'] ?? $_GET['profile'] ?? '');
if (!in_array($profile, ['admin', 'employee'], true)) {
  $profile = '';
}

try {
    $existingUser = authenticatedUser();
    if ($existingUser !== null) {
        header('Location: index.html');
        exit;
    }
} catch (Throwable $error) {
    error_log($error->getMessage());
    $databaseReady = false;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $databaseReady) {
    if (!validCsrfToken($_POST['csrf_token'] ?? null)) {
        $errorMessage = 'A sessão do formulário expirou. Atualiza a página e tenta novamente.';
    } else {
        $email = filter_var(trim((string) ($_POST['email'] ?? '')), FILTER_VALIDATE_EMAIL);
        $password = (string) ($_POST['password'] ?? '');

        if ($email !== false && $password !== '' && $profile !== '') {
            try {
                $statement = databaseConnection()->prepare(
              'SELECT id, password_hash, role FROM users
                     WHERE email = :email AND active = 1 LIMIT 1'
                );
                $statement->execute(['email' => $email]);
                $user = $statement->fetch();
            $roleMatches = $user && (
              ($profile === 'admin' && $user['role'] === 'Administrador')
              || ($profile === 'employee' && in_array($user['role'], ['Colaborador', 'Responsável'], true))
            );

            if ($roleMatches && password_verify($password, $user['password_hash'])) {
                    session_regenerate_id(true);
                    $_SESSION['user_id'] = (int) $user['id'];
                    unset($_SESSION['csrf_token']);
                    header('Location: index.html');
                    exit;
                }
            } catch (Throwable $error) {
                error_log($error->getMessage());
                $databaseReady = false;
            }
        }

        if ($databaseReady) {
            $errorMessage = 'E-mail ou palavra-passe incorretos.';
        }
    }
}

$token = csrfToken();
?>
<!doctype html>
<html lang="pt">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f5f5f0" />
    <title>Acesso — Folga</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body class="auth-page">
    <main class="auth-shell">
      <a class="brand auth-brand" href="login.php" aria-label="Folga">
        <span class="brand-mark">f.</span><span class="brand-name">folga<span class="brand-dot">.</span></span>
      </a>
      <section class="auth-panel">
        <p class="eyebrow">ESPAÇO DE TRABALHO</p>
        <?php if ($profile === ''): ?>
          <h1>Escolhe a tua área</h1>
          <p class="page-subtitle">Seleciona o tipo de acesso para continuar.</p>
        <?php else: ?>
          <h1><?= $profile === 'admin' ? 'Área de administração' : 'Acesso dos funcionários' ?></h1>
          <p class="page-subtitle">Inicia sessão para gerir as tuas férias.</p>
        <?php endif; ?>
        <?php if (!$databaseReady): ?>
          <p class="auth-error" role="alert">Não foi possível ligar à base de dados. Confirma se o WampServer e o MySQL estão ativos.</p>
        <?php elseif ($errorMessage !== ''): ?>
          <p class="auth-error" role="alert"><?= htmlspecialchars($errorMessage, ENT_QUOTES, 'UTF-8') ?></p>
        <?php endif; ?>
        <?php if ($profile === ''): ?>
          <div class="auth-form">
            <a class="primary-button auth-submit" href="login.php?profile=admin">Área do Administrador</a>
            <a class="primary-button auth-submit" href="login.php?profile=employee">Acesso dos Funcionários</a>
          </div>
        <?php else: ?>
          <form class="auth-form" method="post" action="login.php">
            <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($token, ENT_QUOTES, 'UTF-8') ?>" />
            <input type="hidden" name="profile" value="<?= htmlspecialchars($profile, ENT_QUOTES, 'UTF-8') ?>" />
            <div class="form-field">
              <label for="email">E-mail</label>
              <input class="form-control" id="email" name="email" type="email" autocomplete="username" required maxlength="190" />
            </div>
            <div class="form-field">
              <label for="password">Palavra-passe</label>
              <input class="form-control" id="password" name="password" type="password" autocomplete="current-password" required />
            </div>
            <button class="primary-button auth-submit" type="submit" <?= !$databaseReady ? 'disabled' : '' ?>>Entrar</button>
          </form>
          <p class="auth-footnote"><a href="login.php">Voltar à escolha de acesso</a></p>
        <?php endif; ?>
      </section>
      <p class="auth-copyright">FOLGA · GESTÃO DE FÉRIAS</p>
    </main>
  </body>
</html>