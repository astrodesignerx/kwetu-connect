namespace Kompanion.Api.Auth;

/// <summary>Named rate-limiting policies, registered in Program.cs.</summary>
public static class RateLimitPolicies
{
    /// <summary>Unauthenticated credential endpoints (login, register). Keyed by IP.</summary>
    public const string Auth = "auth";

    /// <summary>LLM-backed endpoints. Keyed by user — cost follows the account.</summary>
    public const string Ai = "ai";

    /// <summary>Attachment uploads. Keyed by user.</summary>
    public const string Upload = "upload";
}

/// <summary>Named CORS policies, registered in Program.cs.</summary>
public static class CorsPolicies
{
    /// <summary>
    /// The web app's origin, allowed to reach the SignalR hub directly. Only the hub
    /// needs this — /api/* is same-origin through the Next dev proxy.
    /// </summary>
    public const string Web = "web";
}
