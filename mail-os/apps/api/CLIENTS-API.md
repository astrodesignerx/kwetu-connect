# Client insights API

Both endpoints require the existing bearer JWT and read the organisation ID from its signed claims. They are read-only. Direct client links and project links are combined, with each thread counted once per client. Both sides of each link are scoped to the caller's organisation. No schema, service or existing endpoint changes are required.

## GET /api/companies/activity?weeks=8

`weeks` is an integer from 1 to 52, default 8. Weeks begin on Monday in Nairobi. The last point is the current partial week. Returns 200 with an array ordered by client name:

```json
[
  {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Cedar",
    "domain": "cedar.example",
    "projectCount": 2,
    "threadCount": 4,
    "boardsBooked": 3,
    "waitingCount": 1,
    "status": "WaitingOnUs",
    "weeks": [{ "startDate": "2026-10-19", "conversations": 2 }]
  }
]
```

The example shows one weekly point; a normal response contains exactly `weeks` points for every client, including zeroes. A conversation counts in every week with at least one synced message, using `InternalDate`, then `MessageDate`, then `FetchedAt`. Multiple messages and multiple links do not multiply that week's count. Future messages are excluded. Counts include historic mail in inactive organisation mailboxes, consistent with the existing client workspace. `WaitingOnUs` means any linked thread has `ToReply`; otherwise the status is `AllReplied`. An empty client has zero conversations and `AllReplied`. An organisation without clients returns `[]`.

`boardsBooked` counts that client's project flight bookings overlapping the current Nairobi calendar quarter, independently of `weeks`. Summing these values gives the directory's quarter headline. A site booked twice counts twice. Project counts include all projects; no active-project flag exists.

## GET /api/companies/{id}/insights

Optional `startDate` and `endDate` use `YYYY-MM-DD`. Each omitted bound defaults to the corresponding bound of the current Nairobi calendar quarter. The end is inclusive, must be on or after the start, and the window must be at most 366 calendar dates. The flight window does not change the reply-sample window or recent communication history. Returns 200:

```json
{
  "clientId": "11111111-1111-4111-8111-111111111111",
  "startDate": "2026-10-01",
  "endDate": "2026-12-31",
  "boardsBooked": 3,
  "firstReply": { "days": 30, "count": 2, "medianSeconds": 120 },
  "lastContactAt": "2026-10-22T08:00:00Z",
  "threadCount": 4,
  "waitingCount": 1,
  "recentThreads": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "subject": "Campaign artwork",
      "participants": "client@cedar.example",
      "snippet": "Please review the artwork.",
      "lastDate": "2026-10-22T08:00:00Z",
      "hasUnread": true,
      "replyState": "ToReply",
      "stateSince": "2026-10-22T08:00:00Z",
      "needsNudge": false
    }
  ]
}
```

`boardsBooked` counts project flight bookings overlapping the requested window, including flights spanning its boundaries. It counts bookings, not distinct physical sites, since the schema has site names rather than board identities. `firstReply` reuses the Phase 2 accepted `ThreadResponseTimes` samples and median function, filtering by the client attributed at send time and the last 30 elapsed days through now. This matches `/api/stats/response-times?by=client&days=30`, including weekends and historic samples from inactive mailboxes. No response history is inferred from old messages. `lastContactAt` is the greatest linked thread `LastDate`. `recentThreads` has at most 20 linked threads, newest first, null dates last, with an ID tie-breaker. Reply states are `ToReply`, `Awaiting` or `Done`.

An empty client returns zero counts, `firstReply.medianSeconds: null`, `lastContactAt: null` and `recentThreads: []`. Missing or foreign clients return the same 404 with `{"error":"Company not found."}`. Invalid bounds or weeks return 400 with an error or standard validation problem JSON. Unauthenticated calls return 401. Unexpected server errors follow the existing API error middleware.
