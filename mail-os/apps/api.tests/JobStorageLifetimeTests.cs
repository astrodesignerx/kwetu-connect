using Hangfire;
using Hangfire.Storage;
using Kompanion.Api.Jobs;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Kompanion.Api.Tests;

public class JobStorageLifetimeTests
{
    [Fact]
    public async Task Replacement_hosts_schedule_into_their_own_storage_after_previous_database_is_removed()
    {
        for (var index = 0; index < 3; index++)
        {
            await using var factory = new TestAppFactory();
            await factory.InitializeAsync();
            using var client = factory.CreateClient();
            var storage = factory.Services.GetRequiredService<JobStorage>();
            Assert.Same(storage, JobStorage.Current);
            using var connection = storage.GetConnection();
            var jobs = connection.GetRecurringJobs();
            Assert.Contains(jobs, job => job.Id == AttachmentJobs.SweepJobId);
            Assert.Contains(jobs, job => job.Id == FollowUpJobs.JobId);
        }
    }
}
