<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    $user = authenticatedUser();
} catch (Throwable $error) {
    error_log($error->getMessage());
    http_response_code(503);
    echo json_encode(['error' => 'Serviço temporariamente indisponível.']);
    exit;
}

if ($user === null) {
    http_response_code(401);
    echo json_encode(['error' => 'Autenticação necessária.']);
    exit;
}

echo json_encode([
    'user' => [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'department' => $user['department'] ?? 'Sem departamento',
        'annualLeaveDays' => (int) $user['annual_leave_days'],
    ],
    'csrfToken' => csrfToken(),
], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);