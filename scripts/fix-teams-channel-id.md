# Fix: Get Correct Teams Channel ID

Your current `TEAMS_CHANNEL_ID` is a UUID which is wrong.
Real Teams channel IDs look like: `19:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@thread.tacv2`

## Step by step

1. Open **Microsoft Teams** (desktop app or web)
2. Find the channel you want Herald to post in (e.g. the `General` channel in your Herald team)
3. Right-click the channel name → **Get link to channel**
4. Copy the link — it looks like:
   ```
   https://teams.microsoft.com/l/channel/19%3Axxxxxxxx%40thread.tacv2/General?groupId=...
   ```
5. The channel ID is the part between `/channel/` and the next `/`, URL-decoded:
   - Raw: `19%3Axxxxxxxx%40thread.tacv2`
   - Decoded: `19:xxxxxxxx@thread.tacv2`
   - Replace `%3A` with `:` and `%40` with `@`

6. Paste the decoded value into `.env`:
   ```
   TEAMS_CHANNEL_ID="19:xxxxxxxx@thread.tacv2"
   ```

## Verify

Run: `curl http://localhost:3000/diagnostic`

You should see:
```json
"channel_id_valid": true,
"channel_id_hint": "Format looks correct"
```
