namespace Kompanion.Api.Data;

public enum UserRole
{
    Member = 0,
    Admin = 1
}

public class Organization
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<User> Users { get; set; } = new();
}

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;
    public required string Email { get; set; }

    /// <summary>
    /// Login handle — lowercase, no spaces, globally unique, e.g. <c>kwetuadmin</c>.
    /// Shown as <c>@kwetuadmin</c>.
    ///
    /// Display names used to double as the login identifier, which meant signing in as
    /// "Kwetu Admin" (with a space and capitals) and forced display names to be unique.
    /// Splitting them lets the display name go back to being a free-text label.
    /// </summary>
    public required string Username { get; set; }

    public required string DisplayName { get; set; }
    public required string PasswordHash { get; set; }
    public UserRole Role { get; set; } = UserRole.Member;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAt { get; set; }
    public List<MailboxConnection> Mailboxes { get; set; } = new();

    /// <summary>
    /// Bumped whenever every existing session should stop working — a password change,
    /// or an admin revoking access. Tokens carry the value they were minted with; a
    /// mismatch on validation rejects the token. Without this, a 7-day JWT stolen
    /// before a password reset stays valid for the full 7 days after it.
    /// </summary>
    public int TokenVersion { get; set; } = 1;
}

/// <summary>
/// An admin's invitation for a new member to register.
///
/// Registration used to be open to anyone who could reach the API, and Phase 7 grants
/// every member read access to every mailbox in the org — so self-service signup meant
/// self-service access to all company mail. Only the very first account (which
/// bootstraps the admin) can be created without one of these.
///
/// Only the SHA-256 of the token is stored: a database dump must not yield working
/// invite links.
/// </summary>
public class Invitation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int OrganizationId { get; set; }
    public Organization Organization { get; set; } = null!;

    /// <summary>Lowercased; the registering address must match exactly.</summary>
    public required string Email { get; set; }
    public required string TokenHash { get; set; }
    public UserRole Role { get; set; } = UserRole.Member;

    public Guid CreatedByUserId { get; set; }
    public User CreatedBy { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddDays(7);
    public DateTimeOffset? AcceptedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }

    public bool IsUsable(DateTimeOffset now) =>
        AcceptedAt is null && RevokedAt is null && ExpiresAt > now;
}

public enum MailboxCredentialType
{
    ImapPassword = 0
    // GmailOAuth reserved for a future provider, not built (deferred list).
}

public class MailboxConnection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public required string Email { get; set; }
    public required string ImapHost { get; set; }
    public int ImapPort { get; set; } = 993;
    public required string SmtpHost { get; set; }
    public int SmtpPort { get; set; } = 465;
    public MailboxCredentialType CredentialType { get; set; } = MailboxCredentialType.ImapPassword;
    public required byte[] EncryptedCredentials { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastVerifiedAt { get; set; }
    public MailboxSyncState SyncState { get; set; } = MailboxSyncState.Pending;
    public string? SyncError { get; set; }
    public DateTimeOffset? LastSyncCompletedAt { get; set; }
}

public class AuditLogEntry
{
    public long Id { get; set; }
    public Guid ActorUserId { get; set; }
    public required string ActorEmail { get; set; }
    public required string Action { get; set; }
    public Guid? TargetUserId { get; set; }
    public string? TargetEmail { get; set; }
    public Guid? TargetMailboxId { get; set; }
    public string? Details { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
