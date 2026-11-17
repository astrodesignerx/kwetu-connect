using System.Net;
using Kompanion.Api.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kompanion.Api.Tests;

public class ReverseProxyTests
{
    [Theory]
    [InlineData("172.30.88.10", "https", HttpStatusCode.OK)]
    [InlineData("172.30.88.10", "http", HttpStatusCode.TemporaryRedirect)]
    [InlineData("172.30.88.11", "https", HttpStatusCode.TemporaryRedirect)]
    public async Task Only_the_configured_proxy_can_forward_https(string remote, string scheme, HttpStatusCode expected)
    {
        using var server = new TestServer(new WebHostBuilder()
            .ConfigureServices(services =>
            {
                services.Configure<ForwardedHeadersOptions>(options => ReverseProxyConfiguration.Configure(options, "172.30.88.10"));
                services.AddHttpsRedirection(options => options.HttpsPort = 443);
            })
            .Configure(app =>
            {
                app.Use((context, next) =>
                {
                    context.Connection.RemoteIpAddress = IPAddress.Parse(remote);
                    return next(context);
                });
                app.UseForwardedHeaders();
                app.UseHttpsRedirection();
                app.Run(context => context.Response.WriteAsync(context.Request.Scheme));
            }));
        using var client = server.CreateClient();
        client.DefaultRequestHeaders.Add("X-Forwarded-Proto", scheme);
        using var response = await client.GetAsync("http://mail.test/api/health");
        Assert.Equal(expected, response.StatusCode);
        if (expected == HttpStatusCode.OK) Assert.Equal("https", await response.Content.ReadAsStringAsync());
        else Assert.Equal("https://mail.test/api/health", response.Headers.Location?.ToString());
    }

    [Fact]
    public void Invalid_proxy_configuration_is_rejected()
        => Assert.Throws<InvalidOperationException>(() => ReverseProxyConfiguration.Configure(new(), "trust-everyone"));
}
