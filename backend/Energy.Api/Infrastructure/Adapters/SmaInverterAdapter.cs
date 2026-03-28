using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Energy.Api.Application;
using Energy.Api.Domain;
using Energy.Api.Infrastructure.Configuration;

namespace Energy.Api.Infrastructure.Adapters;

public sealed class SmaInverterAdapter(HttpClient httpClient, IRuntimeEnergySettings settings, ILogger<SmaInverterAdapter> logger) : ISolarInverterAdapter
{
  private static readonly HttpClient InsecureTlsClient = new(new HttpClientHandler
  {
    ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
  });

  private string? _sessionId;
  private DateTime _sessionExpires = DateTime.MinValue;
  private DateTime _nextLoginAttemptUtc = DateTime.MinValue;

  private const string LoginEndpoint = "/dyn/login.json";
  private const string GetValuesEndpoint = "/dyn/getValues.json";
  private const int SessionValidityMinutes = 15;
  private static readonly TimeSpan LoginRetryDelay = TimeSpan.FromSeconds(30);

  public async Task<SolarRealtime> GetRealtimeAsync(CancellationToken cancellationToken)
  {
    var cfg = settings.Get();
    if (string.IsNullOrWhiteSpace(cfg.SmaInverterBaseUrl))
      throw new ConfigFailureException(nameof(SmaInverterAdapter), "SmaInverterBaseUrl is required.");

    var baseUrl = BuildSmaBaseUrl(cfg);
    if (DateTime.UtcNow < _nextLoginAttemptUtc)
    {
      return new SolarRealtime(DateTimeOffset.UtcNow, 0);
    }

    if (string.IsNullOrWhiteSpace(_sessionId) || DateTime.UtcNow >= _sessionExpires)
    {
      _sessionId = await LoginAsync(baseUrl, cfg, cancellationToken);
      _sessionExpires = DateTime.UtcNow.AddMinutes(SessionValidityMinutes);
      _nextLoginAttemptUtc = DateTime.MinValue;
    }

    try
    {
      var pvPowerW = await FetchPvPowerAsync(baseUrl, _sessionId, cfg, cancellationToken);
      return new SolarRealtime(DateTimeOffset.UtcNow, pvPowerW);
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
      throw;
    }
    catch (AdapterFailureException ex) when (ex.Kind is AdapterFailureKind.Transient or AdapterFailureKind.Auth)
    {
      _sessionId = null;
      _sessionExpires = DateTime.MinValue;
      _nextLoginAttemptUtc = DateTime.UtcNow.Add(LoginRetryDelay);
      logger.LogWarning(ex, "SMA read failed, falling back to 0W until next retry window.");
      return new SolarRealtime(DateTimeOffset.UtcNow, 0);
    }
    catch (TaskCanceledException ex)
    {
      _sessionId = null;
      _sessionExpires = DateTime.MinValue;
      _nextLoginAttemptUtc = DateTime.UtcNow.Add(LoginRetryDelay);
      logger.LogWarning(ex, "SMA read timed out, falling back to 0W until next retry window.");
      return new SolarRealtime(DateTimeOffset.UtcNow, 0);
    }
  }

  private async Task<string> LoginAsync(string baseUrl, RuntimeEnergySettings cfg, CancellationToken cancellationToken)
  {
    var password = string.IsNullOrWhiteSpace(cfg.SmaMeterPassword) ? "installer" : cfg.SmaMeterPassword;
    var username = string.IsNullOrWhiteSpace(cfg.SmaMeterUsername) ? "installer" : cfg.SmaMeterUsername.Trim();
    var right = ResolveSmaLoginRight(cfg);
    var loginUrl = $"{baseUrl}{LoginEndpoint}";
    var loginPayload = new { right, user = username, pass = password };

    var request = new HttpRequestMessage(HttpMethod.Post, loginUrl)
    {
      Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(loginPayload), System.Text.Encoding.UTF8, "application/json")
    };

    HttpResponseMessage response;
    try
    {
      response = await SelectHttpClient(baseUrl, cfg).SendAsync(request, cancellationToken);
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
      throw;
    }
    catch (TaskCanceledException ex)
    {
      throw new TransientFailureException(nameof(SmaInverterAdapter), "SMA login timed out.", ex);
    }
    catch (HttpRequestException ex)
    {
      throw new TransientFailureException(nameof(SmaInverterAdapter), "SMA login failed due to network error.", ex);
    }

    if (response.StatusCode is System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden)
      throw new AuthFailureException(nameof(SmaInverterAdapter), $"SMA login failed with unauthorized status {response.StatusCode}.");

    if ((int)response.StatusCode >= 500)
      throw new TransientFailureException(nameof(SmaInverterAdapter), $"SMA login returned transient status {response.StatusCode}.");

    if (!response.IsSuccessStatusCode)
      throw new ConfigFailureException(nameof(SmaInverterAdapter), $"SMA login failed: {response.StatusCode}.");

    using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
    if (TryReadLoginRejected(doc.RootElement))
      throw new AuthFailureException(nameof(SmaInverterAdapter), "SMA login was rejected by inverter.");

    var sid = TryReadSessionId(doc.RootElement);
    if (string.IsNullOrWhiteSpace(sid) || sid == "0")
      throw new AuthFailureException(nameof(SmaInverterAdapter), "SMA login response did not include a session ID.");

    ValidateExpectedSerial(cfg, doc.RootElement);

    logger.LogInformation("SMA login successful");
    return sid;
  }

  private async Task<double> FetchPvPowerAsync(string baseUrl, string sessionId, RuntimeEnergySettings cfg, CancellationToken cancellationToken)
  {
    var url = $"{baseUrl}{GetValuesEndpoint}";
    var pvPowerKey = string.IsNullOrWhiteSpace(cfg.SmaPvPowerKey) ? "6100_40263F00" : cfg.SmaPvPowerKey.Trim();
    var payload = new { destDev = Array.Empty<string>(), keys = new[] { pvPowerKey } };
    var request = new HttpRequestMessage(HttpMethod.Post, url)
    {
      Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json")
    };
    request.Headers.Add("Cookie", $"SID={sessionId}");

    HttpResponseMessage response;
    try
    {
      response = await SelectHttpClient(baseUrl, cfg).SendAsync(request, cancellationToken);
    }
    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
    {
      throw;
    }
    catch (TaskCanceledException ex)
    {
      throw new TransientFailureException(nameof(SmaInverterAdapter), "SMA getValues timed out.", ex);
    }
    catch (HttpRequestException ex)
    {
      throw new TransientFailureException(nameof(SmaInverterAdapter), "SMA getValues failed due to network error.", ex);
    }

    if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
    {
      _sessionId = null;
      throw new AuthFailureException(nameof(SmaInverterAdapter), "SMA session expired.");
    }

    if ((int)response.StatusCode >= 500)
      throw new TransientFailureException(nameof(SmaInverterAdapter), $"SMA getValues returned transient status {response.StatusCode}.");

    if (!response.IsSuccessStatusCode)
      throw new ConfigFailureException(nameof(SmaInverterAdapter), $"SMA getValues failed: {response.StatusCode}.");

    var result = await response.Content.ReadFromJsonAsync<SmaGetValuesResponse>(cancellationToken);
    return result?.Result?.Values?.FirstOrDefault()?.FirstOrDefault()?.Value ?? 0.0;
  }

  private static string BuildSmaBaseUrl(RuntimeEnergySettings cfg)
  {
    var raw = cfg.SmaInverterBaseUrl.Trim();
    if (Uri.TryCreate(raw, UriKind.Absolute, out var absolute))
    {
      return absolute.ToString().TrimEnd('/');
    }

    var scheme = cfg.SmaUseSsl ? "https" : "http";
    var built = $"{scheme}://{raw}";
    if (!Uri.TryCreate(built, UriKind.Absolute, out var parsed))
    {
      throw new ConfigFailureException(nameof(SmaInverterAdapter), "SmaInverterBaseUrl must be a valid host or absolute URL.");
    }

    return parsed.ToString().TrimEnd('/');
  }

  private static string ResolveSmaLoginRight(RuntimeEnergySettings cfg)
  {
    if (!string.IsNullOrWhiteSpace(cfg.SmaLoginRight))
    {
      return cfg.SmaLoginRight.Trim();
    }

    return cfg.SmaGroup.Equals("installer", StringComparison.OrdinalIgnoreCase) ? "istl" : "usr";
  }

  private HttpClient SelectHttpClient(string baseUrl, RuntimeEnergySettings cfg)
  {
    if (!cfg.SmaVerifySsl && baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
    {
      return InsecureTlsClient;
    }

    return httpClient;
  }

  private static void ValidateExpectedSerial(RuntimeEnergySettings cfg, JsonElement root)
  {
    if (string.IsNullOrWhiteSpace(cfg.SmaExpectedSerial))
    {
      return;
    }

    var discovered = TryReadSerial(root);
    if (string.IsNullOrWhiteSpace(discovered))
    {
      return;
    }

    var normalize = new Func<string, string>(s => Regex.Replace(s, "[^0-9A-Za-z]", string.Empty));
    if (!string.Equals(normalize(discovered), normalize(cfg.SmaExpectedSerial), StringComparison.OrdinalIgnoreCase))
    {
      throw new AuthFailureException(nameof(SmaInverterAdapter), $"Configured SMA serial '{cfg.SmaExpectedSerial}' does not match discovered serial '{discovered}'.");
    }
  }

  private static string? TryReadSerial(JsonElement root)
  {
    if (TryFindStringRecursive(root, "serial", out var serial) ||
        TryFindStringRecursive(root, "sn", out serial) ||
        TryFindStringRecursive(root, "devSn", out serial) ||
        TryFindStringRecursive(root, "serialNumber", out serial))
    {
      return serial;
    }

    return null;
  }

  private static string? TryReadSessionId(JsonElement root)
  {
    // SMA firmware variants use different session field names and nesting.
    if (TryFindStringRecursive(root, "sid", out var sid) ||
        TryFindStringRecursive(root, "SID", out sid) ||
        TryFindStringRecursive(root, "sessionId", out sid) ||
        TryFindStringRecursive(root, "sessionID", out sid))
    {
      return sid;
    }

    return null;
  }

  private static bool TryReadLoginRejected(JsonElement root)
  {
    return (TryFindBooleanRecursive(root, "isLogin", out var login) && !login) ||
           (TryFindBooleanRecursive(root, "login", out var login2) && !login2) ||
           (TryFindBooleanRecursive(root, "authenticated", out var auth) && !auth);
  }

  private static bool TryFindStringRecursive(JsonElement element, string propertyName, out string value)
  {
    value = string.Empty;

    if (TryGetString(element, propertyName, out value))
    {
      return true;
    }

    if (element.ValueKind == JsonValueKind.Object)
    {
      foreach (var property in element.EnumerateObject())
      {
        if (TryFindStringRecursive(property.Value, propertyName, out value))
        {
          return true;
        }
      }
    }
    else if (element.ValueKind == JsonValueKind.Array)
    {
      foreach (var item in element.EnumerateArray())
      {
        if (TryFindStringRecursive(item, propertyName, out value))
        {
          return true;
        }
      }
    }

    return false;
  }

  private static bool TryFindBooleanRecursive(JsonElement element, string propertyName, out bool value)
  {
    value = false;

    if (TryGetBoolean(element, propertyName, out value))
    {
      return true;
    }

    if (element.ValueKind == JsonValueKind.Object)
    {
      foreach (var property in element.EnumerateObject())
      {
        if (TryFindBooleanRecursive(property.Value, propertyName, out value))
        {
          return true;
        }
      }
    }
    else if (element.ValueKind == JsonValueKind.Array)
    {
      foreach (var item in element.EnumerateArray())
      {
        if (TryFindBooleanRecursive(item, propertyName, out value))
        {
          return true;
        }
      }
    }

    return false;
  }

  private static bool TryGetString(JsonElement element, string propertyName, out string value)
  {
    value = string.Empty;
    if (element.ValueKind != JsonValueKind.Object)
    {
      return false;
    }

    if (!element.TryGetProperty(propertyName, out var prop) || prop.ValueKind != JsonValueKind.String)
    {
      return false;
    }

    var str = prop.GetString();
    if (string.IsNullOrWhiteSpace(str))
    {
      return false;
    }

    value = str;
    return true;
  }

  private static bool TryGetBoolean(JsonElement element, string propertyName, out bool value)
  {
    value = false;
    if (element.ValueKind != JsonValueKind.Object)
    {
      return false;
    }

    if (!element.TryGetProperty(propertyName, out var prop))
    {
      return false;
    }

    if (prop.ValueKind == JsonValueKind.True)
    {
      value = true;
      return true;
    }

    if (prop.ValueKind == JsonValueKind.False)
    {
      value = false;
      return true;
    }

    return false;
  }

  private record SmaGetValuesResponse([property: System.Text.Json.Serialization.JsonPropertyName("result")] SmaGetValuesResult? Result);
  private record SmaGetValuesResult([property: System.Text.Json.Serialization.JsonPropertyName("values")] List<List<SmaValue>>? Values);
  private record SmaValue([property: System.Text.Json.Serialization.JsonPropertyName("value")] double? Value);
}
