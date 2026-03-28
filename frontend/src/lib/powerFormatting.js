const ZERO_POWER_THRESHOLD_KW = 0.0005;

export const GRID_ACTIVITY_THRESHOLD_KW = 0.005;
export const SOLAR_ACTIVITY_THRESHOLD_KW = 0.02;

function magnitude(valueKw) {
  return Number.isFinite(valueKw) ? Math.abs(valueKw) : 0;
}

export function formatPower(valueKw) {
  const value = magnitude(valueKw);

  if (value < ZERO_POWER_THRESHOLD_KW) {
    return "0.0 kW";
  }

  if (value < 0.1) {
    return `${Math.round(value * 1000)} W`;
  }

  return `${value.toFixed(1)} kW`;
}

export function formatCompactPower(valueKw) {
  const value = magnitude(valueKw);

  if (value < ZERO_POWER_THRESHOLD_KW) {
    return "0.0kW";
  }

  if (value < 0.1) {
    return `${Math.round(value * 1000)}W`;
  }

  return `${value.toFixed(1)}kW`;
}

export function formatAxisPower(valueKw) {
  const value = magnitude(valueKw);

  if (value < ZERO_POWER_THRESHOLD_KW) {
    return "0";
  }

  if (value < 0.1) {
    return `${Math.round(value * 1000)}W`;
  }

  return value.toFixed(1);
}

export function roundPowerForChart(valueKw) {
  const value = Number.isFinite(valueKw) ? valueKw : 0;
  const valueMagnitude = Math.abs(value);

  if (valueMagnitude < ZERO_POWER_THRESHOLD_KW) {
    return 0;
  }

  if (valueMagnitude < 0.1) {
    return Number(value.toFixed(3));
  }

  return Number(value.toFixed(1));
}
