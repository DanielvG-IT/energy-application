using Energy.Api.Application;
using Energy.Api.Infrastructure.Configuration;
using Polly.Timeout;

namespace Energy.Api.Api;

public static class EnergyEndpoints
{
  public static IEndpointRouteBuilder MapEnergyEndpoints(this IEndpointRouteBuilder app)
  {
    var group = app.MapGroup("/api");

    group.MapGet("/now", async (IEnergyService service, CancellationToken ct) =>
    {
      try
      {
        var now = await service.GetNowAsync(ct);
        return now is null ? Results.NoContent() : Results.Ok(now);
      }
      catch (OperationCanceledException) when (ct.IsCancellationRequested)
      {
        throw;
      }
      catch (TimeoutRejectedException)
      {
        return Results.Problem(
          title: "Time-series storage timeout",
          detail: "InfluxDB did not respond in time. Check storage availability and Influx URL configuration.",
          statusCode: StatusCodes.Status503ServiceUnavailable);
      }
      catch (HttpRequestException)
      {
        return Results.Problem(
          title: "Time-series storage unreachable",
          detail: "Unable to reach InfluxDB. Check storage availability and Influx URL configuration.",
          statusCode: StatusCodes.Status503ServiceUnavailable);
      }
    });

    group.MapGet("/today", async (IEnergyService service, CancellationToken ct) =>
    {
      try
      {
        var (summary, insights) = await service.GetTodayAsync(ct);
        return Results.Ok(new { summary, insights });
      }
      catch (OperationCanceledException) when (ct.IsCancellationRequested)
      {
        throw;
      }
      catch (TimeoutRejectedException)
      {
        return Results.Problem(
          title: "Time-series storage timeout",
          detail: "InfluxDB did not respond in time. Check storage availability and Influx URL configuration.",
          statusCode: StatusCodes.Status503ServiceUnavailable);
      }
      catch (HttpRequestException)
      {
        return Results.Problem(
          title: "Time-series storage unreachable",
          detail: "Unable to reach InfluxDB. Check storage availability and Influx URL configuration.",
          statusCode: StatusCodes.Status503ServiceUnavailable);
      }
    });

    group.MapGet("/history", async (
        DateTimeOffset? from,
        DateTimeOffset? to,
        string? window,
        IEnergyService service,
        CancellationToken ct) =>
    {
      try
      {
        var rangeTo = to ?? DateTimeOffset.UtcNow;
        var rangeFrom = from ?? rangeTo.AddDays(-7);
        var selectedWindow = string.IsNullOrWhiteSpace(window) ? "day" : window;
        var history = await service.GetHistoryAsync(rangeFrom, rangeTo, selectedWindow, ct);
        return Results.Ok(history);
      }
      catch (OperationCanceledException) when (ct.IsCancellationRequested)
      {
        throw;
      }
      catch (TimeoutRejectedException)
      {
        return Results.Problem(
          title: "Time-series storage timeout",
          detail: "InfluxDB did not respond in time. Check storage availability and Influx URL configuration.",
          statusCode: StatusCodes.Status503ServiceUnavailable);
      }
      catch (HttpRequestException)
      {
        return Results.Problem(
          title: "Time-series storage unreachable",
          detail: "Unable to reach InfluxDB. Check storage availability and Influx URL configuration.",
          statusCode: StatusCodes.Status503ServiceUnavailable);
      }
    });

    group.MapGet("/health", () => Results.Ok(new { status = "ok" }));

    group.MapGet("/settings", (IRuntimeEnergySettings runtimeSettings) =>
    {
      var current = runtimeSettings.Get();
      return Results.Ok(current);
    });

    group.MapPut("/settings", (RuntimeEnergySettings request, IRuntimeEnergySettings runtimeSettings) =>
    {
      try
      {
        var updated = runtimeSettings.Update(request);
        return Results.Ok(updated);
      }
      catch (ArgumentException ex)
      {
        return Results.BadRequest(new { error = ex.Message });
      }
    });

    group.MapPost("/settings/test", async (
        ISmartMeterAdapter smartMeter,
        ISolarInverterAdapter inverter,
        IRuntimeEnergySettings runtimeSettings,
        CancellationToken ct) =>
    {
      var cfg = runtimeSettings.Get();
      using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
      timeout.CancelAfter(TimeSpan.FromSeconds(10));

      var meterOk = false;
      var inverterOk = false;
      string? meterError = null;
      string? inverterError = null;
      object? meterSample = null;
      object? inverterSample = null;

      try
      {
        var meter = await smartMeter.GetRealtimeAsync(timeout.Token);
        meterOk = true;
        meterSample = new
        {
          meter.ElectricityImportW,
          meter.ElectricityExportW,
          meter.GasFlowM3h
        };
      }
      catch (OperationCanceledException) when (ct.IsCancellationRequested)
      {
        throw;
      }
      catch (OperationCanceledException)
      {
        meterError = "Timed out after 10 seconds.";
      }
      catch (AdapterFailureException ex)
      {
        meterError = $"{ex.Kind}: {ex.Message}";
      }
      catch (Exception ex)
      {
        meterError = ex.Message;
      }

      try
      {
        var solar = await inverter.GetRealtimeAsync(timeout.Token);
        inverterOk = true;
        inverterSample = new
        {
          solar.ProductionW
        };
      }
      catch (OperationCanceledException) when (ct.IsCancellationRequested)
      {
        throw;
      }
      catch (OperationCanceledException)
      {
        inverterError = "Timed out after 10 seconds.";
      }
      catch (AdapterFailureException ex)
      {
        inverterError = $"{ex.Kind}: {ex.Message}";
      }
      catch (Exception ex)
      {
        inverterError = ex.Message;
      }

      var ok = meterOk && inverterOk;

      return Results.Ok(new
      {
        ok,
        smartMeter = new
        {
          ok = meterOk,
          error = meterError,
          sample = meterSample
        },
        inverter = new
        {
          ok = inverterOk,
          error = inverterError,
          sample = inverterSample
        }
      });
    });

    return app;
  }
}
