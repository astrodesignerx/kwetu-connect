using System.ComponentModel.DataAnnotations;

namespace Kompanion.Api.Models;

public record SetThreadStateRequest([Required] string State);
public record ThreadStateDto(Guid Id, string ReplyState, DateTimeOffset StateSince, bool NeedsNudge);
public record ProjectFlightRequest([Required, StringLength(200)] string SiteName, DateOnly StartDate, DateOnly EndDate);
public record ProjectFlightDto(Guid Id, Guid ProjectId, string SiteName, DateOnly StartDate, DateOnly EndDate);
public record WaitingThreadDto(Guid Id, string? Subject, DateTimeOffset StateSince, double WaitingSeconds, bool NeedsNudge);
public record UpcomingFlightDto(Guid Id, Guid ProjectId, string SiteName, Guid ClientId, string Client, DateOnly StartDate, DateOnly EndDate);
public record ResponseDayDto(DateOnly Date, int Count, double? MedianSeconds);
public record ResponseGroupDto(Guid? Id, string Name, int Count, double MedianSeconds);
public record ResponseTimesDto(string By, int Days, int Count, double? MedianSeconds, List<ResponseGroupDto> Groups);
public record FirstReplyDto(int WorkingDays, int Count, double? MedianSeconds, List<ResponseDayDto> Daily);
public record MailBriefDto(int UnreadCount, List<WaitingThreadDto> WaitingOnMe, int AwaitingCount,
    List<UpcomingFlightDto> UpcomingFlights, FirstReplyDto FirstReply);
