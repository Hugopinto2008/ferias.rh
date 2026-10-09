CREATE DATABASE IF NOT EXISTS folga_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE folga_db;

CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_departments_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_id INT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Administrador', 'Responsável', 'Colaborador') NOT NULL DEFAULT 'Colaborador',
  annual_leave_days TINYINT UNSIGNED NOT NULL DEFAULT 22,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_department (department_id),
  CONSTRAINT fk_users_department
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  working_days SMALLINT UNSIGNED NOT NULL,
  type ENUM('Férias', 'Assunto pessoal') NOT NULL DEFAULT 'Férias',
  status ENUM('Pendente', 'Aprovado', 'Rejeitado', 'Cancelado') NOT NULL DEFAULT 'Pendente',
  note VARCHAR(1000) NULL,
  decided_by INT UNSIGNED NULL,
  decided_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_requests_user_dates (user_id, start_date, end_date),
  KEY ix_requests_status_dates (status, start_date, end_date),
  KEY ix_requests_decided_by (decided_by),
  CONSTRAINT chk_requests_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_requests_working_days CHECK (working_days > 0),
  CONSTRAINT fk_requests_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_requests_decider
    FOREIGN KEY (decided_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;