namespace MailSpike;

public static class RepoPaths
{
    /// <summary>Walk up from CWD and the app base directory to find a repo-relative file.</summary>
    public static string? Find(string relative)
    {
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
        {
            var dir = new DirectoryInfo(start);
            while (dir is not null)
            {
                var candidate = Path.Combine(dir.FullName, relative);
                if (File.Exists(candidate)) return candidate;
                dir = dir.Parent;
            }
        }
        return null;
    }
}

public sealed class SpikeConfig
{
    public string ImapHost { get; set; } = "webmail.kwetuconnectads.co.ke";
    public int ImapPort { get; set; } = 993;
    public string SmtpHost { get; set; } = "";
    public int SmtpPort { get; set; } = 465;
    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
    public string PgConnection { get; set; } =
        "Host=127.0.0.1;Port=5432;Username=postgres;Password=postgres;Database=mailspike";
    public int Days { get; set; } = 365;

    private static readonly string[] Keys =
        { "MAILSPIKE_IMAP_HOST", "MAILSPIKE_IMAP_PORT", "MAILSPIKE_SMTP_HOST", "MAILSPIKE_SMTP_PORT", "MAILSPIKE_EMAIL", "MAILSPIKE_PASSWORD", "MAILSPIKE_PG", "MAILSPIKE_DAYS" };

    public static SpikeConfig Load()
    {
        var cfg = new SpikeConfig();

        var envFile = RepoPaths.Find(Path.Combine("tools", "MailSpike", "spike.local.env"))
                   ?? RepoPaths.Find("spike.local.env");
        if (envFile is not null)
        {
            foreach (var line in File.ReadAllLines(envFile))
            {
                var t = line.Trim();
                if (t.Length == 0 || t.StartsWith('#')) continue;
                var eq = t.IndexOf('=');
                if (eq <= 0) continue;
                cfg.Apply(t[..eq].Trim(), t[(eq + 1)..].Trim());
            }
        }

        // Real environment variables override the file.
        foreach (var key in Keys)
        {
            var v = Environment.GetEnvironmentVariable(key);
            if (!string.IsNullOrEmpty(v)) cfg.Apply(key, v);
        }

        if (string.IsNullOrEmpty(cfg.SmtpHost)) cfg.SmtpHost = cfg.ImapHost;
        return cfg;
    }

    private void Apply(string key, string value)
    {
        switch (key)
        {
            case "MAILSPIKE_IMAP_HOST": ImapHost = value; break;
            case "MAILSPIKE_IMAP_PORT": if (int.TryParse(value, out var p)) ImapPort = p; break;
            case "MAILSPIKE_SMTP_HOST": SmtpHost = value; break;
            case "MAILSPIKE_SMTP_PORT": if (int.TryParse(value, out var sp)) SmtpPort = sp; break;
            case "MAILSPIKE_EMAIL": Email = value; break;
            case "MAILSPIKE_PASSWORD": Password = value; break;
            case "MAILSPIKE_PG": PgConnection = value; break;
            case "MAILSPIKE_DAYS": if (int.TryParse(value, out var d)) Days = d; break;
        }
    }
}
