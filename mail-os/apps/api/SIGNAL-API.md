# Signal API

All routes use the existing bearer JWT authentication. Send `Authorization: Bearer <token>`. Requests and responses use camelCase JSON. Timestamps are ISO 8601 instants; flight dates use `YYYY-MM-DD` without a time or timezone. PostgreSQL persists timestamps to microsecond precision, so a freshly changed in-memory timestamp can have one extra fractional digit before a later database read.

Every resource is scoped to the caller's organisation from the signed JWT. Members share thread metadata and project flights within that organisation. Missing and foreign resource IDs return the same 404 response. No endpoint below sends email or creates a draft.

## Errors shared by all endpoints

| Status | Meaning | Response |
|---|---|---|
| 401 | Missing, expired, revoked or invalid bearer token | Usually an empty response body from authentication middleware |
| 400 | Invalid JSON, missing required fields, invalid field types or query values | ASP.NET validation problem JSON with `title`, `status` and `errors` |
| 500 | Unexpected server failure | `{"error":"Something went wrong handling that request.","detail":null}` in production |

Controller validation and lookup errors instead use `{"error":"description"}`. An invalid GUID in a route does not match the route and returns 404. Development 500 responses can include exception details. The examples below use synthetic IDs and data.

## GET /api/mail/brief

Request:

```http
GET /api/mail/brief
Authorization: Bearer <token>
```

No body or query parameters. Returns 200:

```json
{
  "unreadCount": 4,
  "waitingOnMe": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "subject": "October campaign artwork",
      "stateSince": "2026-10-22T08:00:00Z",
      "waitingSeconds": 3600,
      "needsNudge": false
    }
  ],
  "awaitingCount": 2,
  "upcomingFlights": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "projectId": "33333333-3333-4333-8333-333333333333",
      "siteName": "Westlands",
      "clientId": "44444444-4444-4444-8444-444444444444",
      "client": "Cedar",
      "startDate": "2026-10-24",
      "endDate": "2026-11-24"
    }
  ],
  "firstReply": {
    "workingDays": 7,
    "count": 3,
    "medianSeconds": 180,
    "daily": [
      { "date": "2026-10-14", "count": 0, "medianSeconds": null },
      { "date": "2026-10-15", "count": 0, "medianSeconds": null },
      { "date": "2026-10-16", "count": 0, "medianSeconds": null },
      { "date": "2026-10-19", "count": 0, "medianSeconds": null },
      { "date": "2026-10-20", "count": 0, "medianSeconds": null },
      { "date": "2026-10-21", "count": 2, "medianSeconds": 120 },
      { "date": "2026-10-22", "count": 1, "medianSeconds": 300 }
    ]
  }
}
```

- `waitingOnMe` is personal: active-mailbox ToReply threads assigned to the caller, plus unassigned ToReply threads in mailboxes the caller owns. Assignment to someone else excludes the thread even when the caller owns its mailbox. Results are oldest state first. `waitingSeconds` is elapsed time since `stateSince`, with a minimum of zero.
- `unreadCount` is the organisation-wide count of unseen Inbox messages in active mailboxes. It counts messages, not threads. `awaitingCount` counts Awaiting threads in active organisation mailboxes.
- `upcomingFlights` includes the organisation's flights starting on today's Nairobi calendar date or one of the following six dates. Results are sorted by start date and site name.
- `firstReply` covers the whole organisation, including historic samples from currently inactive mailboxes. It includes the last seven Monday to Friday dates in Nairobi, with today included if it is a weekday. There is no public holiday calendar. Weekend samples are excluded. Every selected weekday appears in `daily`, including dates without samples.
- Durations are elapsed seconds, including nights and weekends. Each sample is the first successful reply to one latest inbound message, rather than the first reply across the lifetime of a thread. A median is calculated from individual samples. Empty samples give `count: 0` and `medianSeconds: null`. No historical response samples are inferred during migration.

Errors: shared 401 and 500 responses. A caller with no relevant mail, flights or samples receives 200 with zero counts, empty resource arrays and seven empty daily points.

## GET /api/stats/response-times

Request:

```http
GET /api/stats/response-times?by=client&days=30
Authorization: Bearer <token>
```

| Parameter | Default | Accepted values |
|---|---|---|
| `by` | `client` | Exact strings `client` or `user` |
| `days` | `30` | Integer from 1 to 365 |

Returns 200:

```json
{
  "by": "client",
  "days": 30,
  "count": 3,
  "medianSeconds": 180,
  "groups": [
    { "id": "44444444-4444-4444-8444-444444444444", "name": "Cedar", "count": 2, "medianSeconds": 120 },
    { "id": null, "name": "Unlinked", "count": 1, "medianSeconds": 300 }
  ]
}
```

Statistics cover accepted response samples in the caller's organisation, from the current instant minus `days` elapsed days through the current instant, including weekends. `by=user` returns the sender's user ID and display name for each group. Groups are sorted by name. Grouping by client uses the client captured at send time; an unlinked or deleted client is grouped under `id: null, name: "Unlinked"`. An empty result has `count: 0`, `medianSeconds: null` and `groups: []`.

The first accepted reply for each mailbox/inbound-message key contributes one sample, even if more replies are sent before Sent sync or an accepted request is replayed. Its duration starts at the inbound message's `InternalDate`, falling back to `MessageDate` and then `FetchedAt`. Latest response detection uses that same receipt ordering, with the database message ID as a tie-breaker. Reply headers and recipient defaults retain their existing `MessageDate ?? InternalDate` ordering. The sender is the actual caller, including when replying from a teammate's mailbox. Client attribution chooses the earliest direct thread/client link, then a linked project client if no direct link exists. Future-dated inbound messages do not produce a negative sample.

Errors: shared 401 and 500; 400 with `{"error":"Use by=client or by=user and days from 1 to 365."}` for unsupported grouping or out-of-range days; malformed integers produce validation problem JSON.

## POST /api/mail/threads/{id}/state

Request:

```http
POST /api/mail/threads/11111111-1111-4111-8111-111111111111/state
Authorization: Bearer <token>
Content-Type: application/json

{ "state": "Done" }
```

Use `{"state":"ToReply"}` to reopen. These two values are case-sensitive. Returns 200:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "replyState": "Done",
  "stateSince": "2026-10-22T09:00:00Z",
  "needsNudge": false
}
```

Every organisation member can change a visible thread's state. A real change resets `stateSince` to the change instant, clears `needsNudge`, and writes an audit entry with action `mail.thread.state`, the actor, mailbox, thread ID and previous/new states. Repeating the current state preserves the timestamp and does not write another change entry. The existing `threadsChanged` notification is emitted.

Newer inbound mail changes the state to ToReply during ingest/thread rebuild. A successful reply send changes it to Awaiting. The daily Hangfire job flags Awaiting threads strictly older than three elapsed days as `needsNudge: true`; it sends no email and creates no draft. A newer state timestamp protects a manual change or accepted send from an older stored message during rebuild.

Errors: shared 401 and 500; 404 with `{"error":"Thread not found."}` for absent or foreign threads; 400 with `{"error":"State must be Done or ToReply (reopen)."}` for another state. Missing, null or empty state values can produce validation problem JSON.

## GET /api/projects/{projectId}/flights

Request:

```http
GET /api/projects/33333333-3333-4333-8333-333333333333/flights
Authorization: Bearer <token>
```

Returns 200, sorted by start date and then site name:

```json
[
  {
    "id": "22222222-2222-4222-8222-222222222222",
    "projectId": "33333333-3333-4333-8333-333333333333",
    "siteName": "Westlands",
    "startDate": "2026-10-24",
    "endDate": "2026-11-24"
  }
]
```

An existing project without flights returns `[]`. Errors: shared 401 and 500; 404 with `{"error":"Project not found."}` for absent or foreign projects.

## POST /api/projects/{projectId}/flights

Request:

```http
POST /api/projects/33333333-3333-4333-8333-333333333333/flights
Authorization: Bearer <token>
Content-Type: application/json

{ "siteName": "Westlands", "startDate": "2026-10-24", "endDate": "2026-11-24" }
```

`siteName` must be nonblank and at most 200 characters; surrounding whitespace is trimmed. Both dates are required and the end must be on or after the start. A single-day flight is valid. Returns 201 with `Location: /api/projects/{projectId}/flights`:

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "projectId": "33333333-3333-4333-8333-333333333333",
  "siteName": "Westlands",
  "startDate": "2026-10-24",
  "endDate": "2026-11-24"
}
```

Errors: shared 401 and 500; 404 with `{"error":"Project not found."}`; 400 for invalid names or dates, with `{"error":"Site name and valid start/end dates are required; end must be on or after start."}` or validation problem JSON for field validation/JSON parsing failures.

## PATCH /api/projects/{projectId}/flights/{id}

Request:

```http
PATCH /api/projects/33333333-3333-4333-8333-333333333333/flights/22222222-2222-4222-8222-222222222222
Authorization: Bearer <token>
Content-Type: application/json

{ "siteName": "CBD", "startDate": "2026-10-25", "endDate": "2026-11-25" }
```

Send all three editable fields. This endpoint replaces their values; omitted dates fail validation. It cannot move a flight to another project. Returns 200:

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "projectId": "33333333-3333-4333-8333-333333333333",
  "siteName": "CBD",
  "startDate": "2026-10-25",
  "endDate": "2026-11-25"
}
```

Errors: shared 401 and 500; 404 with `{"error":"Flight not found."}` for an absent flight, foreign project or flight belonging to another project; 400 with the same name/date validation responses as creation.

## DELETE /api/projects/{projectId}/flights/{id}

Request:

```http
DELETE /api/projects/33333333-3333-4333-8333-333333333333/flights/22222222-2222-4222-8222-222222222222
Authorization: Bearer <token>
```

Successful response:

```http
HTTP/1.1 204 No Content
```

No request or response body. Errors: shared 401 and 500; 404 with `{"error":"Flight not found."}` for an absent flight, foreign project or project/flight mismatch. Repeating a successful deletion returns 404. Deleting the parent project also deletes its flights.

## GET /api/mail/threads

The existing list response adds `replyState`, `stateSince` and `needsNudge` on each item. Existing filters and pagination behaviour are unchanged.

Request:

```http
GET /api/mail/threads?connectionId=55555555-5555-4555-8555-555555555555&folder=inbox&page=0&pageSize=50
Authorization: Bearer <token>
```

Returns 200:

```json
{
  "total": 1,
  "items": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "subject": "October campaign artwork",
      "participants": "client@example.test",
      "snippet": "Please review the artwork.",
      "messageCount": 1,
      "firstDate": "2026-10-22T08:00:00Z",
      "lastDate": "2026-10-22T08:00:00Z",
      "hasUnread": true,
      "hasAttachments": false,
      "replyState": "ToReply",
      "stateSince": "2026-10-22T08:00:00Z",
      "needsNudge": false
    }
  ]
}
```

`connectionId` identifies a mailbox in the caller's organisation. Optional existing parameters are `folder`, `q`, `assignee`, `mine`, `page` (default 0) and `pageSize` (default 50, clamped to 1 through 200). Errors: shared 401, binding-validation 400 and 500; 404 with `{"error":"Mailbox not found."}` for an absent or foreign mailbox.

## GET /api/mail/threads/{id}

Request:

```http
GET /api/mail/threads/11111111-1111-4111-8111-111111111111
Authorization: Bearer <token>
```

Returns 200. Existing message fields are unchanged:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "subject": "October campaign artwork",
  "firstDate": "2026-10-22T08:00:00Z",
  "lastDate": "2026-10-22T08:00:00Z",
  "messageCount": 1,
  "hasUnread": true,
  "messages": [
    {
      "id": 1,
      "messageId": "artwork@example.test",
      "folderName": "INBOX",
      "folderSpecialUse": "Inbox",
      "fromName": "Client",
      "fromAddr": "client@example.test",
      "toAddrs": "team@example.test",
      "ccAddrs": null,
      "date": "2026-10-22T08:00:00Z",
      "subject": "October campaign artwork",
      "snippet": "Please review the artwork.",
      "bodyText": "Please review the artwork.",
      "bodyHtml": null,
      "flags": [],
      "hasAttachments": false,
      "attachmentMetaJson": null,
      "attachments": []
    }
  ],
  "replyState": "ToReply",
  "stateSince": "2026-10-22T08:00:00Z",
  "needsNudge": false
}
```

Errors: shared 401 and 500; 404 with `{"error":"Thread not found."}` for an absent or foreign thread.

## Client fetch functions

`apps/web/src/lib/signal-api.ts` exports `signalApi.brief`, `responseTimes`, `setThreadState`, `flights`, `createFlight`, `updateFlight` and `deleteFlight`, plus the corresponding TypeScript types. Fetches use the existing token store, configured API origin, `ApiError`, and stale-session-safe unauthorised handling. Read functions accept an optional `AbortSignal`. `SignalThreadSummary` and `SignalThreadDetail` extend the existing shared types with the three state fields; existing thread-fetch methods remain available through `api`.
