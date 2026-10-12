<?php
declare(strict_types=1);

require_once __DIR__ . '/../config/auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function requireAdministrator(array $user): void
{
    if ($user['role'] !== 'Administrador') {
        respond(['error' => 'Não tens permissões para esta operação.'], 403);
    }
}

function requireManager(array $user): void
{
    if (!in_array($user['role'], ['Administrador', 'Responsável'], true)) {
        respond(['error' => 'Não tens permissões para esta operação.'], 403);
    }
}

try {
    $user = authenticatedUser();
    if ($user === null) {
        respond(['error' => 'A sessão expirou. Inicia sessão novamente.'], 401);
    }

    $database = databaseConnection();
    $isManager = in_array($user['role'], ['Administrador', 'Responsável'], true);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $peopleSql = 'SELECT users.id, users.name, users.email, users.role, users.annual_leave_days, departments.name AS department
                      FROM users
                      LEFT JOIN departments ON departments.id = users.department_id
                      WHERE users.active = 1';
        if (!$isManager) {
            $peopleSql .= ' AND users.id = :user_id';
        }
        $peopleSql .= ' ORDER BY users.name';
        $peopleStatement = $database->prepare($peopleSql);
        if (!$isManager) {
            $peopleStatement->execute(['user_id' => (int) $user['id']]);
        } else {
            $peopleStatement->execute();
        }

        $requestSql = 'SELECT leave_requests.id, leave_requests.user_id, leave_requests.start_date,
                              leave_requests.end_date, leave_requests.working_days, leave_requests.type,
                              leave_requests.status, leave_requests.note, DATE(leave_requests.created_at) AS created
                       FROM leave_requests';
        if (!$isManager) {
            $requestSql .= ' WHERE leave_requests.user_id = :user_id';
        }
        $requestSql .= ' ORDER BY leave_requests.created_at DESC';
        $requestStatement = $database->prepare($requestSql);
        if (!$isManager) {
            $requestStatement->execute(['user_id' => (int) $user['id']]);
        } else {
            $requestStatement->execute();
        }

        $settings = ['annualDays' => 22, 'conflictLimit' => 2, 'notifications' => true];
        if ($user['role'] === 'Administrador') {
            $settingsRow = $database->query('SELECT annual_days, conflict_limit, notifications FROM company_settings WHERE id = 1')->fetch();
            if ($settingsRow) {
                $settings = [
                    'annualDays' => (int) $settingsRow['annual_days'],
                    'conflictLimit' => (int) $settingsRow['conflict_limit'],
                    'notifications' => (bool) $settingsRow['notifications'],
                ];
            }
        }

        respond([
            'user' => ['id' => (int) $user['id'], 'name' => $user['name'], 'role' => $user['role']],
            'people' => $peopleStatement->fetchAll(),
            'requests' => $requestStatement->fetchAll(),
            'settings' => $settings,
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        header('Allow: GET, POST');
        respond(['error' => 'Método não permitido.'], 405);
    }

    if (!validCsrfToken($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null)) {
        respond(['error' => 'A sessão do formulário expirou. Atualiza a página e tenta novamente.'], 419);
    }

    $input = json_decode((string) file_get_contents('php://input'), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($input)) {
        respond(['error' => 'Pedido inválido.'], 400);
    }

    $action = (string) ($input['action'] ?? '');

    if ($action === 'request-create') {
        $start = (string) ($input['start'] ?? '');
        $end = (string) ($input['end'] ?? '');
        $startDate = DateTimeImmutable::createFromFormat('!Y-m-d', $start);
        $endDate = DateTimeImmutable::createFromFormat('!Y-m-d', $end);
        $today = new DateTimeImmutable('today');
        if (!$startDate || !$endDate || $startDate->format('Y-m-d') !== $start || $endDate->format('Y-m-d') !== $end || $endDate < $startDate || $startDate < $today) {
            respond(['error' => 'Indica um período válido a partir de hoje.'], 422);
        }

        $workingDays = 0;
        for ($date = $startDate; $date <= $endDate; $date = $date->modify('+1 day')) {
            if ((int) $date->format('N') < 6) {
                $workingDays++;
            }
        }
        if ($workingDays === 0) {
            respond(['error' => 'O período tem de incluir pelo menos um dia útil.'], 422);
        }

        $targetUserId = $isManager ? (int) ($input['userId'] ?? $user['id']) : (int) $user['id'];
        $type = (string) ($input['type'] ?? 'Férias');
        if (!in_array($type, ['Férias', 'Assunto pessoal'], true)) {
            respond(['error' => 'O tipo de ausência é inválido.'], 422);
        }
        $note = trim((string) ($input['note'] ?? ''));
        if (strlen($note) > 1000) {
            respond(['error' => 'A nota excede o limite de 1000 caracteres.'], 422);
        }

        $database->beginTransaction();
        $employeeStatement = $database->prepare('SELECT annual_leave_days FROM users WHERE id = :id AND active = 1 FOR UPDATE');
        $employeeStatement->execute(['id' => $targetUserId]);
        $employee = $employeeStatement->fetch();
        if (!$employee) {
            $database->rollBack();
            respond(['error' => 'Colaborador não encontrado.'], 404);
        }
        $usedStatement = $database->prepare(
            "SELECT COALESCE(SUM(working_days), 0) FROM leave_requests
             WHERE user_id = :user_id AND status = 'Aprovado' AND YEAR(start_date) = :year"
        );
        $usedStatement->execute(['user_id' => $targetUserId, 'year' => (int) $startDate->format('Y')]);
        $usedDays = (int) $usedStatement->fetchColumn();
        if ($workingDays > max(0, (int) $employee['annual_leave_days'] - $usedDays)) {
            $database->rollBack();
            respond(['error' => 'O pedido excede o saldo de férias disponível.'], 422);
        }

        $insert = $database->prepare(
            "INSERT INTO leave_requests (user_id, start_date, end_date, working_days, type, note)
             VALUES (:user_id, :start_date, :end_date, :working_days, :type, :note)"
        );
        $insert->execute([
            'user_id' => $targetUserId,
            'start_date' => $start,
            'end_date' => $end,
            'working_days' => $workingDays,
            'type' => $type,
            'note' => $note === '' ? null : $note,
        ]);
        $database->commit();
        respond(['ok' => true]);
    }

    if ($action === 'request-status') {
        $requestId = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
        $status = (string) ($input['status'] ?? '');
        if (!$requestId || !in_array($status, ['Aprovado', 'Rejeitado', 'Cancelado'], true)) {
            respond(['error' => 'A decisão do pedido é inválida.'], 422);
        }

        if ($status === 'Cancelado') {
            $statement = $database->prepare(
                "UPDATE leave_requests SET status = 'Cancelado'
                 WHERE id = :id AND user_id = :user_id AND status = 'Pendente'"
            );
            $statement->execute(['id' => $requestId, 'user_id' => (int) $user['id']]);
        } else {
            requireManager($user);
            $statement = $database->prepare(
                "UPDATE leave_requests SET status = :status, decided_by = :decided_by, decided_at = NOW()
                 WHERE id = :id AND status = 'Pendente' AND user_id <> :decided_by"
            );
            $statement->execute(['status' => $status, 'decided_by' => (int) $user['id'], 'id' => $requestId]);
        }
        if ($statement->rowCount() !== 1) {
            respond(['error' => 'O pedido já foi tratado ou não tens permissões para alterá-lo.'], 409);
        }
        respond(['ok' => true]);
    }

    if ($action === 'employee-create') {
        requireAdministrator($user);
        $name = trim((string) ($input['name'] ?? ''));
        $email = filter_var(trim((string) ($input['email'] ?? '')), FILTER_VALIDATE_EMAIL);
        $password = (string) ($input['password'] ?? '');
        $departmentName = trim((string) ($input['department'] ?? ''));
        $role = (string) ($input['role'] ?? 'Colaborador');
        $annualDays = filter_var($input['annualLeaveDays'] ?? 22, FILTER_VALIDATE_INT);
        if ($name === '' || strlen($name) > 120 || $email === false || strlen($password) < 12 || $departmentName === '' || strlen($departmentName) > 80 || !in_array($role, ['Administrador', 'Responsável', 'Colaborador'], true) || $annualDays === false || $annualDays < 1 || $annualDays > 60) {
            respond(['error' => 'Confirma os dados. A palavra-passe deve ter pelo menos 12 caracteres.'], 422);
        }

        $database->beginTransaction();
        $department = $database->prepare('INSERT INTO departments (name) VALUES (:name) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)');
        $department->execute(['name' => $departmentName]);
        $departmentId = (int) $database->lastInsertId();
        $insert = $database->prepare(
            'INSERT INTO users (department_id, name, email, password_hash, role, annual_leave_days)
             VALUES (:department_id, :name, :email, :password_hash, :role, :annual_leave_days)'
        );
        $insert->execute([
            'department_id' => $departmentId,
            'name' => $name,
            'email' => $email,
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'role' => $role,
            'annual_leave_days' => $annualDays,
        ]);
        $database->commit();
        respond(['ok' => true]);
    }

    if ($action === 'settings-update') {
        requireAdministrator($user);
        $annualDays = filter_var($input['annualDays'] ?? null, FILTER_VALIDATE_INT);
        $conflictLimit = filter_var($input['conflictLimit'] ?? null, FILTER_VALIDATE_INT);
        $notifications = filter_var($input['notifications'] ?? null, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($annualDays === false || $annualDays < 1 || $annualDays > 60 || $conflictLimit === false || $conflictLimit < 1 || $conflictLimit > 20 || $notifications === null) {
            respond(['error' => 'Confirma os valores das definições.'], 422);
        }
        $statement = $database->prepare(
            'INSERT INTO company_settings (id, annual_days, conflict_limit, notifications)
             VALUES (1, :annual_days, :conflict_limit, :notifications)
             ON DUPLICATE KEY UPDATE annual_days = VALUES(annual_days), conflict_limit = VALUES(conflict_limit), notifications = VALUES(notifications)'
        );
        $statement->execute([
            'annual_days' => $annualDays,
            'conflict_limit' => $conflictLimit,
            'notifications' => (int) $notifications,
        ]);
        respond(['ok' => true]);
    }

    respond(['error' => 'Operação desconhecida.'], 400);
} catch (Throwable $error) {
    if (isset($database) && $database instanceof PDO && $database->inTransaction()) {
        $database->rollBack();
    }
    error_log($error->getMessage());
    respond(['error' => 'Ocorreu um erro ao processar o pedido.'], 500);
}
