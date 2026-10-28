-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: localhost    Database: dental_clinic_db
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `dental_clinic_db`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `dental_clinic_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `dental_clinic_db`;

--
-- Table structure for table `appointment`
--

DROP TABLE IF EXISTS `appointment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment` (
  `appointment_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `appointment_no` varchar(32) NOT NULL,
  `patient_id` bigint unsigned NOT NULL,
  `dentist_id` bigint unsigned NOT NULL,
  `clinic_id` bigint unsigned NOT NULL,
  `schedule_id` bigint unsigned NOT NULL,
  `scheduled_start_at` datetime(6) NOT NULL COMMENT 'Appointment start in UTC',
  `scheduled_end_at` datetime(6) NOT NULL COMMENT 'Appointment end in UTC, exclusive',
  `expected_treatment` varchar(500) NOT NULL,
  `status` enum('SCHEDULED','ATTENDED','NO_SHOW','CANCELLED','RESCHEDULED') NOT NULL DEFAULT 'SCHEDULED',
  `attendance_flag` tinyint(1) GENERATED ALWAYS AS ((case when (`status` = _utf8mb4'ATTENDED') then 1 else 0 end)) STORED,
  `cancellation_reason` varchar(255) DEFAULT NULL,
  `cancellation_initiator` enum('PATIENT','CLINIC') DEFAULT NULL,
  `attendance_recorded_by_user_id` bigint unsigned DEFAULT NULL,
  `attendance_recorded_at` datetime(6) DEFAULT NULL,
  `created_by_user_id` bigint unsigned NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`appointment_id`),
  UNIQUE KEY `uq_appointment_no` (`appointment_no`),
  KEY `idx_appointment_patient_status` (`patient_id`,`status`),
  KEY `idx_appointment_dentist_status_time` (`dentist_id`,`status`,`scheduled_start_at`,`scheduled_end_at`),
  KEY `idx_appointment_clinic_status_time` (`clinic_id`,`status`,`scheduled_start_at`,`scheduled_end_at`),
  KEY `idx_appointment_attendance_user` (`attendance_recorded_by_user_id`),
  KEY `idx_appointment_created_by` (`created_by_user_id`),
  KEY `fk_appointment_schedule_identity` (`schedule_id`,`dentist_id`,`clinic_id`),
  CONSTRAINT `fk_appointment_attendance_user` FOREIGN KEY (`attendance_recorded_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_appointment_created_by` FOREIGN KEY (`created_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_appointment_patient` FOREIGN KEY (`patient_id`) REFERENCES `patient` (`patient_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_appointment_schedule_identity` FOREIGN KEY (`schedule_id`, `dentist_id`, `clinic_id`) REFERENCES `dentist_schedule` (`schedule_id`, `dentist_id`, `clinic_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_appointment_time` CHECK ((`scheduled_end_at` > `scheduled_start_at`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Actual patient appointments';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appointment`
--

LOCK TABLES `appointment` WRITE;
/*!40000 ALTER TABLE `appointment` DISABLE KEYS */;
/*!40000 ALTER TABLE `appointment` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `appointment_change`
--

DROP TABLE IF EXISTS `appointment_change`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment_change` (
  `change_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `original_appointment_id` bigint unsigned NOT NULL,
  `new_appointment_id` bigint unsigned DEFAULT NULL,
  `change_type` enum('CANCEL','RESCHEDULE') NOT NULL,
  `reason` varchar(255) NOT NULL,
  `initiator_party` enum('PATIENT','CLINIC') NOT NULL,
  `handled_by_user_id` bigint unsigned NOT NULL,
  `changed_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`change_id`),
  UNIQUE KEY `uq_appointment_change_new` (`new_appointment_id`),
  KEY `idx_appointment_change_original_time` (`original_appointment_id`,`changed_at`),
  KEY `idx_appointment_change_handler_time` (`handled_by_user_id`,`changed_at`),
  CONSTRAINT `fk_appointment_change_handler` FOREIGN KEY (`handled_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_appointment_change_new` FOREIGN KEY (`new_appointment_id`) REFERENCES `appointment` (`appointment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_appointment_change_original` FOREIGN KEY (`original_appointment_id`) REFERENCES `appointment` (`appointment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_appointment_change_new_diff` CHECK (((`new_appointment_id` is null) or (`new_appointment_id` <> `original_appointment_id`))),
  CONSTRAINT `chk_appointment_change_type` CHECK ((((`change_type` = _utf8mb4'CANCEL') and (`new_appointment_id` is null)) or ((`change_type` = _utf8mb4'RESCHEDULE') and (`new_appointment_id` is not null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Appointment cancellation and reschedule history';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appointment_change`
--

LOCK TABLES `appointment_change` WRITE;
/*!40000 ALTER TABLE `appointment_change` DISABLE KEYS */;
/*!40000 ALTER TABLE `appointment_change` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `log_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actor_user_id` bigint unsigned DEFAULT NULL COMMENT 'NULL for system-generated actions',
  `action_type` enum('CREATE','UPDATE','CANCEL','RESCHEDULE','ATTEND','NO_SHOW','CREATE_SCHEDULE','UPDATE_SCHEDULE','CREATE_COST','VERIFY_COST','REJECT_COST','CREATE_SETTLEMENT','VOID_SETTLEMENT','REGENERATE_SETTLEMENT','CONFIRM_PERFORMANCE_SNAPSHOT','CORRECT_PERFORMANCE_SNAPSHOT','VIEW_PERFORMANCE_SNAPSHOT','QUERY','EXPORT','LOGIN') NOT NULL,
  `entity_type` varchar(64) NOT NULL,
  `entity_id` varchar(64) DEFAULT NULL,
  `related_entity_id` varchar(64) DEFAULT NULL,
  `correlation_id` char(36) DEFAULT NULL,
  `before_status` varchar(32) DEFAULT NULL,
  `after_status` varchar(32) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `occurred_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `details_json` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`log_id`),
  KEY `idx_audit_actor_time` (`actor_user_id`,`occurred_at`),
  KEY `idx_audit_entity_time` (`entity_type`,`entity_id`,`occurred_at`),
  KEY `idx_audit_action_time` (`action_type`,`occurred_at`),
  KEY `idx_audit_correlation` (`correlation_id`),
  KEY `idx_audit_entity_status_time` (`entity_type`,`entity_id`,`after_status`,`occurred_at`),
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Append-only business audit log';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_log`
--

LOCK TABLES `audit_log` WRITE;
/*!40000 ALTER TABLE `audit_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `clinic`
--

DROP TABLE IF EXISTS `clinic`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clinic` (
  `clinic_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `clinic_no` varchar(32) NOT NULL COMMENT 'Unique clinic business number',
  `postal_address` varchar(255) NOT NULL,
  `manager_name` varchar(100) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(254) DEFAULT NULL,
  `office_area_sqm` decimal(10,2) NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`clinic_id`),
  UNIQUE KEY `uq_clinic_no` (`clinic_no`),
  KEY `idx_clinic_address` (`postal_address`),
  KEY `idx_clinic_phone` (`phone`),
  KEY `idx_clinic_status` (`status`),
  CONSTRAINT `chk_clinic_area_positive` CHECK ((`office_area_sqm` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Clinic master data';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clinic`
--

LOCK TABLES `clinic` WRITE;
/*!40000 ALTER TABLE `clinic` DISABLE KEYS */;
/*!40000 ALTER TABLE `clinic` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dentist_profile`
--

DROP TABLE IF EXISTS `dentist_profile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dentist_profile` (
  `dentist_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `employee_no` varchar(32) NOT NULL,
  `birth_date` date NOT NULL,
  `home_address` varchar(255) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(254) NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`dentist_id`),
  UNIQUE KEY `uq_dentist_profile_user` (`user_id`),
  UNIQUE KEY `uq_dentist_profile_employee_no` (`employee_no`),
  KEY `idx_dentist_profile_phone` (`phone`),
  KEY `idx_dentist_profile_email` (`email`),
  CONSTRAINT `fk_dentist_profile_user` FOREIGN KEY (`user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Dentist-specific business profile';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dentist_profile`
--

LOCK TABLES `dentist_profile` WRITE;
/*!40000 ALTER TABLE `dentist_profile` DISABLE KEYS */;
/*!40000 ALTER TABLE `dentist_profile` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dentist_qualification`
--

DROP TABLE IF EXISTS `dentist_qualification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dentist_qualification` (
  `dentist_id` bigint unsigned NOT NULL,
  `qualification_id` bigint unsigned NOT NULL,
  `obtained_date` date DEFAULT NULL,
  `verification_status` enum('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `verified_by_user_id` bigint unsigned DEFAULT NULL,
  `verified_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`dentist_id`,`qualification_id`),
  KEY `idx_dentist_qualification_qualification` (`qualification_id`,`verification_status`),
  KEY `idx_dentist_qualification_verifier` (`verified_by_user_id`),
  CONSTRAINT `fk_dentist_qualification_dentist` FOREIGN KEY (`dentist_id`) REFERENCES `dentist_profile` (`dentist_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dentist_qualification_qualification` FOREIGN KEY (`qualification_id`) REFERENCES `qualification` (`qualification_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dentist_qualification_verifier` FOREIGN KEY (`verified_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Dentist qualification assignments';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dentist_qualification`
--

LOCK TABLES `dentist_qualification` WRITE;
/*!40000 ALTER TABLE `dentist_qualification` DISABLE KEYS */;
/*!40000 ALTER TABLE `dentist_qualification` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dentist_schedule`
--

DROP TABLE IF EXISTS `dentist_schedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dentist_schedule` (
  `schedule_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dentist_id` bigint unsigned NOT NULL,
  `clinic_id` bigint unsigned NOT NULL,
  `available_start_at` datetime(6) NOT NULL COMMENT 'Available window start in UTC',
  `available_end_at` datetime(6) NOT NULL COMMENT 'Available window end in UTC, exclusive',
  `transfer_minutes` smallint unsigned DEFAULT NULL,
  `status` enum('DRAFT','PUBLISHED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `coordinator_user_id` bigint unsigned NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`schedule_id`),
  UNIQUE KEY `uq_dentist_schedule_identity` (`schedule_id`,`dentist_id`,`clinic_id`),
  UNIQUE KEY `uq_dentist_schedule_start` (`dentist_id`,`available_start_at`),
  KEY `idx_dentist_schedule_dentist_status` (`dentist_id`,`status`,`available_start_at`),
  KEY `idx_dentist_schedule_clinic_window` (`clinic_id`,`available_start_at`,`available_end_at`),
  KEY `idx_dentist_schedule_coordinator` (`coordinator_user_id`),
  CONSTRAINT `fk_dentist_schedule_clinic` FOREIGN KEY (`clinic_id`) REFERENCES `clinic` (`clinic_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dentist_schedule_coordinator` FOREIGN KEY (`coordinator_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_dentist_schedule_dentist` FOREIGN KEY (`dentist_id`) REFERENCES `dentist_profile` (`dentist_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_dentist_schedule_time` CHECK ((`available_end_at` > `available_start_at`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Dentist availability windows by clinic';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dentist_schedule`
--

LOCK TABLES `dentist_schedule` WRITE;
/*!40000 ALTER TABLE `dentist_schedule` DISABLE KEYS */;
/*!40000 ALTER TABLE `dentist_schedule` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient`
--

DROP TABLE IF EXISTS `patient`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patient` (
  `patient_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `patient_no` varchar(32) NOT NULL COMMENT 'Global patient number, used as the shared patient identifier',
  `patient_name` varchar(100) NOT NULL,
  `birth_date` date NOT NULL,
  `billing_address` varchar(255) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(254) DEFAULT NULL,
  `emergency_contact_name` varchar(100) NOT NULL,
  `emergency_contact_phone` varchar(32) NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`patient_id`),
  UNIQUE KEY `uq_patient_no` (`patient_no`),
  KEY `idx_patient_name_phone` (`patient_name`,`phone`),
  KEY `idx_patient_birth_phone` (`birth_date`,`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Shared patient master data';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient`
--

LOCK TABLES `patient` WRITE;
/*!40000 ALTER TABLE `patient` DISABLE KEYS */;
/*!40000 ALTER TABLE `patient` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_allergy`
--

DROP TABLE IF EXISTS `patient_allergy`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patient_allergy` (
  `allergy_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `patient_id` bigint unsigned NOT NULL,
  `allergy_name` varchar(100) NOT NULL,
  `note` varchar(255) DEFAULT NULL,
  `confirmation_status` enum('CONFIRMED','PENDING') NOT NULL DEFAULT 'PENDING',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`allergy_id`),
  UNIQUE KEY `uq_patient_allergy_name` (`patient_id`,`allergy_name`),
  KEY `idx_patient_allergy_status` (`patient_id`,`confirmation_status`),
  CONSTRAINT `fk_patient_allergy_patient` FOREIGN KEY (`patient_id`) REFERENCES `patient` (`patient_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Patient allergy records';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_allergy`
--

LOCK TABLES `patient_allergy` WRITE;
/*!40000 ALTER TABLE `patient_allergy` DISABLE KEYS */;
/*!40000 ALTER TABLE `patient_allergy` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `patient_clinic_relation`
--

DROP TABLE IF EXISTS `patient_clinic_relation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `patient_clinic_relation` (
  `patient_id` bigint unsigned NOT NULL,
  `clinic_id` bigint unsigned NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`patient_id`,`clinic_id`),
  KEY `idx_patient_clinic_relation_clinic` (`clinic_id`,`patient_id`),
  CONSTRAINT `fk_patient_clinic_relation_clinic` FOREIGN KEY (`clinic_id`) REFERENCES `clinic` (`clinic_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_patient_clinic_relation_patient` FOREIGN KEY (`patient_id`) REFERENCES `patient` (`patient_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Patient relationship with clinics';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `patient_clinic_relation`
--

LOCK TABLES `patient_clinic_relation` WRITE;
/*!40000 ALTER TABLE `patient_clinic_relation` DISABLE KEYS */;
/*!40000 ALTER TABLE `patient_clinic_relation` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `qualification`
--

DROP TABLE IF EXISTS `qualification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qualification` (
  `qualification_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `qualification_name` varchar(100) NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`qualification_id`),
  UNIQUE KEY `uq_qualification_name` (`qualification_name`),
  KEY `idx_qualification_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Qualification and skill dictionary';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `qualification`
--

LOCK TABLES `qualification` WRITE;
/*!40000 ALTER TABLE `qualification` DISABLE KEYS */;
/*!40000 ALTER TABLE `qualification` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quarterly_cost_entry`
--

DROP TABLE IF EXISTS `quarterly_cost_entry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quarterly_cost_entry` (
  `cost_entry_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cost_entry_no` varchar(32) NOT NULL,
  `dentist_id` bigint unsigned NOT NULL,
  `clinic_id` bigint unsigned DEFAULT NULL,
  `period_year` smallint unsigned NOT NULL,
  `quarter_no` tinyint unsigned NOT NULL,
  `cost_type` enum('MEDICAL_SUPPLIES','OPERATING_EXPENSE') NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `source_document_no` varchar(64) DEFAULT NULL,
  `source_line_no` varchar(32) DEFAULT NULL,
  `allocation_basis` varchar(255) NOT NULL,
  `status` enum('DRAFT','VERIFIED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  `recorded_by_user_id` bigint unsigned NOT NULL,
  `verified_by_user_id` bigint unsigned DEFAULT NULL,
  `recorded_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `verified_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`cost_entry_id`),
  UNIQUE KEY `uq_quarterly_cost_entry_no` (`cost_entry_no`),
  KEY `idx_quarterly_cost_period` (`period_year`,`quarter_no`,`dentist_id`,`cost_type`,`status`),
  KEY `idx_quarterly_cost_source` (`source_document_no`,`source_line_no`,`dentist_id`,`clinic_id`,`cost_type`),
  KEY `idx_quarterly_cost_clinic` (`clinic_id`),
  KEY `idx_quarterly_cost_verifier` (`verified_by_user_id`),
  KEY `fk_quarterly_cost_dentist` (`dentist_id`),
  KEY `fk_quarterly_cost_recorder` (`recorded_by_user_id`),
  CONSTRAINT `fk_quarterly_cost_clinic` FOREIGN KEY (`clinic_id`) REFERENCES `clinic` (`clinic_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_quarterly_cost_dentist` FOREIGN KEY (`dentist_id`) REFERENCES `dentist_profile` (`dentist_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_quarterly_cost_recorder` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_quarterly_cost_verifier` FOREIGN KEY (`verified_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_quarterly_cost_amount` CHECK ((`amount` >= 0)),
  CONSTRAINT `chk_quarterly_cost_quarter` CHECK ((`quarter_no` between 1 and 4))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Quarterly costs attributed to dentists';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quarterly_cost_entry`
--

LOCK TABLES `quarterly_cost_entry` WRITE;
/*!40000 ALTER TABLE `quarterly_cost_entry` DISABLE KEYS */;
/*!40000 ALTER TABLE `quarterly_cost_entry` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quarterly_performance_snapshot`
--

DROP TABLE IF EXISTS `quarterly_performance_snapshot`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quarterly_performance_snapshot` (
  `snapshot_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `snapshot_no` varchar(32) NOT NULL,
  `dentist_id` bigint unsigned NOT NULL,
  `period_year` smallint unsigned NOT NULL,
  `quarter_no` tinyint unsigned NOT NULL,
  `version_no` int unsigned NOT NULL,
  `recognized_revenue` decimal(14,2) NOT NULL,
  `medical_supply_cost` decimal(14,2) NOT NULL,
  `operating_expense` decimal(14,2) NOT NULL,
  `net_profit` decimal(14,2) NOT NULL,
  `data_complete_status` enum('COMPLETE') NOT NULL DEFAULT 'COMPLETE',
  `settled_visit_count` int unsigned NOT NULL,
  `unsettled_visit_count` int unsigned NOT NULL,
  `data_cutoff_at` datetime(6) NOT NULL,
  `confirmed_by_user_id` bigint unsigned NOT NULL,
  `confirmed_at` datetime(6) NOT NULL,
  `correction_reason` varchar(500) DEFAULT NULL,
  `supersedes_snapshot_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`snapshot_id`),
  UNIQUE KEY `uq_snapshot_no` (`snapshot_no`),
  UNIQUE KEY `uq_snapshot_report_version` (`dentist_id`,`period_year`,`quarter_no`,`version_no`),
  UNIQUE KEY `uq_snapshot_identity` (`snapshot_id`,`dentist_id`,`period_year`,`quarter_no`),
  UNIQUE KEY `uq_snapshot_supersedes` (`supersedes_snapshot_id`),
  KEY `idx_snapshot_period_confirmed` (`period_year`,`quarter_no`,`confirmed_at`),
  KEY `idx_snapshot_confirmer` (`confirmed_by_user_id`),
  KEY `idx_snapshot_supersedes_report` (`supersedes_snapshot_id`,`dentist_id`,`period_year`,`quarter_no`),
  CONSTRAINT `fk_snapshot_confirmer` FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_snapshot_dentist` FOREIGN KEY (`dentist_id`) REFERENCES `dentist_profile` (`dentist_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_snapshot_supersedes_report` FOREIGN KEY (`supersedes_snapshot_id`, `dentist_id`, `period_year`, `quarter_no`) REFERENCES `quarterly_performance_snapshot` (`snapshot_id`, `dentist_id`, `period_year`, `quarter_no`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_snapshot_complete` CHECK ((`data_complete_status` = _utf8mb4'COMPLETE')),
  CONSTRAINT `chk_snapshot_cutoff` CHECK ((`data_cutoff_at` <= `confirmed_at`)),
  CONSTRAINT `chk_snapshot_first_version` CHECK (((`version_no` <> 1) or ((`correction_reason` is null) and (`supersedes_snapshot_id` is null)))),
  CONSTRAINT `chk_snapshot_later_version` CHECK (((`version_no` = 1) or ((`correction_reason` is not null) and (`supersedes_snapshot_id` is not null)))),
  CONSTRAINT `chk_snapshot_net_profit` CHECK ((`net_profit` = ((`recognized_revenue` - `medical_supply_cost`) - `operating_expense`))),
  CONSTRAINT `chk_snapshot_quarter` CHECK ((`quarter_no` between 1 and 4)),
  CONSTRAINT `chk_snapshot_unsettled` CHECK ((`unsettled_visit_count` = 0)),
  CONSTRAINT `chk_snapshot_version` CHECK ((`version_no` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Frozen confirmed quarterly performance snapshots';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quarterly_performance_snapshot`
--

LOCK TABLES `quarterly_performance_snapshot` WRITE;
/*!40000 ALTER TABLE `quarterly_performance_snapshot` DISABLE KEYS */;
/*!40000 ALTER TABLE `quarterly_performance_snapshot` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schedule_qualification`
--

DROP TABLE IF EXISTS `schedule_qualification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schedule_qualification` (
  `schedule_id` bigint unsigned NOT NULL,
  `qualification_id` bigint unsigned NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`schedule_id`,`qualification_id`),
  KEY `idx_schedule_qualification_qualification` (`qualification_id`,`schedule_id`),
  CONSTRAINT `fk_schedule_qualification_qualification` FOREIGN KEY (`qualification_id`) REFERENCES `qualification` (`qualification_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_schedule_qualification_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `dentist_schedule` (`schedule_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Required qualifications for a dentist schedule';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedule_qualification`
--

LOCK TABLES `schedule_qualification` WRITE;
/*!40000 ALTER TABLE `schedule_qualification` DISABLE KEYS */;
/*!40000 ALTER TABLE `schedule_qualification` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `settlement`
--

DROP TABLE IF EXISTS `settlement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `settlement` (
  `settlement_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `settlement_no` varchar(32) NOT NULL,
  `visit_id` bigint unsigned NOT NULL,
  `version_no` int unsigned NOT NULL,
  `settlement_date` datetime(6) NOT NULL COMMENT 'Business settlement date in UTC',
  `total_amount` decimal(14,2) NOT NULL,
  `status` enum('ACTIVE','VOID') NOT NULL DEFAULT 'ACTIVE',
  `activated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'First activation time in UTC, immutable',
  `voided_at` datetime(6) DEFAULT NULL COMMENT 'Void time in UTC, write-once',
  `replaces_settlement_id` bigint unsigned DEFAULT NULL,
  `void_reason` varchar(255) DEFAULT NULL,
  `voided_by_user_id` bigint unsigned DEFAULT NULL,
  `generated_by_user_id` bigint unsigned NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `active_visit_id` bigint unsigned GENERATED ALWAYS AS ((case when (`status` = _utf8mb4'ACTIVE') then `visit_id` else NULL end)) STORED,
  PRIMARY KEY (`settlement_id`),
  UNIQUE KEY `uq_settlement_no` (`settlement_no`),
  UNIQUE KEY `uq_settlement_visit_version` (`visit_id`,`version_no`),
  UNIQUE KEY `uq_settlement_active_visit` (`active_visit_id`),
  UNIQUE KEY `uq_settlement_replaces` (`replaces_settlement_id`),
  KEY `idx_settlement_visit_history` (`visit_id`,`activated_at`,`voided_at`),
  KEY `idx_settlement_date_status` (`settlement_date`,`status`),
  KEY `idx_settlement_generated_by` (`generated_by_user_id`),
  KEY `idx_settlement_voided_by` (`voided_by_user_id`),
  CONSTRAINT `fk_settlement_generated_by` FOREIGN KEY (`generated_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_settlement_replaces` FOREIGN KEY (`replaces_settlement_id`) REFERENCES `settlement` (`settlement_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_settlement_visit` FOREIGN KEY (`visit_id`) REFERENCES `visit` (`visit_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_settlement_voided_by` FOREIGN KEY (`voided_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_settlement_status_voided` CHECK ((((`status` = _utf8mb4'ACTIVE') and (`voided_at` is null)) or ((`status` = _utf8mb4'VOID') and (`voided_at` is not null)))),
  CONSTRAINT `chk_settlement_total` CHECK ((`total_amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Settlement versions and current status';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `settlement`
--

LOCK TABLES `settlement` WRITE;
/*!40000 ALTER TABLE `settlement` DISABLE KEYS */;
/*!40000 ALTER TABLE `settlement` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `settlement_detail`
--

DROP TABLE IF EXISTS `settlement_detail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `settlement_detail` (
  `settlement_detail_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `settlement_id` bigint unsigned NOT NULL,
  `treatment_detail_id` bigint unsigned NOT NULL,
  `treatment_item_id` bigint unsigned NOT NULL,
  `treatment_name_snapshot` varchar(100) NOT NULL,
  `unit_quantity_snapshot` decimal(10,2) NOT NULL,
  `unit_price_snapshot` decimal(12,2) NOT NULL,
  `subtotal` decimal(14,2) NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`settlement_detail_id`),
  UNIQUE KEY `uq_settlement_detail_source` (`settlement_id`,`treatment_detail_id`),
  KEY `idx_settlement_detail_treatment` (`treatment_detail_id`),
  KEY `idx_settlement_detail_item` (`treatment_item_id`),
  CONSTRAINT `fk_settlement_detail_item` FOREIGN KEY (`treatment_item_id`) REFERENCES `treatment_item` (`treatment_item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_settlement_detail_settlement` FOREIGN KEY (`settlement_id`) REFERENCES `settlement` (`settlement_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_settlement_detail_treatment` FOREIGN KEY (`treatment_detail_id`) REFERENCES `treatment_detail` (`treatment_detail_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_settlement_detail_price` CHECK ((`unit_price_snapshot` >= 0)),
  CONSTRAINT `chk_settlement_detail_quantity` CHECK ((`unit_quantity_snapshot` > 0)),
  CONSTRAINT `chk_settlement_detail_subtotal` CHECK ((`subtotal` = (`unit_quantity_snapshot` * `unit_price_snapshot`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Immutable settlement line snapshots';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `settlement_detail`
--

LOCK TABLES `settlement_detail` WRITE;
/*!40000 ALTER TABLE `settlement_detail` DISABLE KEYS */;
/*!40000 ALTER TABLE `settlement_detail` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `treatment_detail`
--

DROP TABLE IF EXISTS `treatment_detail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `treatment_detail` (
  `treatment_detail_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `visit_id` bigint unsigned NOT NULL,
  `treatment_item_id` bigint unsigned NOT NULL,
  `unit_quantity` decimal(10,2) NOT NULL,
  `unit_price_snapshot` decimal(12,2) NOT NULL,
  `subtotal` decimal(14,2) GENERATED ALWAYS AS ((`unit_quantity` * `unit_price_snapshot`)) STORED,
  `status` enum('ACTIVE','VOID') NOT NULL DEFAULT 'ACTIVE',
  `void_reason` varchar(255) DEFAULT NULL,
  `voided_by_user_id` bigint unsigned DEFAULT NULL,
  `voided_at` datetime(6) DEFAULT NULL,
  `recorded_by_user_id` bigint unsigned NOT NULL,
  `recorded_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`treatment_detail_id`),
  KEY `idx_treatment_detail_visit` (`visit_id`),
  KEY `idx_treatment_detail_item` (`treatment_item_id`),
  KEY `idx_treatment_detail_recorded_at` (`recorded_at`),
  KEY `idx_treatment_detail_voided_by` (`voided_by_user_id`),
  KEY `idx_treatment_detail_recorded_by` (`recorded_by_user_id`),
  CONSTRAINT `fk_treatment_detail_item` FOREIGN KEY (`treatment_item_id`) REFERENCES `treatment_item` (`treatment_item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_treatment_detail_recorded_by` FOREIGN KEY (`recorded_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_treatment_detail_visit` FOREIGN KEY (`visit_id`) REFERENCES `visit` (`visit_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_treatment_detail_voided_by` FOREIGN KEY (`voided_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_treatment_detail_price` CHECK ((`unit_price_snapshot` >= 0)),
  CONSTRAINT `chk_treatment_detail_quantity` CHECK ((`unit_quantity` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Actual treatment lines with price snapshots';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `treatment_detail`
--

LOCK TABLES `treatment_detail` WRITE;
/*!40000 ALTER TABLE `treatment_detail` DISABLE KEYS */;
/*!40000 ALTER TABLE `treatment_detail` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `treatment_item`
--

DROP TABLE IF EXISTS `treatment_item`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `treatment_item` (
  `treatment_item_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `treatment_name` varchar(100) NOT NULL,
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`treatment_item_id`),
  UNIQUE KEY `uq_treatment_item_name` (`treatment_name`),
  KEY `idx_treatment_item_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Standard treatment catalog';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `treatment_item`
--

LOCK TABLES `treatment_item` WRITE;
/*!40000 ALTER TABLE `treatment_item` DISABLE KEYS */;
/*!40000 ALTER TABLE `treatment_item` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `treatment_price`
--

DROP TABLE IF EXISTS `treatment_price`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `treatment_price` (
  `price_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `treatment_item_id` bigint unsigned NOT NULL,
  `version_no` int unsigned NOT NULL,
  `standard_unit_price` decimal(12,2) NOT NULL,
  `effective_from` date NOT NULL,
  `approval_status` enum('DRAFT','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT',
  `approved_by_user_id` bigint unsigned DEFAULT NULL,
  `approved_at` datetime(6) DEFAULT NULL,
  `created_by_user_id` bigint unsigned NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`price_id`),
  UNIQUE KEY `uq_treatment_price_version` (`treatment_item_id`,`version_no`),
  UNIQUE KEY `uq_treatment_price_effective` (`treatment_item_id`,`effective_from`),
  KEY `idx_treatment_price_lookup` (`treatment_item_id`,`approval_status`,`effective_from`),
  KEY `idx_treatment_price_approver` (`approved_by_user_id`),
  KEY `idx_treatment_price_creator` (`created_by_user_id`),
  CONSTRAINT `fk_treatment_price_approver` FOREIGN KEY (`approved_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_treatment_price_creator` FOREIGN KEY (`created_by_user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_treatment_price_item` FOREIGN KEY (`treatment_item_id`) REFERENCES `treatment_item` (`treatment_item_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_treatment_price_approved_fields` CHECK (((`approval_status` <> _utf8mb4'APPROVED') or ((`approved_by_user_id` is not null) and (`approved_at` is not null)))),
  CONSTRAINT `chk_treatment_price_positive` CHECK ((`standard_unit_price` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Versioned standard treatment prices';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `treatment_price`
--

LOCK TABLES `treatment_price` WRITE;
/*!40000 ALTER TABLE `treatment_price` DISABLE KEYS */;
/*!40000 ALTER TABLE `treatment_price` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_account`
--

DROP TABLE IF EXISTS `user_account`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_account` (
  `user_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Primary account identifier',
  `username` varchar(64) NOT NULL COMMENT 'Unique login name',
  `password_hash` varchar(255) NOT NULL COMMENT 'Password hash, never a plaintext password',
  `display_name` varchar(100) NOT NULL COMMENT 'User-facing display name',
  `role_code` enum('FRONT_DESK','DENTIST','CLINIC_MANAGER','HQ_MANAGER') NOT NULL COMMENT 'Primary system role',
  `status` enum('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE' COMMENT 'Account status',
  `last_login_at` datetime(6) DEFAULT NULL COMMENT 'Last successful login time in UTC',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'Creation time in UTC',
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) COMMENT 'Last update time in UTC',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_account_username` (`username`),
  KEY `idx_user_account_role_status` (`role_code`,`status`),
  KEY `idx_user_account_display_name` (`display_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='System accounts and roles';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_account`
--

LOCK TABLES `user_account` WRITE;
/*!40000 ALTER TABLE `user_account` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_account` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_clinic_scope`
--

DROP TABLE IF EXISTS `user_clinic_scope`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_clinic_scope` (
  `user_id` bigint unsigned NOT NULL,
  `clinic_id` bigint unsigned NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`user_id`,`clinic_id`),
  KEY `idx_user_clinic_scope_clinic_user` (`clinic_id`,`user_id`),
  CONSTRAINT `fk_user_clinic_scope_clinic` FOREIGN KEY (`clinic_id`) REFERENCES `clinic` (`clinic_id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_user_clinic_scope_user` FOREIGN KEY (`user_id`) REFERENCES `user_account` (`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='User access scope by clinic';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_clinic_scope`
--

LOCK TABLES `user_clinic_scope` WRITE;
/*!40000 ALTER TABLE `user_clinic_scope` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_clinic_scope` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `v_quarterly_dentist_performance`
--

DROP TABLE IF EXISTS `v_quarterly_dentist_performance`;
/*!50001 DROP VIEW IF EXISTS `v_quarterly_dentist_performance`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_quarterly_dentist_performance` AS SELECT 
 1 AS `dentist_id`,
 1 AS `period_year`,
 1 AS `quarter_no`,
 1 AS `data_source`,
 1 AS `snapshot_id`,
 1 AS `snapshot_version_no`,
 1 AS `snapshot_confirmed_at`,
 1 AS `recognized_revenue`,
 1 AS `settled_visit_count`,
 1 AS `unsettled_visit_count_at_q_end`,
 1 AS `medical_supply_status`,
 1 AS `operating_expense_status`,
 1 AS `medical_supply_cost`,
 1 AS `operating_expense`,
 1 AS `draft_cost_entry_count`,
 1 AS `rejected_cost_entry_count`,
 1 AS `missing_cost_category_count`,
 1 AS `revenue_data_complete_flag`,
 1 AS `cost_data_complete_flag`,
 1 AS `performance_status`,
 1 AS `calculated_net_profit`,
 1 AS `data_cutoff_at`,
 1 AS `data_updated_at`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `visit`
--

DROP TABLE IF EXISTS `visit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visit` (
  `visit_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `visit_no` varchar(32) NOT NULL,
  `appointment_id` bigint unsigned NOT NULL,
  `visit_datetime` datetime(6) NOT NULL COMMENT 'Actual visit time in UTC',
  `patient_problem` varchar(1000) NOT NULL,
  `special_needs` varchar(1000) DEFAULT NULL,
  `status` enum('IN_PROGRESS','COMPLETED','VOID') NOT NULL DEFAULT 'IN_PROGRESS',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`visit_id`),
  UNIQUE KEY `uq_visit_no` (`visit_no`),
  UNIQUE KEY `uq_visit_appointment` (`appointment_id`),
  KEY `idx_visit_datetime` (`visit_datetime`),
  KEY `idx_visit_status` (`status`),
  CONSTRAINT `fk_visit_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `appointment` (`appointment_id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='Actual visits for scheduled appointments';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visit`
--

LOCK TABLES `visit` WRITE;
/*!40000 ALTER TABLE `visit` DISABLE KEYS */;
/*!40000 ALTER TABLE `visit` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'dental_clinic_db'
--

--
-- Dumping routines for database 'dental_clinic_db'
--

--
-- Current Database: `dental_clinic_db`
--

USE `dental_clinic_db`;

--
-- Final view structure for view `v_quarterly_dentist_performance`
--

/*!50001 DROP VIEW IF EXISTS `v_quarterly_dentist_performance`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_quarterly_dentist_performance` AS with `period_keys` as (select `period_source`.`dentist_id` AS `dentist_id`,`period_source`.`period_year` AS `period_year`,`period_source`.`quarter_no` AS `quarter_no` from (select `a`.`dentist_id` AS `dentist_id`,year(convert_tz(`s`.`settlement_date`,'+00:00','+08:00')) AS `period_year`,quarter(convert_tz(`s`.`settlement_date`,'+00:00','+08:00')) AS `quarter_no` from ((`settlement` `s` join `visit` `v` on((`v`.`visit_id` = `s`.`visit_id`))) join `appointment` `a` on((`a`.`appointment_id` = `v`.`appointment_id`))) where (`s`.`status` = 'ACTIVE') union select `a`.`dentist_id` AS `dentist_id`,year(convert_tz(`v`.`visit_datetime`,'+00:00','+08:00')) AS `period_year`,quarter(convert_tz(`v`.`visit_datetime`,'+00:00','+08:00')) AS `quarter_no` from (`visit` `v` join `appointment` `a` on((`a`.`appointment_id` = `v`.`appointment_id`))) union select `q`.`dentist_id` AS `dentist_id`,`q`.`period_year` AS `period_year`,`q`.`quarter_no` AS `quarter_no` from `quarterly_cost_entry` `q` union select `qs`.`dentist_id` AS `dentist_id`,`qs`.`period_year` AS `period_year`,`qs`.`quarter_no` AS `quarter_no` from `quarterly_performance_snapshot` `qs`) `period_source` group by `period_source`.`dentist_id`,`period_source`.`period_year`,`period_source`.`quarter_no`), `revenue` as (select `a`.`dentist_id` AS `dentist_id`,year(convert_tz(`s`.`settlement_date`,'+00:00','+08:00')) AS `period_year`,quarter(convert_tz(`s`.`settlement_date`,'+00:00','+08:00')) AS `quarter_no`,sum(`s`.`total_amount`) AS `recognized_revenue`,count(distinct `s`.`visit_id`) AS `settled_visit_count` from ((`settlement` `s` join `visit` `v` on((`v`.`visit_id` = `s`.`visit_id`))) join `appointment` `a` on((`a`.`appointment_id` = `v`.`appointment_id`))) where (`s`.`status` = 'ACTIVE') group by `a`.`dentist_id`,year(convert_tz(`s`.`settlement_date`,'+00:00','+08:00')),quarter(convert_tz(`s`.`settlement_date`,'+00:00','+08:00'))), `unsettled` as (select `pk`.`dentist_id` AS `dentist_id`,`pk`.`period_year` AS `period_year`,`pk`.`quarter_no` AS `quarter_no`,count(distinct `v`.`visit_id`) AS `unsettled_visit_count` from ((`period_keys` `pk` join `appointment` `a` on((`a`.`dentist_id` = `pk`.`dentist_id`))) join `visit` `v` on((`v`.`appointment_id` = `a`.`appointment_id`))) where ((year(convert_tz(`v`.`visit_datetime`,'+00:00','+08:00')) = `pk`.`period_year`) and (quarter(convert_tz(`v`.`visit_datetime`,'+00:00','+08:00')) = `pk`.`quarter_no`) and exists(select 1 from `settlement` `s` where ((`s`.`visit_id` = `v`.`visit_id`) and (`s`.`activated_at` < convert_tz((makedate(`pk`.`period_year`,1) + interval `pk`.`quarter_no` quarter),'+08:00','+00:00')) and ((`s`.`voided_at` is null) or (`s`.`voided_at` >= convert_tz((makedate(`pk`.`period_year`,1) + interval `pk`.`quarter_no` quarter),'+08:00','+00:00'))))) is false) group by `pk`.`dentist_id`,`pk`.`period_year`,`pk`.`quarter_no`), `cost_events` as (select `q`.`cost_entry_id` AS `cost_entry_id`,`q`.`dentist_id` AS `dentist_id`,`q`.`period_year` AS `period_year`,`q`.`quarter_no` AS `quarter_no`,`q`.`cost_type` AS `cost_type`,`q`.`amount` AS `amount`,`a`.`after_status` AS `after_status`,row_number() OVER (PARTITION BY `q`.`cost_entry_id`,`q`.`period_year`,`q`.`quarter_no` ORDER BY `a`.`occurred_at` desc,`a`.`log_id` desc )  AS `row_no` from (`quarterly_cost_entry` `q` join `audit_log` `a` on(((`a`.`entity_type` = 'quarterly_cost_entry') and (`a`.`entity_id` = `q`.`cost_entry_no`)))) where (`a`.`occurred_at` < convert_tz((makedate(`q`.`period_year`,1) + interval `q`.`quarter_no` quarter),'+08:00','+00:00'))), `cost_at_q_end` as (select `cost_events`.`cost_entry_id` AS `cost_entry_id`,`cost_events`.`dentist_id` AS `dentist_id`,`cost_events`.`period_year` AS `period_year`,`cost_events`.`quarter_no` AS `quarter_no`,`cost_events`.`cost_type` AS `cost_type`,`cost_events`.`amount` AS `amount`,`cost_events`.`after_status` AS `after_status` from `cost_events` where (`cost_events`.`row_no` = 1)), `cost_summary` as (select `cost_at_q_end`.`dentist_id` AS `dentist_id`,`cost_at_q_end`.`period_year` AS `period_year`,`cost_at_q_end`.`quarter_no` AS `quarter_no`,sum((case when ((`cost_at_q_end`.`cost_type` = 'MEDICAL_SUPPLIES') and (`cost_at_q_end`.`after_status` = 'DRAFT')) then 1 else 0 end)) AS `medical_draft_count`,sum((case when ((`cost_at_q_end`.`cost_type` = 'MEDICAL_SUPPLIES') and (`cost_at_q_end`.`after_status` = 'VERIFIED')) then 1 else 0 end)) AS `medical_verified_count`,sum((case when ((`cost_at_q_end`.`cost_type` = 'MEDICAL_SUPPLIES') and (`cost_at_q_end`.`after_status` = 'REJECTED')) then 1 else 0 end)) AS `medical_rejected_count`,sum((case when ((`cost_at_q_end`.`cost_type` = 'MEDICAL_SUPPLIES') and (`cost_at_q_end`.`after_status` = 'VERIFIED')) then `cost_at_q_end`.`amount` end)) AS `medical_verified_amount`,sum((case when ((`cost_at_q_end`.`cost_type` = 'OPERATING_EXPENSE') and (`cost_at_q_end`.`after_status` = 'DRAFT')) then 1 else 0 end)) AS `operating_draft_count`,sum((case when ((`cost_at_q_end`.`cost_type` = 'OPERATING_EXPENSE') and (`cost_at_q_end`.`after_status` = 'VERIFIED')) then 1 else 0 end)) AS `operating_verified_count`,sum((case when ((`cost_at_q_end`.`cost_type` = 'OPERATING_EXPENSE') and (`cost_at_q_end`.`after_status` = 'REJECTED')) then 1 else 0 end)) AS `operating_rejected_count`,sum((case when ((`cost_at_q_end`.`cost_type` = 'OPERATING_EXPENSE') and (`cost_at_q_end`.`after_status` = 'VERIFIED')) then `cost_at_q_end`.`amount` end)) AS `operating_verified_amount` from `cost_at_q_end` group by `cost_at_q_end`.`dentist_id`,`cost_at_q_end`.`period_year`,`cost_at_q_end`.`quarter_no`), `snapshot_latest_raw` as (select `qs`.`snapshot_id` AS `snapshot_id`,`qs`.`snapshot_no` AS `snapshot_no`,`qs`.`dentist_id` AS `dentist_id`,`qs`.`period_year` AS `period_year`,`qs`.`quarter_no` AS `quarter_no`,`qs`.`version_no` AS `version_no`,`qs`.`recognized_revenue` AS `recognized_revenue`,`qs`.`medical_supply_cost` AS `medical_supply_cost`,`qs`.`operating_expense` AS `operating_expense`,`qs`.`net_profit` AS `net_profit`,`qs`.`data_complete_status` AS `data_complete_status`,`qs`.`settled_visit_count` AS `settled_visit_count`,`qs`.`unsettled_visit_count` AS `unsettled_visit_count`,`qs`.`data_cutoff_at` AS `data_cutoff_at`,`qs`.`confirmed_by_user_id` AS `confirmed_by_user_id`,`qs`.`confirmed_at` AS `confirmed_at`,row_number() OVER (PARTITION BY `qs`.`dentist_id`,`qs`.`period_year`,`qs`.`quarter_no` ORDER BY `qs`.`version_no` desc )  AS `row_no` from `quarterly_performance_snapshot` `qs` where (`qs`.`data_complete_status` = 'COMPLETE')), `snapshot_latest` as (select `snapshot_latest_raw`.`snapshot_id` AS `snapshot_id`,`snapshot_latest_raw`.`snapshot_no` AS `snapshot_no`,`snapshot_latest_raw`.`dentist_id` AS `dentist_id`,`snapshot_latest_raw`.`period_year` AS `period_year`,`snapshot_latest_raw`.`quarter_no` AS `quarter_no`,`snapshot_latest_raw`.`version_no` AS `version_no`,`snapshot_latest_raw`.`recognized_revenue` AS `recognized_revenue`,`snapshot_latest_raw`.`medical_supply_cost` AS `medical_supply_cost`,`snapshot_latest_raw`.`operating_expense` AS `operating_expense`,`snapshot_latest_raw`.`net_profit` AS `net_profit`,`snapshot_latest_raw`.`data_complete_status` AS `data_complete_status`,`snapshot_latest_raw`.`settled_visit_count` AS `settled_visit_count`,`snapshot_latest_raw`.`unsettled_visit_count` AS `unsettled_visit_count`,`snapshot_latest_raw`.`data_cutoff_at` AS `data_cutoff_at`,`snapshot_latest_raw`.`confirmed_by_user_id` AS `confirmed_by_user_id`,`snapshot_latest_raw`.`confirmed_at` AS `confirmed_at`,`snapshot_latest_raw`.`row_no` AS `row_no` from `snapshot_latest_raw` where (`snapshot_latest_raw`.`row_no` = 1)), `provisional` as (select `pk`.`dentist_id` AS `dentist_id`,`pk`.`period_year` AS `period_year`,`pk`.`quarter_no` AS `quarter_no`,(case when (coalesce(`u`.`unsettled_visit_count`,0) = 0) then coalesce(`r`.`recognized_revenue`,0) else `r`.`recognized_revenue` end) AS `recognized_revenue`,coalesce(`r`.`settled_visit_count`,0) AS `settled_visit_count`,coalesce(`u`.`unsettled_visit_count`,0) AS `unsettled_visit_count`,(case when (coalesce(`c`.`medical_draft_count`,0) > 0) then 'PENDING' when ((coalesce(`c`.`medical_verified_count`,0) > 0) and (`c`.`medical_verified_amount` = 0)) then 'CONFIRMED_ZERO' when (coalesce(`c`.`medical_verified_count`,0) > 0) then 'CONFIRMED' when (coalesce(`c`.`medical_rejected_count`,0) > 0) then 'REJECTED_ONLY' else 'MISSING' end) AS `medical_supply_status`,(case when (coalesce(`c`.`operating_draft_count`,0) > 0) then 'PENDING' when ((coalesce(`c`.`operating_verified_count`,0) > 0) and (`c`.`operating_verified_amount` = 0)) then 'CONFIRMED_ZERO' when (coalesce(`c`.`operating_verified_count`,0) > 0) then 'CONFIRMED' when (coalesce(`c`.`operating_rejected_count`,0) > 0) then 'REJECTED_ONLY' else 'MISSING' end) AS `operating_expense_status`,`c`.`medical_verified_amount` AS `medical_supply_cost`,`c`.`operating_verified_amount` AS `operating_expense`,(coalesce(`c`.`medical_draft_count`,0) + coalesce(`c`.`operating_draft_count`,0)) AS `draft_cost_entry_count`,(coalesce(`c`.`medical_rejected_count`,0) + coalesce(`c`.`operating_rejected_count`,0)) AS `rejected_cost_entry_count`,(case when ((coalesce(`c`.`medical_verified_count`,0) = 0) or (coalesce(`c`.`operating_verified_count`,0) = 0)) then 1 else 0 end) AS `missing_cost_category_count`,(case when (coalesce(`u`.`unsettled_visit_count`,0) = 0) then 1 else 0 end) AS `revenue_data_complete_flag`,(case when ((coalesce(`c`.`medical_draft_count`,0) = 0) and (coalesce(`c`.`operating_draft_count`,0) = 0) and (coalesce(`c`.`medical_verified_count`,0) > 0) and (coalesce(`c`.`operating_verified_count`,0) > 0)) then 1 else 0 end) AS `cost_data_complete_flag`,(case when ((coalesce(`u`.`unsettled_visit_count`,0) = 0) and (coalesce(`c`.`medical_draft_count`,0) = 0) and (coalesce(`c`.`operating_draft_count`,0) = 0) and (coalesce(`c`.`medical_verified_count`,0) > 0) and (coalesce(`c`.`operating_verified_count`,0) > 0)) then (((case when (coalesce(`u`.`unsettled_visit_count`,0) = 0) then coalesce(`r`.`recognized_revenue`,0) else `r`.`recognized_revenue` end) - `c`.`medical_verified_amount`) - `c`.`operating_verified_amount`) else NULL end) AS `calculated_net_profit`,utc_timestamp(6) AS `data_updated_at` from (((`period_keys` `pk` left join `revenue` `r` on(((`r`.`dentist_id` = `pk`.`dentist_id`) and (`r`.`period_year` = `pk`.`period_year`) and (`r`.`quarter_no` = `pk`.`quarter_no`)))) left join `unsettled` `u` on(((`u`.`dentist_id` = `pk`.`dentist_id`) and (`u`.`period_year` = `pk`.`period_year`) and (`u`.`quarter_no` = `pk`.`quarter_no`)))) left join `cost_summary` `c` on(((`c`.`dentist_id` = `pk`.`dentist_id`) and (`c`.`period_year` = `pk`.`period_year`) and (`c`.`quarter_no` = `pk`.`quarter_no`))))) select `pk`.`dentist_id` AS `dentist_id`,`pk`.`period_year` AS `period_year`,`pk`.`quarter_no` AS `quarter_no`,(case when (`sl`.`snapshot_id` is null) then 'PROVISIONAL' else 'CONFIRMED_SNAPSHOT' end) AS `data_source`,`sl`.`snapshot_id` AS `snapshot_id`,`sl`.`version_no` AS `snapshot_version_no`,`sl`.`confirmed_at` AS `snapshot_confirmed_at`,coalesce(`sl`.`recognized_revenue`,`p`.`recognized_revenue`) AS `recognized_revenue`,coalesce(`sl`.`settled_visit_count`,`p`.`settled_visit_count`) AS `settled_visit_count`,coalesce(`sl`.`unsettled_visit_count`,`p`.`unsettled_visit_count`) AS `unsettled_visit_count_at_q_end`,(case when ((`sl`.`snapshot_id` is not null) and (`sl`.`medical_supply_cost` = 0)) then 'CONFIRMED_ZERO' when (`sl`.`snapshot_id` is not null) then 'CONFIRMED' else `p`.`medical_supply_status` end) AS `medical_supply_status`,(case when ((`sl`.`snapshot_id` is not null) and (`sl`.`operating_expense` = 0)) then 'CONFIRMED_ZERO' when (`sl`.`snapshot_id` is not null) then 'CONFIRMED' else `p`.`operating_expense_status` end) AS `operating_expense_status`,coalesce(`sl`.`medical_supply_cost`,`p`.`medical_supply_cost`) AS `medical_supply_cost`,coalesce(`sl`.`operating_expense`,`p`.`operating_expense`) AS `operating_expense`,(case when (`sl`.`snapshot_id` is null) then `p`.`draft_cost_entry_count` else 0 end) AS `draft_cost_entry_count`,(case when (`sl`.`snapshot_id` is null) then `p`.`rejected_cost_entry_count` else 0 end) AS `rejected_cost_entry_count`,(case when (`sl`.`snapshot_id` is null) then `p`.`missing_cost_category_count` else 0 end) AS `missing_cost_category_count`,(case when (`sl`.`snapshot_id` is null) then `p`.`revenue_data_complete_flag` else 1 end) AS `revenue_data_complete_flag`,(case when (`sl`.`snapshot_id` is null) then `p`.`cost_data_complete_flag` else 1 end) AS `cost_data_complete_flag`,(case when (`sl`.`snapshot_id` is not null) then 'CONFIRMED_COMPLETE' when ((`p`.`revenue_data_complete_flag` = 1) and (`p`.`cost_data_complete_flag` = 1)) then 'PROVISIONAL_COMPLETE' else 'PROVISIONAL_INCOMPLETE' end) AS `performance_status`,coalesce(`sl`.`net_profit`,`p`.`calculated_net_profit`) AS `calculated_net_profit`,coalesce(`sl`.`data_cutoff_at`,`p`.`data_updated_at`) AS `data_cutoff_at`,coalesce(`sl`.`confirmed_at`,`p`.`data_updated_at`) AS `data_updated_at` from ((`period_keys` `pk` left join `snapshot_latest` `sl` on(((`sl`.`dentist_id` = `pk`.`dentist_id`) and (`sl`.`period_year` = `pk`.`period_year`) and (`sl`.`quarter_no` = `pk`.`quarter_no`)))) left join `provisional` `p` on(((`p`.`dentist_id` = `pk`.`dentist_id`) and (`p`.`period_year` = `pk`.`period_year`) and (`p`.`quarter_no` = `pk`.`quarter_no`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-11 21:56:59
