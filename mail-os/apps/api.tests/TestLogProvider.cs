using Hangfire.Logging;

namespace Kompanion.Api.Tests;

/// <summary>
/// Immortal Hangfire log sink for the test process.
///
/// Hangfire resolves its static <see cref="LogProvider"/> against host-owned
/// logging, and test classes build and dispose hosts in parallel while sharing
/// those statics. Once the owning host is disposed, any later static Hangfire
/// logging (for example the storage distributed-lock type initializer) throws
/// from an unrelated test. Pinning one provider that outlives every host removes
/// that lifetime coupling; production logging is untouched.
/// </summary>
public sealed class TestLogProvider : ILogProvider
{
    public static readonly TestLogProvider Instance = new();

    private TestLogProvider() { }

    public ILog GetLogger(string name) => TestLog.Instance;

    public IDisposable OpenNestedContext(string message) => TestLog.Instance;

    public IDisposable OpenMappedContext(string key, object value, bool destructure = false) => TestLog.Instance;

    private sealed class TestLog : ILog, IDisposable
    {
        public static readonly TestLog Instance = new();

        public bool Log(LogLevel logLevel, Func<string> messageFunc, Exception exception) => false;

        public void Dispose() { }
    }
}
