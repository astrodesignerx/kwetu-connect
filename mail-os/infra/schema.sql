-- Phase 0 spike schema: minimal mail storage for sync feasibility proof.
-- Reserved-word note: header_references / from_addr / to_addrs avoid SQL keywords.

CREATE TABLE IF NOT EXISTS mailboxes (
    id          SERIAL PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    host        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS folders (
    id          SERIAL PRIMARY KEY,
    mailbox_id  INT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    uidvalidity INT NOT NULL,
    last_uid    INT,
    UNIQUE (mailbox_id, name)
);

CREATE TABLE IF NOT EXISTS threads (
    id                 SERIAL PRIMARY KEY,
    mailbox_id         INT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    root_key           TEXT NOT NULL,
    normalized_subject TEXT,
    subject            TEXT,
    message_count      INT NOT NULL DEFAULT 0,
    first_date         TIMESTAMPTZ,
    last_date          TIMESTAMPTZ,
    UNIQUE (mailbox_id, root_key)
);

CREATE TABLE IF NOT EXISTS messages (
    id                 BIGSERIAL PRIMARY KEY,
    mailbox_id         INT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
    folder_id          INT NOT NULL REFERENCES folders(id),
    thread_id          INT REFERENCES threads(id),
    uid                INT NOT NULL,
    uidvalidity        INT NOT NULL,
    message_id         TEXT,
    in_reply_to        TEXT,
    header_references  TEXT[],
    subject            TEXT,
    normalized_subject TEXT,
    from_name          TEXT,
    from_addr          TEXT,
    to_addrs           TEXT,
    cc_addrs           TEXT,
    message_date       TIMESTAMPTZ,
    internal_date      TIMESTAMPTZ,
    snippet            TEXT,
    body_text          TEXT,
    body_html          TEXT,
    raw_headers        TEXT,
    flags              TEXT[],
    size_bytes         BIGINT,
    has_attachments    BOOLEAN NOT NULL DEFAULT FALSE,
    attachment_count   INT NOT NULL DEFAULT 0,
    attachment_meta    JSONB,
    fetched_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (mailbox_id, folder_id, uidvalidity, uid)
);

CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages (message_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages (mailbox_id, message_date);
