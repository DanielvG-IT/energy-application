using Energy.Api.Application;
using Energy.Api.Infrastructure.Adapters;
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
        SmaInverterAdapter sma,
        EnphaseInverterAdapter enphase,
        IEnergyRepository repository,
        IRuntimeEnergySettings runtimeSettings,
        CancellationToken ct) =>
    {
      const int testTimeoutSeconds = 10;
      var cfg = runtimeSettings.Get();
      var smaConfigured = !string.IsNullOrWhiteSpace(cfg.SmaInverterBaseUrl);
      var enphaseConfigured = !string.IsNullOrWhiteSpace(cfg.EnphaseInverterBaseUrl);

      static string FormatFailure(Exception ex) =>
        ex is AdapterFailureException adapterFailure
          ? $"{adapterFailure.Kind}: {adapterFailure.Message}"
          : ex.Message;

      async Task<(bool Ok, string? Error, object? Sample)> RunProbeAsync(Func<CancellationToken, Task<object?>> probe)
      {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(testTimeoutSeconds));

        try
        {
          return (true, null, await probe(timeout.Token));
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
          throw;
        }
        catch (OperationCanceledException)
        {
          return (false, $"Timed out after {testTimeoutSeconds} seconds.", null);
        }
        catch (TimeoutRejectedException)
        {
          return (false, $"Timed out after {testTimeoutSeconds} seconds.", null);
        }
        catch (Exception ex)
        {
          return (false, FormatFailure(ex), null);
        }
      }

      var meterTask = RunProbeAsync(async token =>
      {
        var meter = await smartMeter.GetRealtimeAsync(token);
        return (object?)new
        {
          meter.ElectricityImportW,
          meter.ElectricityExportW,
          meter.GasFlowM3h
        };
      });

      var smaTask = smaConfigured
        ? RunProbeAsync(async token =>
        {
          var solar = await sma.GetRealtimeAsync(token);
          return (object?)new
          {
            solar.ProductionW
          };
        })
        : Task.FromResult((false, (string?)null, (object?)null));

      var enphaseTask = enphaseConfigured
        ? RunProbeAsync(async token =>
        {
          var solar = await enphase.GetRealtimeAsync(token);
          return (object?)new
          {
            solar.ProductionW
          };
        })
        : Task.FromResult((false, (string?)null, (object?)null));

      var storageTask = RunProbeAsync(async token =>
      {
        await repository.PingAsync(token);
        return (object?)new
        {
          status = "reachable"
        };
      });

      await Task.WhenAll(meterTask, smaTask, enphaseTask, storageTask);

      var (meterOk, meterError, meterSample) = await meterTask;
      var (smaOk, smaError, smaSample) = await smaTask;
      var (enphaseOk, enphaseError, enphaseSample) = await enphaseTask;
      var (storageOk, storageError, storageSample) = await storageTask;

      var configuredSolarResults = new[]
      {
        (Configured: smaConfigured, Ok: smaOk),
        (Configured: enphaseConfigured, Ok: enphaseOk)
      }.Where(x => x.Configured).ToArray();

      var solarOk = configuredSolarResults.Length == 0 || configuredSolarResults.All(x => x.Ok);
      var solarPartial = configuredSolarResults.Any(x => x.Ok) && configuredSolarResults.Any(x => !x.Ok);
      var ok = meterOk && solarOk && storageOk;

      return Results.Ok(new
      {
        ok,
        smartMeter = new
        {
          ok = meterOk,
          error = meterError,
          sample = meterSample
        },
        solar = new
        {
          ok = solarOk,
          partial = solarPartial,
          configured = configuredSolarResults.Length > 0
        },
        sma = new
        {
          configured = smaConfigured,
          ok = smaConfigured && smaOk,
          error = smaError,
          sample = smaSample
        },
        enphase = new
        {
          configured = enphaseConfigured,
          ok = enphaseConfigured && enphaseOk,
          error = enphaseError,
          sample = enphaseSample
        },
        storage = new
        {
          ok = storageOk,
          error = storageError,
          sample = storageSample
        }
      });
    });

    return app;
  }
}
