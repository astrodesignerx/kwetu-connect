using Kompanion.Api.Data;

namespace Kompanion.Api.Models;

public record RegisterRequest(
    string Email, string Password, string DisplayName,
    /// <summary>Required unless this is the first account in the deployment.</summary>
    string? InviteToken = null,
    /// <summary>Optional login handle. Derived from the display name when omitted.</summary>
    string? Username = null);

/// <summary>"bootstrap" when no accounts exist yet, otherwise "invite".</summary>
public record RegistrationModeResponse(string Mode);

/// <summary>
/// <paramref name="Identifier"/> is an email address or a username handle. A leading
/// "@" is accepted, since that is how the handle is displayed.
/// </summary>
public record LoginRequest(string Identifier, string Password);

public record UserDto(
    Guid Id, string Email, string Username, string DisplayName, string Role, DateTimeOffset CreatedAt)
{
    public static UserDto From(User u) =>
        new(u.Id, u.Email, u.Username, u.DisplayName, u.Role.ToString(), u.CreatedAt);
}

public record AuthResponse(string Token, UserDto User);

public record UpdateProfileRequest(
    string? DisplayName, string? CurrentPassword, string? NewPassword,
    string? Username = null);

/// <summary>
/// Profile update result. <paramref name="Token"/> is non-null only when the password
/// changed — every prior token is revoked at that point, so the caller must swap in
/// this one to stay signed in.
/// </summary>
public record UpdateProfileResponse(UserDto User, string? Token);

public record InvitationDto(
    Guid Id, string Email, string Role,
    DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt,
    DateTimeOffset? AcceptedAt, DateTimeOffset? RevokedAt, string Status);

public record CreateInvitationRequest(string Email, string? Role);

/// <summary>
/// Returned once, at creation. The raw token is never stored or retrievable again —
/// only its hash is persisted — so the admin must copy the link now.
/// </summary>
public record CreateInvitationResponse(InvitationDto Invitation, string Token);

public record ConnectMailboxRequest(
    string Email, string Password,
    string? ImapHost, int? ImapPort,
    string? SmtpHost, int? SmtpPort);

public record MailboxDto(
    Guid Id, string Email,
    string ImapHost, int ImapPort,
    string SmtpHost, int SmtpPort,
    bool IsActive, DateTimeOffset CreatedAt, DateTimeOffset? LastVerifiedAt,
    string? OwnerEmail)
{
    public static MailboxDto From(MailboxConnection m, bool includeOwner = false) =>
        new(m.Id, m.Email, m.ImapHost, m.ImapPort, m.SmtpHost, m.SmtpPort,
            m.IsActive, m.CreatedAt, m.LastVerifiedAt,
            includeOwner ? m.User?.Email : null);
}

public record AdminUserDto(
    Guid Id, string Email, string Username, string DisplayName, string Role,
    int MailboxCount, DateTimeOffset CreatedAt, DateTimeOffset? LastLoginAt);

public record UpdateRoleRequest(string Role);

public record AuditLogDto(
    long Id, string ActorEmail, string Action,
    string? TargetEmail, Guid? TargetMailboxId,
    string? Details, DateTimeOffset CreatedAt);
