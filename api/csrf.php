<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/auth.php';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');

startAppSession();
echo csrfToken();
