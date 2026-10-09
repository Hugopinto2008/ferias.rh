<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';

try {
    $database = databaseConnection();
    $adminCount = (int) $database->query(
        "SELECT COUNT(*) FROM users WHERE role = 'Administrador'"
    )->fetchColumn();

    if ($adminCount > 0) {
        fwrite(STDERR, "Já existe uma conta administradora.\n");
        exit(1);
    }

    fwrite(STDOUT, 'Nome do administrador: ');
    $name = trim((string) fgets(STDIN));
    fwrite(STDOUT, 'E-mail: ');
    $email = filter_var(trim((string) fgets(STDIN)), FILTER_VALIDATE_EMAIL);
    fwrite(STDOUT, 'Palavra-passe (mínimo 12 caracteres): ');
    $password = trim((string) fgets(STDIN));

    if ($name === '' || $email === false || strlen($password) < 12) {
        fwrite(STDERR, "Dados inválidos. Confirma o nome, e-mail e palavra-passe.\n");
        exit(1);
    }

    $insert = $database->prepare(
        "INSERT INTO users (name, email, password_hash, role)
         VALUES (:name, :email, :password_hash, 'Administrador')"
    );
    $insert->execute([
        'name' => $name,
        'email' => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    ]);

    fwrite(STDOUT, "Conta administradora criada. Remove este script após a configuração inicial.\n");
} catch (Throwable $error) {
    error_log($error->getMessage());
    fwrite(STDERR, "Não foi possível criar a conta. Confirma o estado do MySQL e a base folga_db.\n");
    exit(1);
}