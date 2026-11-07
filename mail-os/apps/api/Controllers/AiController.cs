using System.Security.Claims;
using Kompanion.Api.Auth;
using Kompanion.Api.Models;
using Kompanion.Api.Services.Ai;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Kompanion.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/ai")]
[EnableRateLimiting(RateLimitPolicies.Ai)]
public class AiController : ControllerBase
{
    private readonly AiAssistant _assistant;
    private readonly LlmClient _llm;

    public AiController(AiAssistant assistant, LlmClient llm)
    {
        _assistant = assistant;
        _llm = llm;
    }

    private Guid UserId() =>
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    [HttpGet("status")]
    public IActionResult Status() => Ok(new
    {
        configured = _llm.IsConfigured,
        model = _llm.Options.Model
    });

    [HttpPost("summarize")]
    public async Task<IActionResult> Summarize(SummarizeRequest body, CancellationToken ct)
    {
        if (!_llm.IsConfigured) return Unavailable();
        try
        {
            var result = await _assistant.SummarizeThreadAsync(body.ThreadId, UserId(), ct);
            return Ok(new SummarizeResponse(result.Summary, result.MessageCount, result.Model));
        }
        catch (KeyNotFoundException) { return NotFound(new { error = "Thread not found." }); }
        catch (LlmClient.LlmUnavailableException ex) { return Unavailable(ex.Message); }
    }

    [HttpPost("reply")]
    public async Task<IActionResult> Reply(SuggestReplyRequest body, CancellationToken ct)
    {
        if (!_llm.IsConfigured) return Unavailable();
        try
        {
            var reply = await _assistant.SuggestReplyAsync(body.ThreadId, UserId(), body.Tone, ct);
            return Ok(new SuggestReplyResponse(reply));
        }
        catch (KeyNotFoundException) { return NotFound(new { error = "Thread not found." }); }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        catch (LlmClient.LlmUnavailableException ex) { return Unavailable(ex.Message); }
    }

    [HttpPost("rewrite")]
    public async Task<IActionResult> Rewrite(RewriteRequest body, CancellationToken ct)
    {
        if (!_llm.IsConfigured) return Unavailable();
        try
        {
            var rewritten = await _assistant.RewriteAsync(body.Body, body.Tone, ct);
            return Ok(new RewriteResponse(rewritten));
        }
        catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        catch (LlmClient.LlmUnavailableException ex) { return Unavailable(ex.Message); }
    }

    private IActionResult Unavailable(string? detail = null) =>
        StatusCode(503, new
        {
            error = "AI is not configured. Add an LLM:ApiKey value in appsettings.json (or via the LLM__ApiKey env var) to enable AI actions.",
            detail
        });
}
