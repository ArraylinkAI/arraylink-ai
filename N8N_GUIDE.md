# How to Use the Advanced n8n Voice Agent

This guide explains how to import and configure the `n8n_advanced_agent.json` workflow.

## 1. Import into n8n
1. Open your n8n dashboard.
2. Click **Add Workflow** (top right) -> **Import from File**.
3. Select `n8n_advanced_agent.json`.
4. You will see the visual flow with the `Twilio Webhook` on the left and the `AI Sales Agent` in the center.

## 2. Configuration Steps

### A. Connect OpenAI
- Open the **AI Sales Agent** node.
- Under **Credentials**, select your OpenAI account.

### B. Configure Twilio Webhook
- Copy the **Production URL** from the **Twilio Webhook** node.
- Paste it into your Twilio Console under the "A Call Comes In" field for your phone number.

### C. Connect Tools
- **Inventory Tool**: Connect to your database node to query SAP tables.
- **RAG Tool**: Connect to a Vector Store (optional) for policy answers.
