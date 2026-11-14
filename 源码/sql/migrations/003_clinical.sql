-- 003_clinical.sql
-- Additive clinical module: treatment plans, graphical tooth chart, recalls.
-- Does not drop, truncate or reset existing business tables.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS treatment_plan (
  plan_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_no VARCHAR(32) NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  clinic_id BIGINT UNSIGNED NOT NULL,
  dentist_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  status ENUM('DRAFT','PRESENTED','ACCEPTED','IN_PROGRESS','COMPLETED','DECLINED') NOT NULL DEFAULT 'DRAFT',
  notes VARCHAR(1000) NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (plan_id),
  UNIQUE KEY uq_treatment_plan_no (plan_no),
  KEY idx_treatment_plan_patient_status (patient_id, status, updated_at),
  KEY idx_treatment_plan_clinic_status (clinic_id, status, updated_at),
  KEY idx_treatment_plan_dentist (dentist_id, updated_at),
  CONSTRAINT fk_treatment_plan_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_treatment_plan_clinic FOREIGN KEY (clinic_id) REFERENCES clinic (clinic_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_treatment_plan_dentist FOREIGN KEY (dentist_id) REFERENCES dentist_profile (dentist_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_treatment_plan_created_by FOREIGN KEY (created_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OpenDental-style treatment plan header';

CREATE TABLE IF NOT EXISTS treatment_plan_item (
  item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id BIGINT UNSIGNED NOT NULL,
  treatment_item_id BIGINT UNSIGNED NOT NULL,
  tooth_no VARCHAR(4) NULL COMMENT 'FDI tooth number, e.g. 11-48',
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  status ENUM('PLANNED','SCHEDULED','COMPLETED','DECLINED') NOT NULL DEFAULT 'PLANNED',
  sequence_no INT UNSIGNED NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (item_id),
  KEY idx_treatment_plan_item_plan (plan_id, sequence_no),
  KEY idx_treatment_plan_item_treatment (treatment_item_id),
  CONSTRAINT fk_treatment_plan_item_plan FOREIGN KEY (plan_id) REFERENCES treatment_plan (plan_id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_treatment_plan_item_treatment FOREIGN KEY (treatment_item_id) REFERENCES treatment_item (treatment_item_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_treatment_plan_item_quantity CHECK (quantity > 0),
  CONSTRAINT chk_treatment_plan_item_price CHECK (unit_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Planned procedures in a treatment plan';

CREATE TABLE IF NOT EXISTS tooth_record (
  tooth_record_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  tooth_no VARCHAR(4) NOT NULL COMMENT 'FDI tooth number, e.g. 11-48',
  condition_code ENUM('HEALTHY','CARIES','FILLING','CROWN','ROOT_CANAL','IMPLANT','MISSING','FRACTURE','SENSITIVE') NOT NULL DEFAULT 'HEALTHY',
  surface VARCHAR(12) NULL,
  note VARCHAR(255) NULL,
  recorded_by_user_id BIGINT UNSIGNED NOT NULL,
  recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (tooth_record_id),
  UNIQUE KEY uq_tooth_record_patient_tooth (patient_id, tooth_no),
  KEY idx_tooth_record_condition (patient_id, condition_code),
  CONSTRAINT fk_tooth_record_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tooth_record_recorded_by FOREIGN KEY (recorded_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OpenDental-style graphical tooth chart record';

CREATE TABLE IF NOT EXISTS patient_recall (
  recall_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  recall_type ENUM('EXAM','CLEANING','PERIO','ORTHO') NOT NULL DEFAULT 'EXAM',
  due_date DATE NOT NULL,
  status ENUM('DUE','SCHEDULED','COMPLETED','DISMISSED') NOT NULL DEFAULT 'DUE',
  note VARCHAR(255) NULL,
  completed_visit_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (recall_id),
  UNIQUE KEY uq_patient_recall_type_due (patient_id, recall_type, due_date),
  KEY idx_patient_recall_status_due (status, due_date),
  KEY idx_patient_recall_patient (patient_id, due_date),
  CONSTRAINT fk_patient_recall_patient FOREIGN KEY (patient_id) REFERENCES patient (patient_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_patient_recall_visit FOREIGN KEY (completed_visit_id) REFERENCES visit (visit_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_patient_recall_created_by FOREIGN KEY (created_by_user_id) REFERENCES user_account (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='OpenDental-style recall/reminder';
