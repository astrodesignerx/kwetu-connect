using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

namespace Kompanion.Api.Auth;

/// <summary>
/// Reads caller identity out of the validated JWT.
///
/// Controllers used to run <c>SELECT "OrganizationId" FROM "Users" WHERE "Id" = …</c> on
/// nearly every request, sometimes more than once, to answer a question the token
/// already carries. The claims are signed and the token version is checked on every
/// request, so trusting them is no weaker than the lookup they replace — and it removes
/// a database round-trip from every scoped endpoint.
/// </summary>
public static class ClaimsExtensions
{
    public const string OrgClaim = "org";

    public static Guid CallerId(this ControllerBase controller) =>
        controller.User.CallerId();

    public static Guid CallerId(this ClaimsPrincipal principal)
    {
        var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier)
               ?? principal.FindFirstValue("sub");
        return Guid.TryParse(sub, out var id)
            ? id
            : throw new InvalidOperationException("Authenticated principal has no usable subject claim.");
    }

    public static int CallerOrgId(this ControllerBase controller) =>
        controller.User.CallerOrgId();

    public static int CallerOrgId(this ClaimsPrincipal principal)
    {
        var org = principal.FindFirstValue(OrgClaim);
        return int.TryParse(org, out var id)
            ? id
            : throw new InvalidOperationException("Authenticated principal has no usable org claim.");
    }
}
