using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace Energy.Api.Infrastructure.Configuration;

public interface IRuntimeEnergySettings
{
  RuntimeEnergySettings Get();
  RuntimeEnergySettings Update(RuntimeEnergySettings updated);
}

public sealed class RuntimeEnergySettingsStore : IRuntimeEnergySettings
{
  private readonly object _lock = new();
  private readonly string _databasePath;
  private readonly ILogger<RuntimeEnergySettingsStore> _logger;
  private RuntimeEnergySettings _current;

  public RuntimeEnergySettingsStore(
      IWebHostEnvironment env,
      ILogger<RuntimeEnergySettingsStore> logger)
  {
    _logger = logger;
    _databasePath = Path.Combine(env.ContentRootPath, "energy-settings.db");
    _current = new RuntimeEnergySettings();

    EnsureSchema();
    _current = TryLoadFromDatabase() ?? _current;
  }

  public RuntimeEnergySettings Get()
  {
    lock (_lock)
    {
      return Clone(_current);
    }
  }

  public RuntimeEnergySettings Update(RuntimeEnergySettings updated)
  {
    lock (_lock)
    {
      _current = Normalize(updated);
      Validate(_current);
      TrySaveToDatabase();
      return Clone(_current);
    }
  }

  private void EnsureSchema()
  {
    try
    {
      using var connection = CreateConnection();
      connection.Open();

      using var command = connection.CreateCommand();
      command.CommandText = @"
CREATE TABLE IF NOT EXISTS RuntimeSettings (
  Id INTEGER PRIMARY KEY CHECK (Id = 1),
  Json TEXT NOT NULL,
  UpdatedUtc TEXT NOT NULL
);";

      command.ExecuteNonQuery();
    }
    catch (Exception ex)
    {
      _logger.LogWarning(ex, "Failed to initialize runtime settings database at {Path}.", _databasePath);
    }
  }

  private RuntimeEnergySettings? TryLoadFromDatabase()
  {
    try
    {
      using var connection = CreateConnection();
      connection.Open();

      using var command = connection.CreateCommand();
      command.CommandText = "SELECT Json FROM RuntimeSettings WHERE Id = 1 LIMIT 1;";
      var jsonObj = command.ExecuteScalar();
      if (jsonObj is not string json || string.IsNullOrWhiteSpace(json))
      {
        return null;
      }

      var fromDatabase = JsonSerializer.Deserialize<RuntimeEnergySettings>(json);
      if (fromDatabase is null)
      {
        return null;
      }

      _logger.LogInformation("Loaded runtime energy settings from database: {Path}", _databasePath);
      return Normalize(fromDatabase);
    }
    catch (Exception ex)
    {
      _logger.LogWarning(ex, "Failed to load runtime energy settings from database {Path}.", _databasePath);
      return null;
    }
  }

  private void TrySaveToDatabase()
  {
    try
    {
      using var connection = CreateConnection();
      connection.Open();

      var json = JsonSerializer.Serialize(_current, new JsonSerializerOptions { WriteIndented = true });

      using var command = connection.CreateCommand();
      command.CommandText = @"
INSERT INTO RuntimeSettings (Id, Json, UpdatedUtc)
VALUES (1, $json, $updatedUtc)
ON CONFLICT(Id) DO UPDATE SET
  Json = excluded.Json,
  UpdatedUtc = excluded.UpdatedUtc;";
      command.Parameters.AddWithValue("$json", json);
      command.Parameters.AddWithValue("$updatedUtc", DateTimeOffset.UtcNow.ToString("O"));
      command.ExecuteNonQuery();
    }
    catch (Exception ex)
    {
      _logger.LogWarning(ex, "Failed to persist runtime energy settings to database {Path}", _databasePath);
    }
  }

  private SqliteConnection CreateConnection() => new($"Data Source={_databasePath}");

  private static RuntimeEnergySettings Normalize(RuntimeEnergySettings options)
  {
    options.PollingSeconds = Math.Clamp(options.PollingSeconds, 5, 30);
    options.SmartMeterBaseUrl = (options.SmartMeterBaseUrl ?? string.Empty).Trim();
    options.SmaInverterBaseUrl = (options.SmaInverterBaseUrl ?? string.Empty).Trim();
    options.SmaGroup = string.IsNullOrWhiteSpace(options.SmaGroup) ? "user" : options.SmaGroup.Trim().ToLowerInvariant();
    options.SmaExpectedSerial = (options.SmaExpectedSerial ?? string.Empty).Trim();
    options.EnphaseInverterBaseUrl = (options.EnphaseInverterBaseUrl ?? string.Empty).Trim();
    options.EnphaseUsername = (options.EnphaseUsername ?? string.Empty).Trim();
    options.EnphasePassword ??= string.Empty;

    options.SmaMeterUsername ??= "installer";
    options.SmaMeterPassword ??= "installer";
    options.SmaLoginRight = options.SmaGroup == "installer" ? "istl" : "usr";
    options.SmaPvPowerKey = string.IsNullOrWhiteSpace(options.SmaPvPowerKey) ? "6100_0046C200" : options.SmaPvPowerKey.Trim();
    options.EnphaseToken ??= string.Empty;
    options.EnphaseSessionId ??= string.Empty;
    return options;
  }

  private static void Validate(RuntimeEnergySettings options)
  {
    ValidateOptionalHttpUrl(options.SmartMeterBaseUrl, nameof(options.SmartMeterBaseUrl));
    ValidateOptionalHostOrHttpUrl(options.SmaInverterBaseUrl, nameof(options.SmaInverterBaseUrl));
    ValidateOptionalHostOrHttpUrl(options.EnphaseInverterBaseUrl, nameof(options.EnphaseInverterBaseUrl));

    if (options.SmaGroup is not "user" and not "installer")
    {
      throw new ArgumentException("SmaGroup must be either 'user' or 'installer'.", nameof(options.SmaGroup));
    }
  }

  private static void ValidateOptionalHttpUrl(string value, string propertyName)
  {
    if (string.IsNullOrWhiteSpace(value))
    {
      return;
    }

    if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
        (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
    {
      throw new ArgumentException($"{propertyName} must be a valid absolute http/https URL.", propertyName);
    }
  }

  private static void ValidateOptionalHostOrHttpUrl(string value, string propertyName)
  {
    if (string.IsNullOrWhiteSpace(value))
    {
      return;
    }

    if (Uri.TryCreate(value, UriKind.Absolute, out var absolute))
    {
      if (absolute.Scheme == Uri.UriSchemeHttp || absolute.Scheme == Uri.UriSchemeHttps)
      {
        return;
      }

      throw new ArgumentException($"{propertyName} absolute URL must use http/https.", propertyName);
    }

    if (value.Contains(' ') || value.Contains('/'))
    {
      throw new ArgumentException($"{propertyName} must be a host/IP or absolute http/https URL.", propertyName);
    }
  }

  private static RuntimeEnergySettings Clone(RuntimeEnergySettings source) => new()
  {
    PollingSeconds = source.PollingSeconds,
    SmartMeterBaseUrl = source.SmartMeterBaseUrl,
    SmaInverterBaseUrl = source.SmaInverterBaseUrl,
    SmaUseSsl = source.SmaUseSsl,
    SmaVerifySsl = source.SmaVerifySsl,
    SmaGroup = source.SmaGroup,
    SmaExpectedSerial = source.SmaExpectedSerial,
    EnphaseInverterBaseUrl = source.EnphaseInverterBaseUrl,
    EnphaseVerifySsl = source.EnphaseVerifySsl,
    EnphaseUsername = source.EnphaseUsername,
    EnphasePassword = source.EnphasePassword,
    EnphaseToken = source.EnphaseToken,
    SmaMeterUsername = source.SmaMeterUsername,
    SmaMeterPassword = source.SmaMeterPassword,
    SmaLoginRight = source.SmaLoginRight,
    SmaPvPowerKey = source.SmaPvPowerKey,
    EnphaseSessionId = source.EnphaseSessionId
  };
}
