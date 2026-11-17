using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;

namespace Kompanion.Api.Services;

internal static class ReverseProxyConfiguration
{
    internal static void Configure(ForwardedHeadersOptions options, string? proxies)
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        foreach (var proxy in (proxies ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
        {
            if (!IPAddress.TryParse(proxy, out var address))
                throw new InvalidOperationException("ReverseProxy:KnownProxies must contain IP addresses separated by commas.");
            options.KnownProxies.Add(address);
        }
    }
}
