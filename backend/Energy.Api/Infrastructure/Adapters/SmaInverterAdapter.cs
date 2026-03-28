using System.Globalization;
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
  private string? _deviceUid;
  private DateTime _sessionExpires = DateTime.MinValue;
  private DateTime _nextLoginAttemptUtc = DateTime.MinValue;
  private readonly SemaphoreSlim _sessionLock = new(1, 1);

  private const string LoginEndpoint = "/dyn/login.json";
  private const string SessionCheckEndpoint = "/dyn/sessionCheck.json";
  private const string GetValuesEndpoint = "/dyn/getValues.json";
  private const string GetDashValuesEndpoint = "/dyn/getDashValues.json";
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

    await _sessionLock.WaitAsync(cancellationToken);
    try
    {
      if (string.IsNullOrWhiteSpace(cfg.SmaMeterPassword))
      {
        var anonymousPowerW = await FetchAnonymousPvPowerAsync(baseUrl, cfg, cancellationToken);
        return new SolarRealtime(DateTimeOffset.UtcNow, anonymousPowerW);
      }

      if (string.IsNullOrWhiteSpace(_sessionId) || DateTime.UtcNow >= _sessionExpires)
      {
        try
        {
          _sessionId = await LoginAsync(baseUrl, cfg, cancellationToken);
        }
        catch (AdapterFailureException ex) when (ex.Kind == AdapterFailureKind.Auth)
        {
          var anonymousPowerW = await TryFetchAnonymousPvPowerAsync(baseUrl, cfg, cancellationToken);
          if (anonymousPowerW.HasValue)
          {
            logger.LogInformation(ex, "SMA login was rejected, but anonymous dash values are available. Using no-login SMA mode.");
            return new SolarRealtime(DateTimeOffset.UtcNow, anonymousPowerW.Value);
          }

          throw;
        }

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
    finally
    {
      _sessionLock.Release();
    }
  }

  private async Task<string> LoginAsync(string baseUrl, RuntimeEnergySettings cfg, CancellationToken cancellationToken)
  {
    var password = string.IsNullOrWhiteSpace(cfg.SmaMeterPassword) ? "installer" : cfg.SmaMeterPassword;
    var right = ResolveSmaLoginRight(cfg);
    var loginUrl = $"{baseUrl}{LoginEndpoint}";
    var loginPayload = new { right, pass = password };

    var request = new HttpRequestMessage(HttpMethod.Post, loginUrl)
    {
      Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(loginPayload), System.Text.Encoding.UTF8, "application/json")
    };
    request.Headers.ConnectionClose = true;

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

    JsonDocument doc;
    try
    {
      doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
    }
    catch (JsonException ex)
    {
      throw new ConfigFailureException(nameof(SmaInverterAdapter), "SMA login did not return valid JSON.", ex);
    }

    using (doc)
    {
      if (TryReadLoginRejected(doc.RootElement))
        throw new AuthFailureException(nameof(SmaInverterAdapter), "SMA login was rejected by inverter.");

      if (TryReadErrorCode(doc.RootElement, out var errorCode))
        throw CreateLoginFailure(baseUrl, cfg, errorCode);

      var sid = TryReadSessionId(doc.RootElement);
      if (string.IsNullOrWhiteSpace(sid) || sid == "0")
      {
        var diagnostic = await TryBuildSessionCheckDiagnosticAsync(baseUrl, cfg, cancellationToken);
        var message = diagnostic is null
          ? "SMA login did not return result.sid. Check the password, group, and HTTP/HTTPS setting."
          : $"SMA login did not return result.sid. {diagnostic}";
        throw new AuthFailureException(nameof(SmaInverterAdapter), message);
      }

      ValidateExpectedSerial(cfg, doc.RootElement);

      logger.LogInformation("SMA login successful");
      return sid;
    }
  }

  private async Task<double> FetchPvPowerAsync(string baseUrl, string sessionId, RuntimeEnergySettings cfg, CancellationToken cancellationToken)
  {
    var url = BuildSessionUrl(baseUrl, GetValuesEndpoint, sessionId);
    var pvPowerKey = string.IsNullOrWhiteSpace(cfg.SmaPvPowerKey) ? "6100_0046C200" : cfg.SmaPvPowerKey.Trim();
    var payload = new { destDev = Array.Empty<string>(), keys = new[] { pvPowerKey } };
    var request = new HttpRequestMessage(HttpMethod.Post, url)
    {
      Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json")
    };
    request.Headers.ConnectionClose = true;

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

    JsonDocument doc;
    try
    {
      doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
    }
    catch (JsonException ex)
    {
      throw new ConfigFailureException(nameof(SmaInverterAdapter), "SMA getValues did not return valid JSON.", ex);
    }

    using (doc)
    {
      if (TryReadErrorCode(doc.RootElement, out var errorCode))
      {
        _sessionId = null;
        throw errorCode switch
        {
          401 or 403 => new AuthFailureException(nameof(SmaInverterAdapter), "SMA session expired."),
          _ => new TransientFailureException(nameof(SmaInverterAdapter), $"SMA getValues returned error code {errorCode}.")
        };
      }

      ValidateExpectedSerial(cfg, doc.RootElement);

      return TryReadPvPower(doc.RootElement, GetCandidatePvPowerKeys(cfg), out var power)
        ? power
        : 0.0;
    }
  }

  private async Task<double?> TryFetchAnonymousPvPowerAsync(string baseUrl, RuntimeEnergySettings cfg, CancellationToken cancellationToken)
  {
    try
    {
      return await FetchAnonymousPvPowerAsync(baseUrl, cfg, cancellationToken);
    }
    catch (AdapterFailureException ex) when (ex.Kind is AdapterFailureKind.Auth or AdapterFailureKind.Config or AdapterFailureKind.Transient)
    {
      logger.LogDebug(ex, "Anonymous SMA dash-value fallback failed.");
      return null;
    }
  }

  private async Task<double> FetchAnonymousPvPowerAsync(string baseUrl, RuntimeEnergySettings cfg, CancellationToken cancellationToken)
  {
    var url = $"{baseUrl}{GetDashValuesEndpoint}";
    var payload = new { destDev = Array.Empty<string>(), keys = Array.Empty<string>() };
    var request = new HttpRequestMessage(HttpMethod.Post, url)
    {
      Content = new StringContent(System.Text.Json.JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json")
    };
    request.Headers.ConnectionClose = true;

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
      throw new TransientFailureException(nameof(SmaInverterAdapter), "SMA dash values timed out.", ex);
    }
    catch (HttpRequestException ex)
    {
      throw new TransientFailureException(nameof(SmaInverterAdapter), "SMA dash values failed due to network error.", ex);
    }

    if ((int)response.StatusCode >= 500)
      throw new TransientFailureException(nameof(SmaInverterAdapter), $"SMA dash values returned transient status {response.StatusCode}.");

    if (!response.IsSuccessStatusCode)
      throw new ConfigFailureException(nameof(SmaInverterAdapter), $"SMA dash values failed: {response.StatusCode}.");

    JsonDocument doc;
    try
    {
      doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
    }
    catch (JsonException ex)
    {
      throw new ConfigFailureException(nameof(SmaInverterAdapter), "SMA dash values did not return valid JSON.", ex);
    }

    using (doc)
    {
      if (TryReadErrorCode(doc.RootElement, out var errorCode))
        throw errorCode switch
        {
          401 or 403 => new AuthFailureException(nameof(SmaInverterAdapter), "SMA dash values require a session."),
          _ => new ConfigFailureException(nameof(SmaInverterAdapter), $"SMA dash values returned error code {errorCode}.")
        };

      ValidateExpectedSerial(cfg, doc.RootElement);

      if (TryReadPvPower(doc.RootElement, GetCandidatePvPowerKeys(cfg), out var power))
      {
        return power;
      }

      throw new ConfigFailureException(nameof(SmaInverterAdapter), "SMA dash values were reachable, but no PV power metric was found.");
    }
  }

  private async Task<string?> TryBuildSessionCheckDiagnosticAsync(string baseUrl, RuntimeEnergySettings cfg, CancellationToken cancellationToken)
  {
    try
    {
      var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}{SessionCheckEndpoint}")
      {
        Content = new StringContent("{\"destDev\":[]}", System.Text.Encoding.UTF8, "application/json")
      };
      request.Headers.ConnectionClose = true;

      using var response = await SelectHttpClient(baseUrl, cfg).SendAsync(request, cancellationToken);
      if (!response.IsSuccessStatusCode)
      {
        return null;
      }

      using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
      if (!TryReadLoginCountdown(doc.RootElement, ResolveSmaLoginRight(cfg), out var seconds) || seconds <= 0)
      {
        return "The inverter is reachable, but it is rejecting this login. Check the selected SMA group and password.";
      }

      var group = cfg.SmaGroup.Equals("installer", StringComparison.OrdinalIgnoreCase) ? "installer" : "user";
      return $"The inverter is reachable, but the {group} login is blocked for about {seconds} seconds. Wait for the cooldown or switch to the correct group/password.";
    }
    catch
    {
      return null;
    }
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
    return cfg.SmaGroup.Equals("installer", StringComparison.OrdinalIgnoreCase) ? "istl" : "usr";
  }

  private static string BuildSessionUrl(string baseUrl, string endpoint, string sessionId)
  {
    return $"{baseUrl}{endpoint}?sid={Uri.EscapeDataString(sessionId)}";
  }

  private HttpClient SelectHttpClient(string baseUrl, RuntimeEnergySettings cfg)
  {
    if (!cfg.SmaVerifySsl && baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
    {
      return InsecureTlsClient;
    }

    return httpClient;
  }

  private AdapterFailureException CreateLoginFailure(string baseUrl, RuntimeEnergySettings cfg, int errorCode)
  {
    return errorCode switch
    {
      404 when !cfg.SmaUseSsl && !baseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase) =>
        new ConfigFailureException(nameof(SmaInverterAdapter), "SMA login endpoint was not found over HTTP. Try enabling HTTPS."),
      404 =>
        new ConfigFailureException(nameof(SmaInverterAdapter), "SMA login endpoint was not found at the configured URL."),
      503 =>
        new TransientFailureException(nameof(SmaInverterAdapter), "SMA reported that the maximum number of sessions has been reached."),
      401 or 403 =>
        new AuthFailureException(nameof(SmaInverterAdapter), "SMA login was rejected by inverter."),
      _ =>
        new AuthFailureException(nameof(SmaInverterAdapter), $"SMA login failed with device error code {errorCode}.")
    };
  }

  private static string[] GetCandidatePvPowerKeys(RuntimeEnergySettings cfg)
  {
    var configured = string.IsNullOrWhiteSpace(cfg.SmaPvPowerKey) ? null : cfg.SmaPvPowerKey.Trim();
    var candidates = new[]
    {
      configured,
      "6100_0046C200",
      "6380_40251E00",
      "6100_40263F00"
    };

    return candidates
      .Where(static key => !string.IsNullOrWhiteSpace(key))
      .Distinct(StringComparer.OrdinalIgnoreCase)
      .ToArray()!;
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

  private static bool TryReadErrorCode(JsonElement root, out int errorCode)
  {
    errorCode = 0;
    return TryFindIntRecursive(root, "err", out errorCode);
  }

  private static bool TryReadLoginCountdown(JsonElement root, string right, out int seconds)
  {
    seconds = 0;

    if (root.ValueKind != JsonValueKind.Object ||
        !root.TryGetProperty("result", out var result) ||
        result.ValueKind != JsonValueKind.Object ||
        !result.TryGetProperty("cntDwnLogin", out var countdowns) ||
        countdowns.ValueKind != JsonValueKind.Object)
    {
      return false;
    }

    var propertyName = string.Equals(right, "istl", StringComparison.OrdinalIgnoreCase) ? "istl" : "usr";
    return TryGetInt(countdowns, propertyName, out seconds);
  }

  private bool TryReadPvPower(JsonElement root, IEnumerable<string> candidateKeys, out double power)
  {
    power = 0;

    if (!TryReadResultBody(root, out var resultBody))
    {
      return false;
    }

    foreach (var candidateKey in candidateKeys)
    {
      if (!TryFindPropertyRecursive(resultBody, candidateKey, out var powerElement))
      {
        continue;
      }

      if (TryExtractPowerValue(powerElement, out power))
      {
        return true;
      }
    }

    return false;
  }

  private bool TryReadResultBody(JsonElement root, out JsonElement resultBody)
  {
    resultBody = default;

    if (root.ValueKind != JsonValueKind.Object ||
        !root.TryGetProperty("result", out var result) ||
        result.ValueKind != JsonValueKind.Object)
    {
      return false;
    }

    if (!string.IsNullOrWhiteSpace(_deviceUid) &&
        result.TryGetProperty(_deviceUid, out var cachedBody) &&
        cachedBody.ValueKind == JsonValueKind.Object)
    {
      resultBody = cachedBody;
      return true;
    }

    foreach (var property in result.EnumerateObject())
    {
      if (property.NameEquals("sid") || property.Value.ValueKind != JsonValueKind.Object)
      {
        continue;
      }

      _deviceUid = property.Name;
      resultBody = property.Value;
      return true;
    }

    return false;
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

  private static bool TryFindIntRecursive(JsonElement element, string propertyName, out int value)
  {
    value = 0;

    if (TryGetInt(element, propertyName, out value))
    {
      return true;
    }

    if (element.ValueKind == JsonValueKind.Object)
    {
      foreach (var property in element.EnumerateObject())
      {
        if (TryFindIntRecursive(property.Value, propertyName, out value))
        {
          return true;
        }
      }
    }
    else if (element.ValueKind == JsonValueKind.Array)
    {
      foreach (var item in element.EnumerateArray())
      {
        if (TryFindIntRecursive(item, propertyName, out value))
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

  private static bool TryFindPropertyRecursive(JsonElement element, string propertyName, out JsonElement value)
  {
    value = default;

    if (element.ValueKind == JsonValueKind.Object)
    {
      if (element.TryGetProperty(propertyName, out var propertyValue))
      {
        value = propertyValue;
        return true;
      }

      foreach (var property in element.EnumerateObject())
      {
        if (TryFindPropertyRecursive(property.Value, propertyName, out value))
        {
          return true;
        }
      }
    }
    else if (element.ValueKind == JsonValueKind.Array)
    {
      foreach (var item in element.EnumerateArray())
      {
        if (TryFindPropertyRecursive(item, propertyName, out value))
        {
          return true;
        }
      }
    }

    return false;
  }

  private static bool TryExtractPowerValue(JsonElement element, out double value)
  {
    value = 0;

    switch (element.ValueKind)
    {
      case JsonValueKind.Number:
        return element.TryGetDouble(out value);
      case JsonValueKind.String:
        return double.TryParse(element.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out value);
      case JsonValueKind.Object:
        if (element.TryGetProperty("val", out var valElement) && TryExtractPowerValue(valElement, out value))
        {
          return true;
        }

        if (element.TryGetProperty("value", out var valueElement) && TryExtractPowerValue(valueElement, out value))
        {
          return true;
        }

        var objectFound = false;
        var objectSum = 0.0;
        foreach (var property in element.EnumerateObject())
        {
          if (TryExtractPowerValue(property.Value, out var nestedValue))
          {
            objectFound = true;
            objectSum += nestedValue;
          }
        }

        if (objectFound)
        {
          value = objectSum;
          return true;
        }

        return false;
      case JsonValueKind.Array:
        var arrayFound = false;
        var arraySum = 0.0;
        foreach (var item in element.EnumerateArray())
        {
          if (TryExtractPowerValue(item, out var nestedValue))
          {
            arrayFound = true;
            arraySum += nestedValue;
          }
        }

        if (arrayFound)
        {
          value = arraySum;
          return true;
        }

        return false;
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

  private static bool TryGetInt(JsonElement element, string propertyName, out int value)
  {
    value = 0;
    if (element.ValueKind != JsonValueKind.Object)
    {
      return false;
    }

    if (!element.TryGetProperty(propertyName, out var prop))
    {
      return false;
    }

    if (prop.ValueKind == JsonValueKind.Number)
    {
      return prop.TryGetInt32(out value);
    }

    if (prop.ValueKind == JsonValueKind.String)
    {
      return int.TryParse(prop.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out value);
    }

    return false;
  }
}
