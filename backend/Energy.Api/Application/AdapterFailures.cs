namespace Energy.Api.Application;

public enum AdapterFailureKind
{
  Config,
  Auth,
  Transient
}

public abstract class AdapterFailureException : Exception
{
  protected AdapterFailureException(string adapter, AdapterFailureKind kind, string message, Exception? inner = null)
      : base(message, inner)
  {
    Adapter = adapter;
    Kind = kind;
  }

  public string Adapter { get; }
  public AdapterFailureKind Kind { get; }
}

public sealed class ConfigFailureException : AdapterFailureException
{
  public ConfigFailureException(string adapter, string message, Exception? inner = null)
      : base(adapter, AdapterFailureKind.Config, message, inner)
  {
  }
}

public sealed class AuthFailureException : AdapterFailureException
{
  public AuthFailureException(string adapter, string message, Exception? inner = null)
      : base(adapter, AdapterFailureKind.Auth, message, inner)
  {
  }
}

public sealed class TransientFailureException : AdapterFailureException
{
  public TransientFailureException(string adapter, string message, Exception? inner = null)
      : base(adapter, AdapterFailureKind.Transient, message, inner)
  {
  }
}