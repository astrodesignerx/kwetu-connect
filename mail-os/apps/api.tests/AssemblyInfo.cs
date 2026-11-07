using Xunit;

// Hangfire's static scheduler is shared across test hosts and their temporary databases.
// Keep host lifetimes separate. Individual tests still send concurrent requests.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
