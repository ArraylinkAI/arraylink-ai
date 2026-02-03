-- SAP Integration: Database Schema Updates
-- Run this ENTIRE script in Hostinger phpMyAdmin
-- Database → phpMyAdmin → Your Database → SQL Tab → Paste → Go

-- ============================================
-- STEP 1: Modify existing call_logs table
-- ============================================

-- Add SAP customer tracking to call_logs
ALTER TABLE call_logs 
ADD COLUMN IF NOT EXISTS sap_customer_id VARCHAR(50) AFTER call_sid,
ADD INDEX IF NOT EXISTS idx_customer (sap_customer_id);

-- ============================================
-- STEP 2: Create SAP Customer Cache Table
-- ============================================

CREATE TABLE IF NOT EXISTS sap_customer_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sap_customer_id VARCHAR(50) UNIQUE NOT NULL,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    customer_name VARCHAR(100),
    company_name VARCHAR(150),
    credit_limit DECIMAL(12,2),
    last_order_date DATE,
    preferred_products JSON,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    INDEX idx_phone (phone_number),
    INDEX idx_customer_id (sap_customer_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STEP 3: Create SAP Product Cache Table
-- ============================================

CREATE TABLE IF NOT EXISTS sap_product_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sap_material_id VARCHAR(50) UNIQUE NOT NULL,
    product_name VARCHAR(150),
    current_price DECIMAL(10,2),
    stock_quantity INT,
    unit_of_measure VARCHAR(20),
    warehouse_location VARCHAR(50),
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    INDEX idx_material (sap_material_id),
    INDEX idx_name (product_name),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STEP 4: Create SAP Order Mapping Table
-- ============================================

CREATE TABLE IF NOT EXISTS sap_order_mapping (
    id INT AUTO_INCREMENT PRIMARY KEY,
    call_sid VARCHAR(100) NOT NULL,
    sap_order_number VARCHAR(50) NOT NULL,
    sap_customer_id VARCHAR(50),
    order_total DECIMAL(12,2),
    order_status VARCHAR(50) DEFAULT 'confirmed',
    delivery_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_call (call_sid),
    INDEX idx_order (sap_order_number),
    INDEX idx_customer (sap_customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- STEP 5: Create SAP Error Log Table
-- ============================================

CREATE TABLE IF NOT EXISTS sap_error_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    error_type VARCHAR(50),
    endpoint VARCHAR(255),
    error_message TEXT,
    request_data JSON,
    response_data JSON,
    call_sid VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (error_type),
    INDEX idx_created (created_at),
    INDEX idx_call (call_sid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- VERIFICATION: Check tables created
-- ============================================

-- Run this query to verify all tables exist:
SHOW TABLES LIKE 'sap_%';

-- Expected result: 4 tables
-- - sap_customer_cache
-- - sap_error_log
-- - sap_order_mapping
-- - sap_product_cache

-- ============================================
-- DONE! SAP tables are ready.
-- ============================================
