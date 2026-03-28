namespace Energy.Api.Infrastructure.Configuration;

public sealed class RuntimeEnergySettings
{
  public int PollingSeconds { get; set; } = 10;
  public string SmartMeterBaseUrl { get; set; } = string.Empty;
  public string SmaInverterBaseUrl { get; set; } = string.Empty;
  public bool SmaUseSsl { get; set; }
  public bool SmaVerifySsl { get; set; } = true;
  public string SmaGroup { get; set; } = "user";
  public string SmaExpectedSerial { get; set; } = string.Empty;
  public string EnphaseInverterBaseUrl { get; set; } = string.Empty;
  public bool EnphaseVerifySsl { get; set; }
  public string EnphaseUsername { get; set; } = string.Empty;
  public string EnphasePassword { get; set; } = string.Empty;
  public string EnphaseToken { get; set; } = string.Empty;
  public string SmaMeterUsername { get; set; } = "installer";
  public string SmaMeterPassword { get; set; } = "installer";
  public string SmaLoginRight { get; set; } = "usr";
  public string SmaPvPowerKey { get; set; } = "6100_0046C200";
  public string EnphaseSessionId { get; set; } = string.Empty;
}
