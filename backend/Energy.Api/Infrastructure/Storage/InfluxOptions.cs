namespace Energy.Api.Infrastructure.Storage;

public sealed class InfluxOptions
{
    public const string Section = "Influx";
    public string Url { get; set; } = "http://influxdb:8086";
    public string Token { get; set; } = string.Empty;
    public string Org { get; set; } = "home";
    public string Bucket { get; set; } = "energy";
}
