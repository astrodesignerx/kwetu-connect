using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Kompanion.Api.Data;
using Microsoft.IdentityModel.Tokens;

namespace Kompanion.Api.Auth;

public class JwtTokenService
{
    /// <summary>Claim carrying the user's <see cref="User.TokenVersion"/> at mint time.</summary>
    public const string TokenVersionClaim = "tv";
    public const string DevelopmentOnlyClaim = "development_only";

    private readonly IConfiguration _config;

    public JwtTokenService(IConfiguration config) => _config = config;

    // Single 7-day access token. Refresh-token rotation is deliberate future hardening
    // for this single-company internal tool, not Phase 1 scope. Revocation before
    // expiry is handled by the token-version claim rather than a deny list.
    public string CreateToken(User user, bool developmentOnly = false)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim("org", user.OrganizationId.ToString()),
            new Claim(TokenVersionClaim, user.TokenVersion.ToString())
        };
        if (developmentOnly) claims.Add(new Claim(DevelopmentOnlyClaim, "true"));
        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: developmentOnly ? DateTime.UtcNow.AddHours(1) : DateTime.UtcNow.AddDays(7),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
