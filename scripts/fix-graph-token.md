# Fix: Microsoft Graph Token Not Acquired

`token_acquired: false` in diagnostic means the client credentials flow is failing.

## Most common causes

### 1. Admin consent not granted (most likely)
Even with correct credentials, the app needs admin consent for application permissions.

**Fix:**
1. Go to **Azure Portal → App registrations → herald-graph**
2. Click **API permissions**
3. You should see `ChannelMessage.Send`, `Sites.ReadWrite.All`, `Calendars.ReadWrite`
4. Click **Grant admin consent for [your directory]**
5. All permissions should show a green ✓

### 2. Wrong client secret
Client secrets expire and can be copied incorrectly.

**Fix:**
1. Go to **Azure Portal → App registrations → herald-graph**
2. Click **Certificates & secrets**
3. Check the secret hasn't expired
4. If needed, create a new secret → copy the **Value** (not the ID) immediately
5. Update `GRAPH_CLIENT_SECRET` in `.env`

### 3. Wrong tenant ID
**Fix:**
1. Go to **Azure Portal → Microsoft Entra ID → Overview**
2. Copy the **Tenant ID**
3. Verify it matches `GRAPH_TENANT_ID` in `.env`

### 4. Wrong account type on app registration
The app must be **Single tenant** for client credentials to work with your tenant.

**Fix:**
1. Go to **App registrations → herald-graph → Authentication**
2. Ensure **Supported account types** = "Accounts in this organizational directory only"

## Test after fixing

```bash
curl http://localhost:3000/diagnostic
```

Should show: `"token_acquired": true`

Then trigger a demo run and approve it — the Teams post should succeed with a real URL instead of a simulated one.
