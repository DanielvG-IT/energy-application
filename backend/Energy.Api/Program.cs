using Energy.Api.Api;
using Energy.Api.Application;
using Energy.Api.HostedServices;
using Energy.Api.Infrastructure.Adapters;
using Energy.Api.Infrastructure.Configuration;
using Energy.Api.Infrastructure.Storage;
using Microsoft.Extensions.Http.Resilience;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddEndpointsApiExplorer();

builder.Services.Configure<InfluxOptions>(builder.Configuration.GetSection(InfluxOptions.Section));
builder.Services
  .AddOptions<InfluxOptions>()
  .Bind(builder.Configuration.GetSection(InfluxOptions.Section))
  .Validate(o =>
  {
    if (!Uri.TryCreate(o.Url, UriKind.Absolute, out var uri))
    {
      return false;
    }

    return uri.Scheme is "http" or "https";
  }, "Influx:Url must be a valid absolute http/https URL.")
  .Validate(o => !string.IsNullOrWhiteSpace(o.Org), "Influx:Org is required.")
  .Validate(o => !string.IsNullOrWhiteSpace(o.Bucket), "Influx:Bucket is required.")
  .ValidateOnStart();

builder.Services.AddSingleton<IRuntimeEnergySettings, RuntimeEnergySettingsStore>();

builder.Services.AddSingleton<IEnergyCalculator, EnergyCalculator>();
builder.Services.AddSingleton<IEnergyService, EnergyService>();

builder.Services.AddHttpClient<P1SmartMeterAdapter>()
  .AddStandardResilienceHandler();

builder.Services.AddHttpClient<SmaInverterAdapter>()
  .AddStandardResilienceHandler(options =>
  {
    // Must be greater than AttemptTimeout (default 10s) to satisfy resilience validation.
    options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(12);
  });

builder.Services.AddHttpClient<EnphaseInverterAdapter>()
  .AddStandardResilienceHandler();

builder.Services.AddHttpClient<InfluxEnergyRepository>()
  .AddStandardResilienceHandler();

builder.Services.AddSingleton<ISmartMeterAdapter>(sp => sp.GetRequiredService<P1SmartMeterAdapter>());
builder.Services.AddSingleton<ConfiguredSolarInverterAdapter>();
builder.Services.AddSingleton<ISolarInverterAdapter>(sp => sp.GetRequiredService<ConfiguredSolarInverterAdapter>());
builder.Services.AddSingleton<IEnergyRepository>(sp => sp.GetRequiredService<InfluxEnergyRepository>());

builder.Services.AddHostedService<EnergyPollingService>();

var allowedOrigins = builder.Configuration
  .GetSection("Cors:AllowedOrigins")
  .Get<string[]>()
  ?? ["http://localhost:5173"];

builder.Services.AddCors(options =>
{
  options.AddPolicy("frontend", p =>
  {
    p.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
  });
});

var app = builder.Build();

app.UseCors("frontend");
app.MapEnergyEndpoints();
app.Run();
