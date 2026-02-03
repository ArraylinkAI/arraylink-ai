# Hostinger Upload Guide

This guide details exactly which files you need to upload to your Hostinger server to see the new **Futuristic UI** and use the **AI Voice Agent**.

## 📂 Files to Upload to `public_html/`

### 1. The New Futuristic UI (Mirror this structure)
Upload these from your local `public/` folder to the server's `public/` or `public_html/` folder:
- **`public/index.html`** (The main "Deep Void" landing page)
- **`public/css/style.css`** (The animations and neon styles)
- **`public/js/app.js`** (The background particles and visual effects)
- **`public/assets/`** (Any images or icons used in the UI)

### 2. Backend Logic (PHP)
Upload your `php/` folder containing:
- **`php/incoming-call.php`**
- **`php/process-speech.php`**
- **`php/config.php`** (Double-check your API keys and DB credentials here)
- **`php/db.php`**

### 3. Server Configuration
- **`.htaccess`** (Crucial for Twilio routing and index loading)

---

## 🗄️ Database Setup
1. Log in to **Hostinger cPanel** -> **phpMyAdmin**.
2. Select your project database.
3. Import the file **`SAP_DATABASE_UPDATE.sql`** to create the new tables for the AI Sales Agent.

---

## 🤖 n8n Setup (Separate)
The file **`n8n_advanced_agent.json`** should **NOT** be uploaded to Hostinger. Instead:
1. Open your **n8n Dashboard**.
2. Go to **Workflows** -> **Add Workflow** -> **Import from File**.
3. Select this JSON file.
4. Follow the setup steps inside n8n (API keys, Webhook URLs).
