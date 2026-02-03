-- Database Schema for ArrayLink AI
-- Run this SQL in Hostinger's phpMyAdmin

-- 1. Users Table (Handles Logins)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Plans Table (Your Products)
CREATE TABLE plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- e.g. "Pro Plan"
    price DECIMAL(10,2) NOT NULL, -- e.g. 19.99
    features JSON, -- List of features
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Purchases Table (Who bought what)
CREATE TABLE purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    plan_id INT NOT NULL,
    status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
    transaction_id VARCHAR(100),
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- 4. Travel App History (Generated Itineraries)
CREATE TABLE generated_itineraries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    destination VARCHAR(100),
    content TEXT, -- The full AI response
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 5. Voice Agent History (Call Logs)
CREATE TABLE call_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    call_sid VARCHAR(100) UNIQUE, -- Twilio Call ID
    sap_customer_id VARCHAR(50), -- SAP Customer ID (if recognized)
    user_phone VARCHAR(20),
    conversation JSON, -- The full chat history
    duration INT DEFAULT 0, -- In seconds
    status VARCHAR(50) DEFAULT 'ongoing', -- e.g. "completed", "no-answer", "ongoing"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_call_sid (call_sid),
    INDEX idx_customer (sap_customer_id)
);

-- 6. SAP Customer Cache
CREATE TABLE sap_customer_cache (
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
);

-- 7. SAP Product Cache
CREATE TABLE sap_product_cache (
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
);

-- 8. SAP Order Mapping
CREATE TABLE sap_order_mapping (
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
);

-- 9. SAP Error Log
CREATE TABLE sap_error_log (
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
);
