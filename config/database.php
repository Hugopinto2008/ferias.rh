<?php
declare(strict_types=1);

function databaseConnection(): PDO
{
    static $connection = null;

    if ($connection instanceof PDO) {
        return $connection;
    }

    $host = getenv('FOLGA_DB_HOST') ?: '127.0.0.1';
    $port = (int) (getenv('FOLGA_DB_PORT') ?: 3306);
    $name = getenv('FOLGA_DB_NAME') ?: 'folga_db';
    $user = getenv('FOLGA_DB_USER') ?: 'root';
    $password = getenv('FOLGA_DB_PASSWORD') ?: '';
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $name);

    $connection = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $connection;
}