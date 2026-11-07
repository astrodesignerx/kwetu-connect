# Workspace settings API

All endpoints require a valid bearer token. Organisation and user IDs come from JWT claims. No endpoint returns credentials.

## GET /api/workspace/overview

Returns `workspaceName`, `memberCount`, `mailboxCount` (active connections), `templateCount`, `sendsLast30Days`, `pendingInvitations`, and `mailboxHealth` (`healthy`, `pending`, `backfilling`, `needsAttention`). All counts are organisation scoped. Sends count durable `Accepted` send operations whose stored `UpdatedAt` is within the last 30 days, including today. It is the existing timestamp nearest acceptance, not a separately recorded SMTP acceptance time. Invitations count only unaccepted, unrevoked and unexpired invitations. `pendingInvitations` is null for members. Admin reads are audit logged.

## GET /api/mailboxes/{id}/sync-stats?hours=24

Available only for the caller's own mailbox in their organisation. Returns 404 for any other or unknown mailbox. `hours` must be 1 to 168 inclusive; otherwise 400. Returns `mailboxId`, `syncState`, `syncError`, `lastSyncCompletedAt`, `conversationCount`, `messagesSynced`, `hourly` (`hour`, `count`), and `errorCount24Hours`.

Hourly buckets use UTC and count stored message rows by `FetchedAt`. The requested number of buckets includes the current partial hour. These are persisted fetched messages, not server arrival dates or a sync-run log. Reingestion and deletion can change these counts. Error history is not stored, so `errorCount24Hours` is null. Only the caller's current connection state and error are returned.

## GET /api/admin/audit-log/daily?weeks=12

Admin only; members receive 403. `weeks` must be 1 to 52 inclusive; otherwise 400. Returns UTC `today`, `weeks`, and `days` (`date` in YYYY-MM-DD, `count`). The window starts on Monday of the first requested week and ends today. Empty dates have zero counts. Entries are scoped through the actor's organisation. Unlike the existing latest-200 timeline, this aggregates the full requested window. The read is audit logged after aggregation, so its own event appears on the next request.
