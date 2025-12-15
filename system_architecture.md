# 🏗️ Website Architecture & File Guide

Here is a detailed explanation of every file and folder we created and how they work together to build your **Multi-App System**.

## 1. The Main Structure (Hostinger Root)

### `public_html/index.html` (The Main Voice App)
*   **What it is:** This is the entry point of your website (`arraylink.ai`).
*   **What we changed:** We injected a **"More Apps 🚀" button** into this file.
*   **Purpose:** It loads your Voice Sales Agent React App. The new button allows users to "escape" this app and go to the Portal.

### `public_html/portal.html` (The App Menu)
*   **What it is:** A simple Landing Page.
*   **Purpose:** It acts as a **Menu**. When you click "More Apps", you land here.
*   **Function:** It only has one job: To show a link to the **US Travel App**.
    *   *Note: We removed the Voice Agent link from here because you are already coming FROM the Voice Agent.*

---

## 2. The Flight App Folder (`public_html/US-travel/`)

This is a completely separate "mini-website" living inside your main site.

### `US-travel/index.html` (The Structure)
*   **Role:** The Skeleton.
*   **What it does:** It creates the layout of the flight booking page:
    *   The Input boxes (From, To, Date).
    *   The "Search" button.
    *   The "Promo Cards" (New York, Maldives deals).
    *   The Navigation Bar (Flights, Hotels, etc.).
*   **Key Detail:** It links to the `styles.css` and `app.js` file so they can load.

### `US-travel/styles.css` (The Design)
*   **Role:** The Makeup/Styling.
*   **What it does:** It makes the `index.html` look beautiful and premium.
    *   **Colors:** Defines the Blue gradients and white text.
    *   **Glassmorphism:** Creates that cool blurry see-through background on the search box.
    *   **Layout:** Ensures inputs sit side-by-side using `grid` and `flexbox`.
    *   **Responsiveness:** Makes sure it looks good on mobile phones.

### `US-travel/app.js` (The Logic)
*   **Role:** The Brains.
*   **What it does:** It handles user interactions.
    *   **Clicking Tabs:** When you click "Round Trip", it highlights that button.
    *   **Search Animation:** When you click "SEARCH", it changes the text to "Searching..." to fake a loading process.
    *   **Dates:** It automatically grabs today's date and fills the "Departure" box so it's not empty.

---

## 3. How It All Connects (The Flow)

1.  **User Visits:** `arraylink.ai`
    *   Loads `public_html/index.html` (Voice Agent).
2.  **User Clicks:** "More Apps 🚀" Button
    *   Goes to `arraylink.ai/portal.html`.
3.  **User Clicks:** "US Travel Booking" Card
    *   Goes to `arraylink.ai/US-travel/`.
    *   Browser loads `US-travel/index.html` + `styles.css` + `app.js`.

This is called a **Folder-Based Multi-App Architecture**. Each app lives in its own "house" (folder), and `portal.html` is the "map" to find them.
