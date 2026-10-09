<?php
declare(strict_types=1);

require_once __DIR__ . '/database.php';

function startAppSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_set_cookie_params([
        'httponly' => true,
        'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'samesite' => 'Lax',
        'path' => '/',
    ]);
    session_start();
}

function authenticatedUser(): ?array
{
    startAppSession();
    $userId = $_SESSION['user_id'] ?? null;

    if (!is_int($userId) && !ctype_digit((string) $userId)) {
        return null;
    }

    $statement = databaseConnection()->prepare(
        'SELECT users.id, users.name, users.email, users.role, users.annual_leave_days,
                departments.name AS department
         FROM users
         LEFT JOIN departments ON departments.id = users.department_id
         WHERE users.id = :id AND users.active = 1'
    );
    $statement->execute(['id' => (int) $userId]);
    $user = $statement->fetch();

    if (!$user) {
        $_SESSION = [];
        session_destroy();
        return null;
    }

    return $user;
}

function requireAuthenticatedUser(): array
{
    try {
        $user = authenticatedUser();
    } catch (Throwable $error) {
        error_log($error->getMessage());
        http_response_code(503);
        exit('O serviço está temporariamente indisponível.');
    }

    if ($user === null) {
        header('Location: login.php');
        exit;
    }

    return $user;
}

function requireUserRole(array $user, string ...$roles): void
{
    if (!in_array($user['role'], $roles, true)) {
        http_response_code(403);
        exit('Não tens permissões para aceder a esta página.');
    }
}

function csrfToken(): string
{
    startAppSession();
    if (!isset($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['csrf_token'];
}

function validCsrfToken(mixed $token): bool
{
    startAppSession();
    return is_string($token)
        && isset($_SESSION['csrf_token'])
        && hash_equals($_SESSION['csrf_token'], $token);
}