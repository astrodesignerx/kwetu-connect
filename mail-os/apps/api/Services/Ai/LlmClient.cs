using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Kompanion.Api.Services.Ai;

public class LlmOptions
{
    public string BaseUrl { get; set; } = "https://api.openai.com/v1";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "gpt-4o-mini";
    public int TimeoutSeconds { get; set; } = 30;
}

/// <summary>
/// Thin OpenAI-compatible chat completions client. Targets the
/// <c>POST {base}/chat/completions</c> endpoint, which every major LLM provider
/// (OpenAI, OpenRouter, Groq, Together, Ollama, etc.) implements. The API key
/// never leaves the server.
/// </summary>
public class LlmClient
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly IOptions<LlmOptions> _options;

    public LlmClient(IHttpClientFactory httpFactory, IOptions<LlmOptions> options)
    {
        _httpFactory = httpFactory;
        _options = options;
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.Value.ApiKey);

    public LlmOptions Options => _options.Value;

    public async Task<string> ChatAsync(
        IReadOnlyList<ChatMessage> messages,
        IReadOnlyDictionary<string, object>? options = null,
        CancellationToken ct = default)
    {
        if (!IsConfigured)
            throw new LlmUnavailableException("LLM provider is not configured (missing LLM:ApiKey).");

        var client = _httpFactory.CreateClient("llm");
        client.Timeout = TimeSpan.FromSeconds(_options.Value.TimeoutSeconds);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.Value.ApiKey);

        var request = new ChatCompletionRequest
        {
            Model = _options.Value.Model,
            Messages = messages.ToList(),
            Temperature = TryGetDouble(options, "temperature") ?? 0.4,
            MaxTokens = TryGetInt(options, "maxTokens") ?? 800,
        };
        var url = _options.Value.BaseUrl.TrimEnd('/') + "/chat/completions";
        var response = await client.PostAsJsonAsync(url, request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            throw new LlmUnavailableException(
                $"LLM provider returned {(int)response.StatusCode} {response.StatusCode}: {Truncate(body, 200)}");
        }
        var result = await response.Content.ReadFromJsonAsync<ChatCompletionResponse>(cancellationToken: ct);
        var content = result?.Choices?.FirstOrDefault()?.Message?.Content;
        if (string.IsNullOrWhiteSpace(content))
            throw new LlmUnavailableException("LLM provider returned an empty response.");
        return content!;
    }

    private static double? TryGetDouble(IReadOnlyDictionary<string, object>? options, string key)
        => options is not null
            && options.TryGetValue(key, out var v)
            && v is double d ? d
            : options is not null
            && options.TryGetValue(key, out var v2)
            && double.TryParse(v2?.ToString(), out var p) ? p : null;

    private static int? TryGetInt(IReadOnlyDictionary<string, object>? options, string key)
        => options is not null
            && options.TryGetValue(key, out var v)
            && v is int i ? i : null;

    private static string Truncate(string s, int n) => s.Length <= n ? s : s.Substring(0, n) + "…";

    public sealed class LlmUnavailableException : Exception
    {
        public LlmUnavailableException(string message) : base(message) { }
    }
}

public sealed record ChatMessage(string Role, string Content);

internal sealed class ChatCompletionRequest
{
    [JsonPropertyName("model")] public string Model { get; set; } = "";
    [JsonPropertyName("messages")] public List<ChatMessage> Messages { get; set; } = new();
    [JsonPropertyName("temperature")] public double Temperature { get; set; }
    [JsonPropertyName("max_tokens")] public int MaxTokens { get; set; }
}

internal sealed class ChatCompletionResponse
{
    [JsonPropertyName("choices")] public List<ChatChoice>? Choices { get; set; }
}

internal sealed class ChatChoice
{
    [JsonPropertyName("message")] public ChatMessage? Message { get; set; }
}
