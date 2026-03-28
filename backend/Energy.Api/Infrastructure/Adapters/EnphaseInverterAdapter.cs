using System.Net;
using System.Net.Http.Headers;
using System.Security.Authentication;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Energy.Api.Application;
using Energy.Api.Domain;
using Energy.Api.Infrastructure.Configuration;

namespace Energy.Api.Infrastructure.Adapters;

public sealed class EnphaseInverterAdapter(
  HttpClient httpClient,
  IRuntimeEnergySettings settings,
  ILogger<EnphaseInverterAdapter> logger) : ISolarInverterAdapter
{
  private const string AdapterName = nameof(EnphaseInverterAdapter);
  private const string JwtCheckEndpoint = "/auth/check_jwt";
  private const string EnlightenLoginUrl = "https://enlighten.enphaseenergy.com/login/login.json?";
  private const string EnlightenTokenUrl = "https://entrez.enphaseenergy.com/tokens";

  private static readonly HttpClient InsecureTlsClient = new(new HttpClientHandler
  {
    ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
  });

  private readonly SemaphoreSlim _authLock = new(1, 1);
  private EnphaseSetupInfo? _cachedSetup;

  public async Task<SolarRealtime> GetRealtimeAsync(CancellationToken cancellationToken)
  {
    var cfg = settings.Get();
    if (string.IsNullOrWhiteSpace(cfg.EnphaseInverterBaseUrl))
    {
      throw new ConfigFailureException(AdapterName, "EnphaseInverterBaseUrl is required.");
    }

    var setup = await GetSetupInfoAsync(cfg, cancellationToken);
    var token = setup.RequiresTokenAuth
      ? await GetValidTokenAsync(setup, cfg, forceRefresh: false, cancellationToken)
      : null;

    var watts = await QueryProductionAsync(setup, cfg, token, cancellationToken);
    return new SolarRealtime(DateTimeOffset.UtcNow, watts);
  }

  private async Task<EnphaseSetupInfo> GetSetupInfoAsync(RuntimeEnergySettings cfg, CancellationToken cancellationToken)
  {
    await _authLock.WaitAsync(cancellationToken);
    try
    {
      var signature = $"{cfg.EnphaseInverterBaseUrl}|{cfg.EnphaseVerifySsl}";
      if (_cachedSetup is not null && _cachedSetup.Signature == signature)
      {
        return _cachedSetup;
      }

      var candidates = BuildInfoCandidates(cfg.EnphaseInverterBaseUrl);
      AdapterFailureException? lastFailure = null;

      foreach (var candidate in candidates)
      {
        try
        {
          using var response = await SendLocalAsync(HttpMethod.Get, candidate.InfoUrl, cfg, cancellationToken);
          if (response.StatusCode != HttpStatusCode.OK)
          {
            lastFailure = new ConfigFailureException(AdapterName, $"Enphase /info returned {response.StatusCode}.");
            continue;
          }

          await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
          var document = await XDocument.LoadAsync(stream, LoadOptions.None, cancellationToken);
          var device = document.Root?.Element("device");
          var firmwareText = device?.Element("software")?.Value?.Trim();
          if (string.IsNullOrWhiteSpace(firmwareText))
          {
            throw new ConfigFailureException(AdapterName, "Enphase /info did not include a firmware version.");
          }

          var normalizedFirmware = firmwareText.TrimStart('R', 'D', 'r', 'd');
          if (!Version.TryParse(normalizedFirmware, out var firmwareVersion))
          {
            throw new ConfigFailureException(AdapterName, $"Enphase firmware '{firmwareText}' could not be parsed.");
          }

          var serial = device?.Element("sn")?.Value?.Trim();
          var localBaseUrl = firmwareVersion.Major >= 7
            ? $"https://{candidate.Authority}"
            : candidate.BaseUrl;

          _cachedSetup = new EnphaseSetupInfo(
            signature,
            candidate.Authority,
            localBaseUrl,
            firmwareVersion,
            firmwareVersion.Major >= 7,
            serial);

          return _cachedSetup;
        }
        catch (AdapterFailureException ex)
        {
          lastFailure = ex;
        }
      }

      throw lastFailure ?? new ConfigFailureException(AdapterName, "Unable to query Enphase /info endpoint.");
    }
    finally
    {
      _authLock.Release();
    }
  }

  private async Task<string> GetValidTokenAsync(
    EnphaseSetupInfo setup,
    RuntimeEnergySettings cfg,
    bool forceRefresh,
    CancellationToken cancellationToken)
  {
    var existingToken = forceRefresh ? string.Empty : cfg.EnphaseToken?.Trim() ?? string.Empty;

    if (!string.IsNullOrWhiteSpace(existingToken) && !IsTokenExpired(existingToken))
    {
      try
      {
        await ValidateTokenAsync(setup, cfg, existingToken, cancellationToken);
        return existingToken;
      }
      catch (AdapterFailureException ex) when (ex.Kind is AdapterFailureKind.Auth or AdapterFailureKind.Transient)
      {
        logger.LogWarning(ex, "Existing Enphase token validation failed; obtaining a fresh token.");
      }
    }

    var newToken = await ObtainTokenFromCloudAsync(setup, cfg, cancellationToken);
    await ValidateTokenAsync(setup, cfg, newToken, cancellationToken);
    PersistToken(cfg, newToken);
    return newToken;
  }

  private async Task<double> QueryProductionAsync(
    EnphaseSetupInfo setup,
    RuntimeEnergySettings cfg,
    string? token,
    CancellationToken cancellationToken)
  {
    var endpoints = BuildProductionEndpoints(setup.LocalBaseUrl);
    AdapterFailureException? lastFailure = null;
    var hasRefreshedToken = false;

    while (true)
    {
      var shouldRetryWithFreshToken = false;

      foreach (var endpoint in endpoints)
      {
        try
        {
          using var response = await SendProductionRequestAsync(endpoint, cfg, token, cancellationToken);
          if (response.StatusCode == HttpStatusCode.NotFound)
          {
            continue;
          }

          if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
          {
            throw new AuthFailureException(AdapterName, $"Enphase endpoint {endpoint} returned unauthorized status {response.StatusCode}.");
          }

          if ((int)response.StatusCode >= 500)
          {
            throw new TransientFailureException(AdapterName, $"Enphase endpoint {endpoint} returned transient status {response.StatusCode}.");
          }

          if (!response.IsSuccessStatusCode)
          {
            throw new ConfigFailureException(AdapterName, $"Enphase endpoint {endpoint} failed with status {response.StatusCode}.");
          }

          await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
          using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
          if (TryExtractProductionWatts(document.RootElement, out var watts))
          {
            logger.LogDebug("Enphase endpoint {Endpoint} returned {Watts}W", endpoint, watts);
            return watts;
          }
        }
        catch (AdapterFailureException ex) when (
          ex.Kind == AdapterFailureKind.Auth &&
          setup.RequiresTokenAuth &&
          !hasRefreshedToken)
        {
          token = await GetValidTokenAsync(setup, cfg, forceRefresh: true, cancellationToken);
          hasRefreshedToken = true;
          shouldRetryWithFreshToken = true;
          lastFailure = ex;
          break;
        }
        catch (AdapterFailureException ex)
        {
          lastFailure = ex;
        }
      }

      if (!shouldRetryWithFreshToken)
      {
        break;
      }
    }

    throw lastFailure ?? new ConfigFailureException(
      AdapterName,
      "Enphase query failed because none of the plugin-style production endpoints returned a usable production value.");
  }

  private async Task<string> ObtainTokenFromCloudAsync(
    EnphaseSetupInfo setup,
    RuntimeEnergySettings cfg,
    CancellationToken cancellationToken)
  {
    if (string.IsNullOrWhiteSpace(cfg.EnphaseUsername) || string.IsNullOrWhiteSpace(cfg.EnphasePassword))
    {
      throw new ConfigFailureException(
        AdapterName,
        "Enphase firmware 7+ requires your Enlighten cloud username and password so the backend can obtain a local token automatically.");
    }

    if (string.IsNullOrWhiteSpace(setup.Serial))
    {
      throw new ConfigFailureException(
        AdapterName,
        "Enphase /info did not provide a serial number, so the backend cannot request a cloud token.");
    }

    using var loginRequest = new HttpRequestMessage(HttpMethod.Post, EnlightenLoginUrl)
    {
      Content = new FormUrlEncodedContent(new Dictionary<string, string>
      {
        ["user[email]"] = cfg.EnphaseUsername.Trim(),
        ["user[password]"] = cfg.EnphasePassword
      })
    };

    using var loginResponse = await httpClient.SendAsync(loginRequest, cancellationToken);
    if (loginResponse.StatusCode != HttpStatusCode.OK)
    {
      var loginText = await loginResponse.Content.ReadAsStringAsync(cancellationToken);
      throw new AuthFailureException(
        AdapterName,
        $"Unable to log in to Enlighten to obtain an Enphase token: {(int)loginResponse.StatusCode} {loginText}");
    }

    using var loginDocument = JsonDocument.Parse(await loginResponse.Content.ReadAsStringAsync(cancellationToken));
    if (!loginDocument.RootElement.TryGetProperty("session_id", out var sessionIdElement) ||
        string.IsNullOrWhiteSpace(sessionIdElement.GetString()))
    {
      throw new AuthFailureException(
        AdapterName,
        "Enlighten login did not return a session_id. If MFA is enabled on this account, disable it for the Enphase integration flow.");
    }

    var sessionId = sessionIdElement.GetString()!;
    using var tokenRequest = new HttpRequestMessage(HttpMethod.Post, EnlightenTokenUrl)
    {
      Content = new StringContent(JsonSerializer.Serialize(new
      {
        session_id = sessionId,
        serial_num = setup.Serial,
        username = cfg.EnphaseUsername.Trim()
      }), Encoding.UTF8, "application/json")
    };

    using var tokenResponse = await httpClient.SendAsync(tokenRequest, cancellationToken);
    if (tokenResponse.StatusCode != HttpStatusCode.OK)
    {
      var tokenText = await tokenResponse.Content.ReadAsStringAsync(cancellationToken);
      throw new AuthFailureException(
        AdapterName,
        $"Unable to obtain an Enphase token from the Enlighten token service: {(int)tokenResponse.StatusCode} {tokenText}");
    }

    var token = (await tokenResponse.Content.ReadAsStringAsync(cancellationToken)).Trim();
    if (string.IsNullOrWhiteSpace(token))
    {
      throw new AuthFailureException(AdapterName, "The Enlighten token service returned an empty token.");
    }

    return token;
  }

  private async Task ValidateTokenAsync(
    EnphaseSetupInfo setup,
    RuntimeEnergySettings cfg,
    string token,
    CancellationToken cancellationToken)
  {
    using var request = new HttpRequestMessage(HttpMethod.Get, $"{setup.LocalBaseUrl}{JwtCheckEndpoint}");
    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

    HttpResponseMessage response;
    try
    {
      response = await SelectLocalHttpClient(request.RequestUri!, cfg).SendAsync(request, cancellationToken);
    }
    catch (HttpRequestException ex) when (IsCertificateValidationFailure(ex))
    {
      throw new ConfigFailureException(
        AdapterName,
        "Enphase HTTPS certificate validation failed. Leave SSL verification off for local self-signed Envoy devices.",
        ex);
    }
    catch (HttpRequestException ex)
    {
      throw new TransientFailureException(AdapterName, "Failed to validate the Enphase token with the local Envoy.", ex);
    }

    using (response)
    {
      if (response.StatusCode == HttpStatusCode.OK)
      {
        return;
      }

      if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
      {
        throw new AuthFailureException(AdapterName, "The local Envoy rejected the Enphase token.");
      }

      throw new ConfigFailureException(AdapterName, $"Enphase token validation failed with status {response.StatusCode}.");
    }
  }

  private async Task<HttpResponseMessage> SendProductionRequestAsync(
    string endpoint,
    RuntimeEnergySettings cfg,
    string? token,
    CancellationToken cancellationToken)
  {
    using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
    if (!string.IsNullOrWhiteSpace(token))
    {
      request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }
    else if (!string.IsNullOrWhiteSpace(cfg.EnphaseSessionId))
    {
      request.Headers.Add("Cookie", $"sessionId={cfg.EnphaseSessionId}");
    }

    try
    {
      return await SelectLocalHttpClient(request.RequestUri!, cfg).SendAsync(request, cancellationToken);
    }
    catch (HttpRequestException ex) when (IsCertificateValidationFailure(ex))
    {
      throw new ConfigFailureException(
        AdapterName,
        "Enphase HTTPS certificate validation failed. Leave SSL verification off for local self-signed Envoy devices.",
        ex);
    }
    catch (HttpRequestException ex)
    {
      throw new TransientFailureException(AdapterName, $"Failed to query Enphase endpoint {endpoint}.", ex);
    }
  }

  private async Task<HttpResponseMessage> SendLocalAsync(
    HttpMethod method,
    Uri uri,
    RuntimeEnergySettings cfg,
    CancellationToken cancellationToken)
  {
    using var request = new HttpRequestMessage(method, uri);
    try
    {
      return await SelectLocalHttpClient(uri, cfg).SendAsync(request, cancellationToken);
    }
    catch (HttpRequestException ex) when (IsCertificateValidationFailure(ex))
    {
      throw new ConfigFailureException(
        AdapterName,
        "Enphase HTTPS certificate validation failed. Leave SSL verification off for local self-signed Envoy devices.",
        ex);
    }
    catch (HttpRequestException ex)
    {
      throw new TransientFailureException(AdapterName, $"Failed to query local Enphase endpoint {uri}.", ex);
    }
  }

  private static IReadOnlyList<EndpointCandidate> BuildInfoCandidates(string rawBase)
  {
    var trimmed = rawBase.Trim();
    if (Uri.TryCreate(trimmed, UriKind.Absolute, out var absolute))
    {
      if (absolute.Scheme is not "http" and not "https")
      {
        throw new ConfigFailureException(AdapterName, "EnphaseInverterBaseUrl absolute URL must use http/https.");
      }

      var authority = absolute.IsDefaultPort ? absolute.Host : $"{absolute.Host}:{absolute.Port}";
      var scheme = absolute.Scheme;
      var baseUrl = $"{scheme}://{authority}";
      var candidates = new List<EndpointCandidate> { new(authority, baseUrl, new Uri($"{baseUrl}/info")) };

      if (scheme == Uri.UriSchemeHttps)
      {
        candidates.Add(new EndpointCandidate(authority, $"http://{authority}", new Uri($"http://{authority}/info")));
      }

      return candidates;
    }

    var authorityOnly = trimmed;
    if (string.IsNullOrWhiteSpace(authorityOnly) || authorityOnly.Contains(' ') || authorityOnly.Contains('/'))
    {
      throw new ConfigFailureException(AdapterName, "EnphaseInverterBaseUrl must be a host/IP or absolute http/https URL.");
    }

    return
    [
      new EndpointCandidate(authorityOnly, $"https://{authorityOnly}", new Uri($"https://{authorityOnly}/info")),
      new EndpointCandidate(authorityOnly, $"http://{authorityOnly}", new Uri($"http://{authorityOnly}/info"))
    ];
  }

  private static IReadOnlyList<string> BuildProductionEndpoints(string baseUrl) =>
  [
    $"{baseUrl}/production.json?details=1",
    $"{baseUrl}/production.json",
    $"{baseUrl}/api/v1/production"
  ];

  private static bool IsTokenExpired(string token)
  {
    if (!TryReadJwtExpiration(token, out var expiresUtc))
    {
      return true;
    }

    return expiresUtc <= DateTimeOffset.UtcNow.AddMinutes(5);
  }

  private static bool TryReadJwtExpiration(string token, out DateTimeOffset expiresUtc)
  {
    expiresUtc = default;
    var parts = token.Split('.');
    if (parts.Length < 2)
    {
      return false;
    }

    try
    {
      var payloadBytes = DecodeBase64Url(parts[1]);
      using var document = JsonDocument.Parse(payloadBytes);
      if (!document.RootElement.TryGetProperty("exp", out var expElement) || !expElement.TryGetInt64(out var exp))
      {
        return false;
      }

      expiresUtc = DateTimeOffset.FromUnixTimeSeconds(exp);
      return true;
    }
    catch
    {
      return false;
    }
  }

  private static byte[] DecodeBase64Url(string value)
  {
    var normalized = value.Replace('-', '+').Replace('_', '/');
    var padding = 4 - (normalized.Length % 4);
    if (padding is > 0 and < 4)
    {
      normalized = normalized.PadRight(normalized.Length + padding, '=');
    }

    return Convert.FromBase64String(normalized);
  }

  private void PersistToken(RuntimeEnergySettings cfg, string token)
  {
    if (string.Equals(cfg.EnphaseToken, token, StringComparison.Ordinal))
    {
      return;
    }

    var updated = settings.Get();
    updated.EnphaseToken = token;
    settings.Update(updated);
  }

  private HttpClient SelectLocalHttpClient(Uri uri, RuntimeEnergySettings cfg)
  {
    if (!cfg.EnphaseVerifySsl && uri.Scheme == Uri.UriSchemeHttps)
    {
      return InsecureTlsClient;
    }

    return httpClient;
  }

  private static bool IsCertificateValidationFailure(HttpRequestException ex) =>
    ex.InnerException is AuthenticationException authEx &&
    authEx.Message.Contains("certificate", StringComparison.OrdinalIgnoreCase);

  private static bool TryExtractProductionWatts(JsonElement element, out double watts)
  {
    watts = 0;

    if (TryGetNumericProperty(element, "wattsNow", out watts) ||
        TryGetNumericProperty(element, "wNow", out watts))
    {
      return true;
    }

    if (element.ValueKind == JsonValueKind.Object)
    {
      if (TryExtractPreferredProductionObject(element, out watts))
      {
        return true;
      }

      foreach (var property in element.EnumerateObject())
      {
        if (TryExtractProductionWatts(property.Value, out watts))
        {
          return true;
        }
      }
    }
    else if (element.ValueKind == JsonValueKind.Array)
    {
      foreach (var item in element.EnumerateArray())
      {
        if (TryExtractProductionWatts(item, out watts))
        {
          return true;
        }
      }
    }

    return false;
  }

  private static bool TryExtractPreferredProductionObject(JsonElement element, out double watts)
  {
    watts = 0;
    if (element.ValueKind != JsonValueKind.Object)
    {
      return false;
    }

    if (TryGetStringProperty(element, "type", out var type) &&
        string.Equals(type, "inverters", StringComparison.OrdinalIgnoreCase) &&
        TryGetNumericProperty(element, "wNow", out watts))
    {
      return true;
    }

    if (TryGetStringProperty(element, "measurementType", out var measurementType) &&
        measurementType.Contains("production", StringComparison.OrdinalIgnoreCase) &&
        (TryGetNumericProperty(element, "wNow", out watts) || TryGetNumericProperty(element, "wattsNow", out watts)))
    {
      return true;
    }

    return false;
  }

  private static bool TryGetNumericProperty(JsonElement element, string propertyName, out double value)
  {
    value = 0;
    if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property))
    {
      return false;
    }

    return property.ValueKind switch
    {
      JsonValueKind.Number => property.TryGetDouble(out value),
      JsonValueKind.String => double.TryParse(property.GetString(), out value),
      _ => false
    };
  }

  private static bool TryGetStringProperty(JsonElement element, string propertyName, out string value)
  {
    value = string.Empty;
    if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property) || property.ValueKind != JsonValueKind.String)
    {
      return false;
    }

    value = property.GetString() ?? string.Empty;
    return !string.IsNullOrWhiteSpace(value);
  }

  private sealed record EndpointCandidate(string Authority, string BaseUrl, Uri InfoUrl);

  private sealed record EnphaseSetupInfo(
    string Signature,
    string Authority,
    string LocalBaseUrl,
    Version FirmwareVersion,
    bool RequiresTokenAuth,
    string? Serial);
}
