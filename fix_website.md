# Emergency Fix: Restore Voice Agent

It seems the Voice Agent (React App) **must** be the main file (`index.html`) to work correctly.
We will revert the changes and use a smarter way to link them: **A "More Apps" button.**

### 1. Revert on Hostinger (Important!)
1.  Go to Hostinger File Manager.
2.  **Delete** the current `index.html` (the Portal one).
3.  **Rename** `voice.html` **back to** `index.html`.
    *   *Result:* Your Voice Agent should work again at `arraylink.ai`.

### 2. Add the "More Apps" Button
I have modified your code to add a beautiful "More Apps" button to your main site.
1.  **Upload** the file `public/index.html` to Hostinger (Replacing the one you just renamed).
2.  **Upload** `public/portal.html` again (I updated the links).

### Final Result
*   **`arraylink.ai`**: Opens Voice Agent (with a "More Apps 🚀" button).
*   **Clicking "More Apps"**: Opens the Portal Menu.
*   **Clicking "US Travel"**: Opens the Flight App.

This is the safest and most robust way!
