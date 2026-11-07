namespace Kompanion.Api.Data;

public enum ReplyState { ToReply, Awaiting, Done }

public class ProjectFlight
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    public required string SiteName { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
}

/// <summary>The first accepted reply to one inbound message, retained across message resyncs.</summary>
public class ThreadResponseTime
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SendOperationId { get; set; }
    public SendOperation SendOperation { get; set; } = null!;
    public Guid MailboxConnectionId { get; set; }
    public MailboxConnection MailboxConnection { get; set; } = null!;
    public Guid? ThreadId { get; set; }
    public MailThread? Thread { get; set; }
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    public Guid? CompanyId { get; set; }
    public Company? Company { get; set; }
    public required string InboundMessageKey { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    public DateTimeOffset SentAt { get; set; }
    public double Seconds { get; set; }
}
