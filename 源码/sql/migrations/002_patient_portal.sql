-- 002_patient_portal.sql
-- Incremental patient portal migration. Review before applying. This file is
-- additive and does not drop, truncate or reset any existing business table.

ALTER TABLE user_account
  MODIFY COLUMN role_code ENUM('FRONT_DESK','DENTIST','CLINIC_MANAGER','HQ_MANAGER','PATIENT') NOT NULL,
  ADD COLUMN failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN locked_until DATETIME(6) NULL,
  ADD COLUMN last_failed_login_at DATETIME(6) NULL,
  ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE clinic
  ADD COLUMN appointment_deposit_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_clinic_deposit_nonnegative CHECK (appointment_deposit_amount >= 0);

ALTER TABLE appointment
  MODIFY COLUMN status ENUM('SCHEDULED','ATTENDED','NO_SHOW','CANCELLED','RESCHEDULED','PENDING_PAYMENT','EXPIRED') NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN payment_required TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN hold_expires_at DATETIME(6) NULL,
  ADD COLUMN confirmed_at DATETIME(6) NULL,
  ADD COLUMN booking_channel ENUM('PATIENT_SELF_SERVICE','STAFF','LEGACY') NOT NULL DEFAULT 'LEGACY',
  ADD KEY idx_appointment_patient_time (patient_id, scheduled_start_at),
  ADD KEY idx_appointment_hold (status, hold_expires_at),
  ADD KEY idx_appointment_channel (booking_channel);

ALTER TABLE appointment_change
  ADD COLUMN cause_code VARCHAR(64) NULL,
  ADD COLUMN seconds_before_start BIGINT NULL,
  ADD COLUMN refund_eligible TINYINT(1) NULL,
  ADD COLUMN refund_amount DECIMAL(14,2) NULL,
  ADD COLUMN rule_evaluated_at DATETIME(6) NULL;

ALTER TABLE audit_log
  MODIFY COLUMN action_type ENUM(
    'CREATE','UPDATE','CANCEL','RESCHEDULE','ATTEND','NO_SHOW',
    'CREATE_SCHEDULE','UPDATE_SCHEDULE',
    'CREATE_COST','VERIFY_COST','REJECT_COST',
    'CREATE_SETTLEMENT','VOID_SETTLEMENT','REGENERATE_SETTLEMENT',
    'CONFIRM_PERFORMANCE_SNAPSHOT','CORRECT_PERFORMANCE_SNAPSHOT','VIEW_PERFORMANCE_SNAPSHOT',
    'QUERY','EXPORT','LOGIN',
    'REGISTER','BIND_PATIENT_ACCOUNT','APPROVE_PATIENT_BINDING','REJECT_PATIENT_BINDING','UNBIND_PATIENT_ACCOUNT',
    'CREATE_PAYMENT_ORDER','CONFIRM_APPOINTMENT','EXPIRE_APPOINTMENT','PAYMENT_SUCCESS','PAYMENT_FAILED',
    'CLOSE_PAYMENT_ORDER','RECORD_OFFLINE_PAYMENT','CONFIRM_OFFLINE_PAYMENT','VOID_OFFLINE_PAYMENT',
    'APPLY_DEPOSIT','RELEASE_DEPOSIT','REFUND_REQUEST','REFUND_APPROVE','REFUND_REJECT','REFUND_PROCESS',
    'REFUND_SUCCESS','REFUND_FAILED','FORFEIT_DEPOSIT','CREATE_SETTLEMENT_EXCEPTION','REVIEW_SETTLEMENT_EXCEPTION'
  ) NOT NULL;

CREATE TABLE patient_account (
  user_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NULL,
  link_status ENUM('PENDING','ACTIVE','REJECTED','REVOKED') NOT NULL DEFAULT 'PENDING',
  requested_patient_no VARCHAR(32) NULL,
  requested_name VARCHAR(100) NULL,
  requested_phone VARCHAR(32) NULL,
  requested_birth_date DATE NULL,
  requested_clinic_id BIGINT UNSIGNED NULL,
  matched_patient_id BIGINT UNSIGNED NULL,
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(6) NULL,
  rejection_reason VARCHAR(255) NULL,
  unbound_at DATETIME(6) NULL,
  unbound_by_user_id BIGINT UNSIGNED NULL,
  unbind_reason VARCHAR(255) NULL,
  terms_accepted_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_patient_account_patient (patient_id),
  KEY idx_patient_account_status (link_status, created_at),
  KEY idx_patient_account_clinic (requested_clinic_id, link_status),
  CONSTRAINT fk_patient_account_user FOREIGN KEY (user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_patient_account_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_patient_account_matched FOREIGN KEY (matched_patient_id) REFERENCES patient (patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_patient_account_clinic FOREIGN KEY (requested_clinic_id) REFERENCES clinic (clinic_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_patient_account_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_patient_account_unbinder FOREIGN KEY (unbound_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_patient_account_active CHECK (link_status <> 'ACTIVE' OR patient_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Patient login account linked to a patient profile';

CREATE TABLE payment_order (
  order_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_no VARCHAR(32) NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  clinic_id BIGINT UNSIGNED NOT NULL,
  appointment_id BIGINT UNSIGNED NULL,
  visit_id BIGINT UNSIGNED NULL,
  settlement_id BIGINT UNSIGNED NULL,
  order_type ENUM('APPOINTMENT_DEPOSIT','VISIT_BALANCE') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  status ENUM('PENDING_PAYMENT','PARTIALLY_PAID','PAID','CLOSED','CANCELLED','FORFEITED','REFUNDING','REFUNDED','PARTIALLY_REFUNDED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount_applied DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount_refunded DECIMAL(14,2) NOT NULL DEFAULT 0,
  amount_refund_reserved DECIMAL(14,2) NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(128) NOT NULL,
  expires_at DATETIME(6) NULL,
  paid_at DATETIME(6) NULL,
  closed_at DATETIME(6) NULL,
  forfeited_at DATETIME(6) NULL,
  forfeited_reason_code VARCHAR(64) NULL,
  forfeited_by_user_id BIGINT UNSIGNED NULL,
  description VARCHAR(255) NULL,
  active_appointment_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN order_type='APPOINTMENT_DEPOSIT' AND status IN ('PENDING_PAYMENT','PAID','REFUNDING') THEN appointment_id ELSE NULL END
  ) STORED,
  active_settlement_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN order_type='VISIT_BALANCE' AND status IN ('PENDING_PAYMENT','PARTIALLY_PAID','PAID','REFUNDING') THEN settlement_id ELSE NULL END
  ) STORED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (order_id),
  UNIQUE KEY uq_payment_order_no (order_no),
  UNIQUE KEY uq_payment_order_idempotency (patient_id, idempotency_key),
  UNIQUE KEY uq_payment_order_active_appointment (active_appointment_id),
  UNIQUE KEY uq_payment_order_active_settlement (active_settlement_id),
  KEY idx_payment_order_patient_status (patient_id, status, created_at),
  KEY idx_payment_order_clinic_status (clinic_id, status, created_at),
  KEY idx_payment_order_appointment (appointment_id),
  KEY idx_payment_order_settlement (settlement_id),
  CONSTRAINT fk_payment_order_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_order_clinic FOREIGN KEY (clinic_id) REFERENCES clinic (clinic_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_order_appointment FOREIGN KEY (appointment_id) REFERENCES appointment (appointment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_order_visit FOREIGN KEY (visit_id) REFERENCES visit (visit_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_order_settlement FOREIGN KEY (settlement_id) REFERENCES settlement (settlement_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_order_forfeiter FOREIGN KEY (forfeited_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_payment_order_amount CHECK (amount > 0),
  CONSTRAINT chk_payment_order_amounts CHECK (
    amount_paid >= 0 AND amount_applied >= 0 AND amount_refunded >= 0 AND amount_refund_reserved >= 0
    AND amount_paid <= amount
    AND amount_applied + amount_refunded + amount_refund_reserved <= amount_paid
  ),
  CONSTRAINT chk_payment_order_type CHECK (
    (order_type='APPOINTMENT_DEPOSIT' AND appointment_id IS NOT NULL AND settlement_id IS NULL)
    OR (order_type='VISIT_BALANCE' AND settlement_id IS NOT NULL AND appointment_id IS NULL)
  ),
  CONSTRAINT chk_payment_order_deposit_full CHECK (
    order_type <> 'APPOINTMENT_DEPOSIT' OR amount_paid IN (0, amount)
  ),
  CONSTRAINT chk_payment_order_deposit_applied CHECK (
    order_type='APPOINTMENT_DEPOSIT' OR amount_applied = 0
  ),
  CONSTRAINT chk_payment_order_forfeit_type CHECK (
    status <> 'FORFEITED' OR order_type='APPOINTMENT_DEPOSIT'
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Patient-facing deposit and post-visit balance orders';

CREATE TABLE payment_transaction (
  transaction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_no VARCHAR(32) NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  clinic_id BIGINT UNSIGNED NOT NULL,
  order_type_snapshot ENUM('APPOINTMENT_DEPOSIT','VISIT_BALANCE') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  channel ENUM('MOCK','CASH','CARD','BANK_TRANSFER','OTHER_OFFLINE') NOT NULL,
  status ENUM('INITIATED','SUCCEEDED','FAILED','CANCELLED','RECORDED','CONFIRMED','VOID') NOT NULL DEFAULT 'INITIATED',
  idempotency_key VARCHAR(128) NOT NULL,
  requested_by_user_id BIGINT UNSIGNED NULL,
  recorded_by_user_id BIGINT UNSIGNED NULL,
  confirmed_by_user_id BIGINT UNSIGNED NULL,
  receipt_no VARCHAR(64) NULL,
  note VARCHAR(255) NULL,
  provider_reference VARCHAR(64) NULL,
  failure_code VARCHAR(64) NULL,
  failure_message VARCHAR(255) NULL,
  order_status_snapshot VARCHAR(32) NULL,
  deposit_success_order_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN order_type_snapshot='APPOINTMENT_DEPOSIT' AND status IN ('SUCCEEDED','CONFIRMED') THEN order_id ELSE NULL END
  ) STORED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at DATETIME(6) NULL,
  confirmed_at DATETIME(6) NULL,
  PRIMARY KEY (transaction_id),
  UNIQUE KEY uq_payment_transaction_no (transaction_no),
  UNIQUE KEY uq_payment_transaction_idempotency (order_id, idempotency_key),
  UNIQUE KEY uq_payment_transaction_deposit_success (deposit_success_order_id),
  UNIQUE KEY uq_payment_transaction_receipt (clinic_id, receipt_no),
  KEY idx_payment_transaction_order_status (order_id, status, created_at),
  CONSTRAINT fk_payment_transaction_order FOREIGN KEY (order_id) REFERENCES payment_order (order_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_transaction_clinic FOREIGN KEY (clinic_id) REFERENCES clinic (clinic_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_transaction_requester FOREIGN KEY (requested_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_transaction_recorder FOREIGN KEY (recorded_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_transaction_confirmer FOREIGN KEY (confirmed_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_payment_transaction_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Mock online and staff-recorded offline payment attempts';

CREATE TABLE deposit_application (
  application_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  deposit_order_id BIGINT UNSIGNED NOT NULL,
  settlement_id BIGINT UNSIGNED NOT NULL,
  appointment_id BIGINT UNSIGNED NOT NULL,
  amount_applied DECIMAL(14,2) NOT NULL,
  status ENUM('APPLIED','PENDING_REVIEW','RELEASED') NOT NULL DEFAULT 'APPLIED',
  applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  released_at DATETIME(6) NULL,
  released_by_user_id BIGINT UNSIGNED NULL,
  release_reason VARCHAR(255) NULL,
  active_deposit_order_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN status IN ('APPLIED','PENDING_REVIEW') THEN deposit_order_id ELSE NULL END
  ) STORED,
  active_settlement_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN status IN ('APPLIED','PENDING_REVIEW') THEN settlement_id ELSE NULL END
  ) STORED,
  PRIMARY KEY (application_id),
  UNIQUE KEY uq_deposit_application_source (deposit_order_id, settlement_id),
  UNIQUE KEY uq_deposit_application_active_deposit (active_deposit_order_id),
  UNIQUE KEY uq_deposit_application_active_settlement (active_settlement_id),
  KEY idx_deposit_application_settlement (settlement_id, status),
  KEY idx_deposit_application_appointment (appointment_id),
  CONSTRAINT fk_deposit_application_order FOREIGN KEY (deposit_order_id) REFERENCES payment_order (order_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_deposit_application_settlement FOREIGN KEY (settlement_id) REFERENCES settlement (settlement_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_deposit_application_appointment FOREIGN KEY (appointment_id) REFERENCES appointment (appointment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_deposit_application_releaser FOREIGN KEY (released_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_deposit_application_amount CHECK (amount_applied > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Deposit applied to an ACTIVE settlement';

CREATE TABLE settlement_exception (
  exception_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  exception_no VARCHAR(32) NOT NULL,
  settlement_id BIGINT UNSIGNED NOT NULL,
  appointment_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  deposit_order_id BIGINT UNSIGNED NULL,
  deposit_application_id BIGINT UNSIGNED NULL,
  balance_order_id BIGINT UNSIGNED NULL,
  exception_type ENUM('VOID_WITH_DEPOSIT','VOID_WITH_BALANCE','VOID_WITH_BOTH') NOT NULL,
  status ENUM('PENDING','IN_REVIEW','RESOLVED_REFUND','RESOLVED_RESETTLE','CLOSED') NOT NULL DEFAULT 'PENDING',
  detected_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(6) NULL,
  resolution_note VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (exception_id),
  UNIQUE KEY uq_settlement_exception_no (exception_no),
  UNIQUE KEY uq_settlement_exception_settlement_type (settlement_id, exception_type),
  KEY idx_settlement_exception_status (status, detected_at),
  KEY idx_settlement_exception_patient (patient_id),
  CONSTRAINT fk_settlement_exception_settlement FOREIGN KEY (settlement_id) REFERENCES settlement (settlement_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_settlement_exception_appointment FOREIGN KEY (appointment_id) REFERENCES appointment (appointment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_settlement_exception_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_settlement_exception_deposit_order FOREIGN KEY (deposit_order_id) REFERENCES payment_order (order_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_settlement_exception_deposit_application FOREIGN KEY (deposit_application_id) REFERENCES deposit_application (application_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_settlement_exception_balance_order FOREIGN KEY (balance_order_id) REFERENCES payment_order (order_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_settlement_exception_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Manual review queue for settlement void with funds';

CREATE TABLE refund (
  refund_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  refund_no VARCHAR(32) NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  payment_transaction_id BIGINT UNSIGNED NULL,
  appointment_id BIGINT UNSIGNED NULL,
  appointment_change_id BIGINT UNSIGNED NULL,
  settlement_id BIGINT UNSIGNED NULL,
  deposit_application_id BIGINT UNSIGNED NULL,
  settlement_exception_id BIGINT UNSIGNED NULL,
  reason_code ENUM('PATIENT_EARLY_CANCEL','CLINIC_CANCEL','DEPOSIT_DIFFERENCE','PAYMENT_AFTER_CLOSE_COMPENSATION','SETTLEMENT_VOID_MANUAL','NO_SHOW_EXCEPTION','OTHER') NOT NULL,
  reason_text VARCHAR(255) NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'CNY',
  status ENUM('PENDING_REVIEW','NEEDS_INFO','APPROVED','PROCESSING','SUCCEEDED','REJECTED','FAILED','WITHDRAWN') NOT NULL DEFAULT 'PENDING_REVIEW',
  requested_by_type ENUM('PATIENT','STAFF','SYSTEM') NOT NULL,
  requested_by_user_id BIGINT UNSIGNED NULL,
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(6) NULL,
  review_note VARCHAR(500) NULL,
  processed_by_user_id BIGINT UNSIGNED NULL,
  processed_at DATETIME(6) NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  refund_key VARCHAR(160) NOT NULL,
  failure_code VARCHAR(64) NULL,
  failure_message VARCHAR(255) NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (refund_id),
  UNIQUE KEY uq_refund_no (refund_no),
  UNIQUE KEY uq_refund_key (refund_key),
  UNIQUE KEY uq_refund_idempotency (order_id, idempotency_key),
  KEY idx_refund_status (status, created_at),
  KEY idx_refund_order (order_id, status),
  CONSTRAINT fk_refund_order FOREIGN KEY (order_id) REFERENCES payment_order (order_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refund_transaction FOREIGN KEY (payment_transaction_id) REFERENCES payment_transaction (transaction_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refund_appointment FOREIGN KEY (appointment_id) REFERENCES appointment (appointment_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refund_change FOREIGN KEY (appointment_change_id) REFERENCES appointment_change (change_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refund_settlement FOREIGN KEY (settlement_id) REFERENCES settlement (settlement_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refund_deposit_application FOREIGN KEY (deposit_application_id) REFERENCES deposit_application (application_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refund_settlement_exception FOREIGN KEY (settlement_exception_id) REFERENCES settlement_exception (exception_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refund_requester FOREIGN KEY (requested_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refund_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refund_processor FOREIGN KEY (processed_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_refund_amount CHECK (amount > 0),
  CONSTRAINT chk_refund_reviewer_separation CHECK (
    reviewed_by_user_id IS NULL OR requested_by_user_id IS NULL OR reviewed_by_user_id <> requested_by_user_id
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Refund tasks with explicit review and processing states';

CREATE TABLE refund_allocation (
  allocation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  refund_id BIGINT UNSIGNED NOT NULL,
  payment_transaction_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (allocation_id),
  UNIQUE KEY uq_refund_allocation (refund_id, payment_transaction_id),
  KEY idx_refund_allocation_transaction (payment_transaction_id),
  CONSTRAINT fk_refund_allocation_refund FOREIGN KEY (refund_id) REFERENCES refund (refund_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_refund_allocation_transaction FOREIGN KEY (payment_transaction_id) REFERENCES payment_transaction (transaction_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_refund_allocation_amount CHECK (amount > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Allocates a refund across one or more successful payments';

CREATE TABLE notification (
  notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM(
    'APPOINTMENT_CREATED','APPOINTMENT_CONFIRMED','APPOINTMENT_CANCELLED','APPOINTMENT_EXPIRED',
    'PAYMENT_SUCCEEDED','PAYMENT_FAILED','REFUND_PENDING_REVIEW','REFUND_NEEDS_INFO','REFUND_APPROVED',
    'REFUND_REJECTED','REFUND_FAILED','REFUND_SUCCEEDED','BALANCE_DUE','BINDING_APPROVED','BINDING_REJECTED',
    'SETTLEMENT_VOID_PENDING_REVIEW','SYSTEM'
  ) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500) NOT NULL,
  related_entity_type VARCHAR(64) NULL,
  related_entity_id VARCHAR(64) NULL,
  dedupe_key VARCHAR(160) NULL,
  read_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (notification_id),
  UNIQUE KEY uq_notification_dedupe (dedupe_key),
  KEY idx_notification_user_read (user_id, read_at, created_at),
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='In-app patient notifications';
