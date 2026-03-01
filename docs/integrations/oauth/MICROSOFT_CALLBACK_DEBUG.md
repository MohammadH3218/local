# Microsoft Calendar Callback 401 Error - Debug Guide

## The Problem

After connecting Microsoft Calendar:
- ✅ You received an email saying it connected
- ❌ But you got a 401 "Invalid or expired token" error on the callback page
- ❌ Appointments aren't showing up

## What's Happening

The Microsoft OAuth flow completed successfully (that's why you got the email), but when the callback tries to:
1. Exchange the authorization code for tokens
2. Save the connection to your database
3. Sync calendar events

Something is failing and returning a 401 error.

## Debugging Steps

### 1. Check Backend Logs

After redeploying with the new logging, try connecting again and check your backend logs for:

```
[CalendarIntegrationController] Microsoft callback received - code: PRESENT, state: ...
[CalendarIntegrationService] Handling Microsoft callback for company: ...
[MicrosoftCalendarService] Exchanging code for tokens - clientId: SET, redirectUri: ...
[MicrosoftCalendarService] Token exchange successful - expires_in: ...
[CalendarIntegrationService] Company calendar connection updated successfully
```

### 2. Common Issues

#### Issue A: Token Exchange Failing

If you see errors like:
- `Token exchange failed: no access_token in response`
- `Failed to exchange authorization code: invalid_grant`

**Possible causes:**
- Authorization code was already used (codes are single-use)
- Authorization code expired (they expire quickly)
- Redirect URI mismatch between what was used and what's configured

**Solution:** Try connecting again (get a fresh code)

#### Issue B: Company Not Found

If you see:
- `Company not found: [companyId]`

**Solution:** The `state` parameter (companyId) is invalid or the company doesn't exist

#### Issue C: Database Update Failing

If you see:
- `Failed to save calendar connection`

**Solution:** Check database permissions and connection

### 3. Manual Verification

After connecting, check if the connection was actually saved:

1. Check your database/backend logs to see if `updateCompany` was called
2. Verify the company record has `calendar_provider: 'MICROSOFT'`
3. Check if `calendar_connection` has the tokens

### 4. Try Manual Sync

If the connection was saved but appointments aren't showing:

1. Go to your appointments page
2. Try manually triggering a sync (if there's a sync button)
3. Or call the sync endpoint directly

## Next Steps

1. **Redeploy backend** with the new logging
2. **Try connecting Microsoft Calendar again**
3. **Check backend logs** for the detailed error messages
4. **Share the logs** if you need help debugging further

The new logging will show exactly where the process is failing.
