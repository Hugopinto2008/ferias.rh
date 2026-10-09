<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    require_once __DIR__ . '/../config/database.php';
    databaseConnection()->query('SELECT 1');

    http_response_code(200);
    echo json_encode(['status' => 'ok', 'database' => 'connected']);
} catch (Throwable $error) {
    error_log($error->getMessage());
    http_response_code(503);
    echo json_encode(['status' => 'error', 'database' => 'unavailable']);
}