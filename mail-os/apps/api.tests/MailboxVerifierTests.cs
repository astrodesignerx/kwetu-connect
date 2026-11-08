using Kompanion.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Kompanion.Api.Tests;

/// <summary>Which mail servers get tried when someone connects with only an email and password.</summary>
public class MailboxVerifierTests
{
    private const string Domain = "example.co.ke";

    private sealed class ScriptedVerifier(Dictionary<string, MailLoginResult> smtp, Dictionary<string, MailLoginResult>? imap = null)
        : MailboxVerifier(NullLogger<MailboxVerifier>.Instance)
    {
        private static readonly MailLoginResult Unreachable = new(false, "no answer", false);

        public List<string> Tried { get; } = [];

        public override Task<MailLoginResult> CheckSmtpAsync(string host, int port, string email, string password, CancellationToken ct)
        {
            Tried.Add(host);
            return Task.FromResult(smtp.GetValueOrDefault(host, Unreachable));
        }

        public override Task<MailLoginResult> CheckImapAsync(string host, int port, string email, string password, CancellationToken ct)
        {
            Tried.Add(host);
            return Task.FromResult((imap ?? []).GetValueOrDefault(host, Unreachable));
        }
    }

    private static readonly MailLoginResult Accepted = new(true, null, false);
    private static readonly MailLoginResult Rejected = new(false, "rejected", true);

    [Fact]
    public async Task Sending_uses_the_mail_host_even_when_receiving_found_webmail()
    {
        var verifier = new ScriptedVerifier(new() { [$"mail.{Domain}"] = Accepted });

        var found = await verifier.FindSmtpHostAsync(
            MailboxVerifier.SmtpCandidates(Domain, $"webmail.{Domain}"), 465, "a@b", "pw", CancellationToken.None);

        Assert.Equal($"mail.{Domain}", found.Host);
        Assert.Equal([$"mail.{Domain}"], verifier.Tried);
    }

    [Fact]
    public async Task Sending_falls_through_servers_that_do_not_answer()
    {
        var verifier = new ScriptedVerifier(new() { [$"smtp.{Domain}"] = Accepted });

        var found = await verifier.FindSmtpHostAsync(
            MailboxVerifier.SmtpCandidates(Domain, $"webmail.{Domain}"), 465, "a@b", "pw", CancellationToken.None);

        Assert.Equal($"smtp.{Domain}", found.Host);
        Assert.Equal([$"mail.{Domain}", $"webmail.{Domain}", $"smtp.{Domain}"], verifier.Tried);
    }

    [Fact]
    public async Task A_rejected_password_is_not_repeated_against_other_servers()
    {
        var verifier = new ScriptedVerifier([], new() { [$"webmail.{Domain}"] = Rejected, [$"mail.{Domain}"] = Accepted });

        var found = await verifier.FindImapHostAsync(
            MailboxVerifier.ImapCandidates(Domain), 993, "a@b", "pw", CancellationToken.None);

        Assert.Null(found.Host);
        Assert.True(found.CredentialsRejected);
        Assert.Equal([$"webmail.{Domain}"], verifier.Tried);
    }

    [Fact]
    public async Task No_server_answering_is_reported_as_unreachable_not_a_bad_password()
    {
        var verifier = new ScriptedVerifier([]);

        var found = await verifier.FindSmtpHostAsync(
            MailboxVerifier.SmtpCandidates(Domain, $"mail.{Domain}"), 465, "a@b", "pw", CancellationToken.None);

        Assert.Null(found.Host);
        Assert.False(found.CredentialsRejected);
        Assert.Equal(2, verifier.Tried.Count);
    }
}
