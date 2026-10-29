<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/database.php';

try {
    $database = databaseConnection();

    $email = 'funcionario.teste@folga.local';
    $check = $database->prepare('SELECT COUNT(*) FROM users WHERE email = :email');
    $check->execute(['email' => $email]);
    $exists = (int) $check->fetchColumn();

    if ($exists > 0) {
        fwrite(STDOUT, "Já existe uma conta de teste com este e-mail.\n");
        exit(0);
    }

    $password = 'Teste123456';
    $insert = $database->prepare(
        "INSERT INTO users (name, email, password_hash, role, annual_leave_days, active)
         VALUES (:name, :email, :password_hash, 'Colaborador', 22, 1)"
    );

    $insert->execute([
        'name' => 'Funcionário Teste',
        'email' => $email,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
    ]);

    fwrite(STDOUT, "Conta de teste criada.\n");
    fwrite(STDOUT, "E-mail: {$email}\n");
    fwrite(STDOUT, "Palavra-passe: {$password}\n");
    fwrite(STDOUT, "Role: Colaborador\n");
} catch (Throwable $error) {
    error_log($error->getMessage());
    fwrite(STDERR, "Não foi possível criar a conta de teste. Confirma o estado do MySQL e a base folga_db.\n");
    exit(1);
}
