import { formatCompactPower } from "../../lib/powerFormatting";

function Particles({ d, color, count, dur, reverse = false }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => {
        const begin = (index * dur) / count;

        return (
          <circle key={index} r={3.5} fill={color} opacity={0}>
            <animateMotion
              dur={`${dur}s`}
              begin={`${begin}s`}
              repeatCount="indefinite"
              keyPoints={reverse ? "1;0" : "0;1"}
              keyTimes="0;1"
              calcMode="linear"
              path={d}
            />
            <animate
              attributeName="opacity"
              values="0;0.95;0.95;0"
              keyTimes="0;0.15;0.85;1"
              dur={`${dur}s`}
              begin={`${begin}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="2;4.5;4.5;2"
              keyTimes="0;0.15;0.85;1"
              dur={`${dur}s`}
              begin={`${begin}s`}
              repeatCount="indefinite"
            />
          </circle>
        );
      })}
    </>
  );
}

function FlowLine({
  d,
  color,
  active,
  reverse = false,
  count = 3,
  dur = 2,
}) {
  const dashDir = reverse ? "28" : "-28";

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.1}
        strokeDasharray="4 8"
      />
      {active && (
        <>
          <path d={d} fill="none" stroke={color} strokeWidth={6} strokeOpacity={0.07} />
          <path
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={2.5}
            strokeOpacity={0.4}
            strokeDasharray="8 10">
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to={dashDir}
              dur="1s"
              repeatCount="indefinite"
            />
          </path>
          <Particles d={d} color={color} count={count} dur={dur} reverse={reverse} />
        </>
      )}
    </g>
  );
}

function ScenePill({ x, y, text, color }) {
  const width = text.length * 7.2 + 18;

  return (
    <g transform={`translate(${x},${y})`}>
      <rect
        x={-width / 2}
        y={-10}
        width={width}
        height={19}
        rx={9.5}
        fill="#06090f"
        fillOpacity={0.9}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.8}
      />
      <text
        x={0}
        y={4}
        textAnchor="middle"
        fill={color}
        fontSize={9.5}
        fontFamily="monospace"
        fontWeight={700}>
        {text}
      </text>
    </g>
  );
}

export default function LiveEnergyScene({
  solarKw,
  solarActive,
  gridImportKw,
  gridExportKw,
  gridImport,
  gridExport,
  batteryLinked = false,
  batteryPct = 0,
  batteryChargeKw = 0,
  batteryDischargeKw = 0,
  batteryCharging = false,
  batteryDischarging = false,
  evKw = 0,
  evLinked = false,
  evCharging = false,
  homeKw,
}) {
  const sunRays = Array.from({ length: 12 }, (_, index) => {
    const angle = (index * 30 * Math.PI) / 180;

    return {
      x1: Math.cos(angle) * 23,
      y1: Math.sin(angle) * 23,
      x2: Math.cos(angle) * 35,
      y2: Math.sin(angle) * 35,
    };
  });

  const batteryColor = batteryCharging
    ? "#10b981"
    : batteryDischarging
      ? "#f59e0b"
      : batteryLinked
        ? "#3b82f6"
        : "#4b5563";

  const batterySegments = 5;
  const batteryFilled = batteryLinked
    ? Math.max(1, Math.round((batteryPct / 100) * batterySegments))
    : 0;

  const paths = {
    sunToRoof: "M118,86 Q240,65 430,150",
    gridImport: "M194,302 Q265,296 320,290",
    gridExport: "M320,282 Q265,286 194,290",
    solarExport: "M420,145 Q300,130 194,276",
    homeToBattery: "M604,246 Q628,240 650,248",
    batteryToHome: "M650,258 Q628,260 604,258",
    homeToEv: "M604,300 Q680,295 773,305",
  };

  return (
    <svg
      viewBox="0 0 960 490"
      width="100%"
      style={{ overflow: "visible", display: "block" }}>
      <defs>
        <radialGradient id="scene-sun-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity={solarActive ? "0.55" : "0.12"} />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="scene-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#111827" />
          <stop offset="100%" stopColor="#090c14" />
        </linearGradient>
        <clipPath id="scene-roof-clip">
          <polygon points="326,195 490,96 654,195" />
        </clipPath>
        <filter id="scene-glow">
          <feGaussianBlur stdDeviation="3.5" result="blurred" />
          <feMerge>
            <feMergeNode in="blurred" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={0} y={415} width={960} height={75} fill="url(#scene-ground)" />
      <line x1={0} y1={415} x2={960} y2={415} stroke="#1a2338" strokeWidth={1} />
      {[440, 462, 484].map((y) => (
        <line key={y} x1={0} y1={y} x2={960} y2={y} stroke="#0e1420" strokeWidth={0.4} />
      ))}
      {[120, 240, 360, 480, 600, 720, 840].map((x) => (
        <line key={x} x1={x} y1={415} x2={x} y2={490} stroke="#0e1420" strokeWidth={0.4} />
      ))}

      <FlowLine d={paths.sunToRoof} color="#fbbf24" active={solarActive} count={5} dur={1.6} />
      <FlowLine d={paths.gridImport} color="#8b5cf6" active={gridImport} count={4} dur={1.5} />
      <FlowLine
        d={paths.gridExport}
        color="#10b981"
        active={gridExport}
        reverse
        count={4}
        dur={1.8}
      />
      <FlowLine
        d={paths.solarExport}
        color="#10b981"
        active={gridExport && solarActive}
        count={3}
        dur={2.2}
      />
      <FlowLine
        d={paths.homeToBattery}
        color="#10b981"
        active={batteryCharging}
        count={3}
        dur={2}
      />
      <FlowLine
        d={paths.batteryToHome}
        color="#f59e0b"
        active={batteryDischarging}
        count={3}
        dur={2}
      />
      <FlowLine d={paths.homeToEv} color="#3b82f6" active={evCharging} count={5} dur={1.6} />

      <g transform="translate(100,86)">
        <circle cx={0} cy={0} r={60} fill="url(#scene-sun-glow)" />
        {solarActive && (
          <circle cx={0} cy={0} r={24} fill="#fbbf24" opacity={0.12} filter="url(#scene-glow)">
            <animate attributeName="r" values="22;28;22" dur="3s" repeatCount="indefinite" />
          </circle>
        )}
        {sunRays.map((ray, index) => (
          <line
            key={index}
            x1={ray.x1}
            y1={ray.y1}
            x2={ray.x2}
            y2={ray.y2}
            stroke="#fbbf24"
            strokeWidth={1.8}
            strokeLinecap="round"
            opacity={solarActive ? 0.85 : 0.2}>
            {solarActive && (
              <animate
                attributeName="stroke-width"
                values="1;2.5;1"
                dur={`${1.4 + index * 0.1}s`}
                repeatCount="indefinite"
              />
            )}
          </line>
        ))}
        <circle
          cx={0}
          cy={0}
          r={20}
          fill="#fbbf24"
          opacity={solarActive ? 1 : 0.2}
          filter={solarActive ? "url(#scene-glow)" : ""}
        />
        <circle cx={0} cy={0} r={14} fill="#fde68a" opacity={solarActive ? 1 : 0.15} />
        <circle cx={0} cy={0} r={8} fill="none" stroke="#fbbf24" strokeWidth={1} opacity={0.3} />
      </g>
      {solarActive && <ScenePill x={100} y={44} text={`SOLAR ${formatCompactPower(solarKw)}`} color="#fbbf24" />}

      <g transform="translate(56,188)">
        <rect x={-4} y={0} width={8} height={227} rx={2} fill="#131c2e" stroke="#1e2a40" strokeWidth={1} />
        <rect x={-54} y={20} width={108} height={7} rx={2} fill="#131c2e" stroke="#1e2a40" strokeWidth={1} />
        <rect x={-38} y={56} width={76} height={6} rx={2} fill="#131c2e" stroke="#1e2a40" strokeWidth={1} />
        {[-50, -24, 2, 26].map((x, index) => (
          <g key={index} transform={`translate(${x},28)`}>
            <rect x={-3} y={0} width={6} height={12} rx={2} fill="#1e2a40" />
            <ellipse cx={0} cy={17} rx={5} ry={3.5} fill="#131c2e" stroke="#2a3a54" strokeWidth={0.8} />
          </g>
        ))}
        {[-34, -8, 18].map((x, index) => (
          <g key={index} transform={`translate(${x},62)`}>
            <rect x={-3} y={0} width={6} height={10} rx={2} fill="#1e2a40" />
            <ellipse cx={0} cy={14} rx={4} ry={3} fill="#131c2e" stroke="#2a3a54" strokeWidth={0.8} />
          </g>
        ))}
        {[[-50, 45], [26, 45], [-34, 76], [18, 76]].map(([wireX, wireY], index) => (
          <path
            key={index}
            d={`M${wireX},${wireY} Q100,${wireY + 28} 200,${wireY + 38}`}
            fill="none"
            stroke="#1a2438"
            strokeWidth={1.5}
          />
        ))}
        <circle
          cx={0}
          cy={10}
          r={3.5}
          fill={gridImport ? "#8b5cf6" : gridExport ? "#10b981" : "#1e2740"}>
          {(gridImport || gridExport) && (
            <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
          )}
        </circle>
        <rect x={-10} y={225} width={20} height={7} rx={2} fill="#0d1525" />
      </g>
      {gridImport && <ScenePill x={58} y={152} text={`GRID IN ${formatCompactPower(gridImportKw)}`} color="#8b5cf6" />}
      {gridExport && <ScenePill x={58} y={152} text={`GRID OUT ${formatCompactPower(gridExportKw)}`} color="#10b981" />}

      <g transform="translate(320,0)">
        <ellipse cx={164} cy={425} rx={148} ry={9} fill="#3b82f6" opacity={0.05} />
        <polygon points="0,210 164,94 328,210" fill="#0e1726" stroke="#1a2540" strokeWidth={2} />
        <line x1={164} y1={96} x2={164} y2={210} stroke="#1a2540" strokeWidth={0.8} opacity={0.5} />
        <polygon points="0,210 164,94 328,210" fill="none" stroke="#1e2d46" strokeWidth={1.5} />
        <rect x={0} y={208} width={328} height={5} fill="#1a2640" />

        <g clipPath="url(#scene-roof-clip)">
          {[[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]].map(
            ([col, row], index) => {
              const x = 22 + col * 44 - row * 22;
              const y = 166 + row * 24 - col * 12;

              return (
                <g key={`left-${index}`} transform={`translate(${x},${y})`}>
                  <rect
                    x={0}
                    y={0}
                    width={38}
                    height={20}
                    rx={1.5}
                    fill={solarActive ? "#0f2540" : "#0a1020"}
                    stroke={solarActive ? "#1d4ed8" : "#1a2235"}
                    strokeWidth={0.8}
                  />
                  <line x1={12} y1={0} x2={12} y2={20} stroke={solarActive ? "#1e40af" : "#111827"} strokeWidth={0.5} />
                  <line x1={24} y1={0} x2={24} y2={20} stroke={solarActive ? "#1e40af" : "#111827"} strokeWidth={0.5} />
                  <line x1={0} y1={7} x2={38} y2={7} stroke={solarActive ? "#1e40af" : "#111827"} strokeWidth={0.5} />
                  <line x1={0} y1={13} x2={38} y2={13} stroke={solarActive ? "#1e40af" : "#111827"} strokeWidth={0.5} />
                  {solarActive && <rect x={2} y={2} width={8} height={3} rx={0.5} fill="#60a5fa" opacity={0.5} />}
                  {solarActive && (
                    <rect x={0} y={0} width={38} height={20} rx={1.5} fill="#60a5fa" opacity={0}>
                      <animate
                        attributeName="opacity"
                        values="0;0.07;0"
                        dur={`${1.8 + index * 0.15}s`}
                        repeatCount="indefinite"
                      />
                    </rect>
                  )}
                </g>
              );
            },
          )}
          {[[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]].map(
            ([col, row], index) => {
              const x = 202 + col * 44 + row * 22;
              const y = 166 + row * 24 - col * 12;

              return (
                <g key={`right-${index}`} transform={`translate(${x},${y})`}>
                  <rect
                    x={0}
                    y={0}
                    width={38}
                    height={20}
                    rx={1.5}
                    fill={solarActive ? "#0f2540" : "#0a1020"}
                    stroke={solarActive ? "#1d4ed8" : "#1a2235"}
                    strokeWidth={0.8}
                  />
                  <line x1={12} y1={0} x2={12} y2={20} stroke={solarActive ? "#1e40af" : "#111827"} strokeWidth={0.5} />
                  <line x1={24} y1={0} x2={24} y2={20} stroke={solarActive ? "#1e40af" : "#111827"} strokeWidth={0.5} />
                  <line x1={0} y1={7} x2={38} y2={7} stroke={solarActive ? "#1e40af" : "#111827"} strokeWidth={0.5} />
                  <line x1={0} y1={13} x2={38} y2={13} stroke={solarActive ? "#1e40af" : "#111827"} strokeWidth={0.5} />
                  {solarActive && <rect x={2} y={2} width={8} height={3} rx={0.5} fill="#60a5fa" opacity={0.5} />}
                  {solarActive && (
                    <rect x={0} y={0} width={38} height={20} rx={1.5} fill="#60a5fa" opacity={0}>
                      <animate
                        attributeName="opacity"
                        values="0;0.07;0"
                        dur={`${2 + index * 0.12}s`}
                        repeatCount="indefinite"
                      />
                    </rect>
                  )}
                </g>
              );
            },
          )}
        </g>

        <rect x={10} y={210} width={308} height={205} fill="#0a1120" stroke="#1a2540" strokeWidth={1.5} />
        {Array.from({ length: 13 }, (_, index) => 222 + index * 15).map((y) => (
          <line key={y} x1={10} y1={y} x2={318} y2={y} stroke="#0d1626" strokeWidth={0.6} />
        ))}

        <rect x={28} y={232} width={90} height={66} rx={3} fill="#07101c" stroke="#1a2540" strokeWidth={1} />
        <line x1={73} y1={232} x2={73} y2={298} stroke="#1a2540" strokeWidth={0.8} />
        <line x1={28} y1={265} x2={118} y2={265} stroke="#1a2540" strokeWidth={0.8} />

        <rect x={148} y={232} width={90} height={66} rx={3} fill="#07101c" stroke="#1a2540" strokeWidth={1} />
        <line x1={193} y1={232} x2={193} y2={298} stroke="#1a2540" strokeWidth={0.8} />
        <line x1={148} y1={265} x2={238} y2={265} stroke="#1a2540" strokeWidth={0.8} />

        <rect x={20} y={330} width={114} height={85} rx={2} fill="#08101e" stroke="#1a2540" strokeWidth={1} />
        {[342, 357, 372, 387, 402].map((y) => (
          <line key={y} x1={20} y1={y} x2={134} y2={y} stroke="#0d1626" strokeWidth={0.8} />
        ))}
        <line x1={77} y1={330} x2={77} y2={415} stroke="#0d1626" strokeWidth={0.8} />
        <circle cx={77} cy={326} r={3} fill={evCharging ? "#60a5fa" : "#1a2540"} />

        <rect x={198} y={330} width={62} height={85} rx={3} fill="#07101c" stroke="#1a2540" strokeWidth={1} />
        <path d="M198,348 Q229,325 260,348" fill="none" stroke="#1a2540" strokeWidth={0.8} />
        <circle cx={254} cy={376} r={3} fill="#374151" />

        <rect x={10} y={413} width={308} height={5} fill="#131c2e" />
      </g>
      <ScenePill x={484} y={447} text={`HOME ${formatCompactPower(homeKw)}`} color="#3b82f6" />

      <g transform="translate(648,215)">
        <rect x={-10} y={-8} width={88} height={202} rx={5} fill="#060910" stroke="#1a2235" strokeWidth={1} />
        {[0, 1, 2].map((index) => {
          const y = index * 64;
          const active = batteryCharging || batteryDischarging;
          const strokeColor = batteryLinked ? batteryColor : "#1e2740";

          return (
            <g key={index} transform={`translate(0,${y})`}>
              <rect x={0} y={0} width={68} height={58} rx={5} fill="#0a1020" stroke={strokeColor} strokeWidth={1.3} />
              {active && (
                <rect x={0} y={0} width={68} height={58} rx={5} fill={strokeColor} opacity={0.04}>
                  <animate
                    attributeName="opacity"
                    values="0.02;0.08;0.02"
                    dur={`${1.8 + index * 0.3}s`}
                    repeatCount="indefinite"
                  />
                </rect>
              )}
              <path d="M22,19 L46,19 M34,19 L34,40" fill="none" stroke={strokeColor} strokeWidth={2.2} strokeLinecap="round" />
              <rect x={5} y={48} width={58} height={6} rx={3} fill="#060910" />
              {Array.from({ length: batterySegments }).map((_, segmentIndex) => (
                <rect
                  key={segmentIndex}
                  x={6 + segmentIndex * 12}
                  y={49}
                  width={9}
                  height={4}
                  rx={2}
                  fill={
                    segmentIndex < batteryFilled
                      ? batteryCharging
                        ? "#10b981"
                        : batteryDischarging
                          ? "#f59e0b"
                          : "#3b82f6"
                      : "#131e30"
                  }
                  opacity={segmentIndex < batteryFilled ? 1 : 0.4}>
                  {batteryCharging && segmentIndex < batteryFilled && (
                    <animate
                      attributeName="opacity"
                      values="0.5;1;0.5"
                      dur={`${0.7 + segmentIndex * 0.12}s`}
                      repeatCount="indefinite"
                    />
                  )}
                </rect>
              ))}
              {batteryCharging && (
                <path d="M37,8 L31,21 L36,21 L30,32 L43,17 L37,17 Z" fill="#10b981" opacity={0.9}>
                  <animate attributeName="opacity" values="0.55;1;0.55" dur="0.9s" repeatCount="indefinite" />
                </path>
              )}
              {batteryDischarging && (
                <path d="M26,17 L38,17 L38,13 L46,21 L38,29 L38,25 L26,25 Z" fill="#f59e0b" opacity={0.85}>
                  <animate attributeName="opacity" values="0.5;0.9;0.5" dur="1.1s" repeatCount="indefinite" />
                </path>
              )}
            </g>
          );
        })}

        <text
          x={34}
          y={200}
          textAnchor="middle"
          fill={batteryColor}
          fontSize={9.5}
          fontFamily="monospace"
          fontWeight={700}>
          {batteryLinked ? `${batteryPct}% STORAGE` : "BATTERY IDLE"}
        </text>

        {(batteryCharging || batteryDischarging) && (
          <ellipse cx={34} cy={97} rx={52} ry={115} fill={batteryColor} opacity={0}>
            <animate attributeName="opacity" values="0;0.05;0" dur="2s" repeatCount="indefinite" />
          </ellipse>
        )}
      </g>
      {batteryCharging && (
        <ScenePill x={682} y={198} text={`BAT IN ${formatCompactPower(batteryChargeKw)}`} color="#10b981" />
      )}
      {batteryDischarging && (
        <ScenePill x={682} y={198} text={`BAT OUT ${formatCompactPower(batteryDischargeKw)}`} color="#f59e0b" />
      )}
      {!batteryLinked && !batteryCharging && !batteryDischarging && (
        <ScenePill x={682} y={198} text="BATTERY STANDBY" color="#4b5563" />
      )}

      <g transform="translate(772,272)">
        <rect x={8} y={0} width={10} height={143} rx={4} fill="#0d1525" stroke="#1a2235" strokeWidth={1} />
        <rect x={0} y={0} width={32} height={70} rx={5} fill="#0a1020" stroke={evCharging ? "#3b82f6" : "#1a2235"} strokeWidth={1.5} />
        {evCharging && (
          <rect x={0} y={0} width={32} height={70} rx={5} fill="#3b82f6" opacity={0.05}>
            <animate attributeName="opacity" values="0.03;0.09;0.03" dur="1.5s" repeatCount="indefinite" />
          </rect>
        )}
        <rect x={5} y={7} width={22} height={16} rx={2} fill={evCharging ? "#091d38" : "#080e18"} stroke={evCharging ? "#1d4ed8" : "#111827"} strokeWidth={0.5} />
        {evCharging && (
          <text x={16} y={18} textAnchor="middle" fill="#60a5fa" fontSize={7} fontFamily="monospace">
            {formatCompactPower(evKw)}
          </text>
        )}
        <circle cx={16} cy={38} r={10} fill="none" stroke={evCharging ? "#3b82f6" : "#1e2740"} strokeWidth={1.5} />
        {evCharging ? (
          <path d="M13,33 L11,38 L15,38 L11,46 L21,35 L16,35 L19,29 Z" fill="#60a5fa" opacity={0.9}>
            <animate attributeName="opacity" values="0.5;1;0.5" dur="0.8s" repeatCount="indefinite" />
          </path>
        ) : (
          <circle cx={16} cy={38} r={3} fill="#1e2740" />
        )}
        <path
          d="M32,26 Q52,23 58,36 Q63,52 56,74 Q51,86 47,91"
          fill="none"
          stroke={evCharging ? "#3b82f6" : "#1a2235"}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <rect x={41} y={89} width={14} height={10} rx={3} fill={evCharging ? "#1d4ed8" : "#0d1525"} stroke={evCharging ? "#3b82f6" : "#374151"} strokeWidth={1} />
        <rect x={4} y={140} width={22} height={6} rx={2} fill="#0d1525" />
        <text x={14} y={160} textAnchor="middle" fill="#2a3750" fontSize={8} fontFamily="monospace" fontWeight={700}>
          EVSE
        </text>
      </g>
      {evCharging && <ScenePill x={786} y={252} text={`EV ${formatCompactPower(evKw)}`} color="#3b82f6" />}
      {!evLinked && !evCharging && (
        <ScenePill x={786} y={252} text="EV STANDBY" color="#4b5563" />
      )}

      <g transform="translate(756,324)">
        <ellipse cx={105} cy={92} rx={100} ry={6} fill="#000" opacity={0.35} />
        <path
          d="M12,55 Q12,36 30,34 L48,20 Q68,7 115,7 Q150,7 168,20 L182,34 Q198,36 198,55 Z"
          fill="#0c1422"
          stroke="#1a2235"
          strokeWidth={1.5}
        />
        <rect x={10} y={51} width={190} height={24} rx={4} fill="#090f1e" stroke="#1a2235" strokeWidth={1} />
        <rect x={10} y={69} width={190} height={4} rx={2} fill="#111827" />
        <path d="M46,33 L57,14 Q92,2 145,2 Q168,2 178,14 L188,33" fill="#0c1422" stroke="#1a2235" strokeWidth={1} />
        <path d="M59,31 L64,12 Q92,3 145,3 Q165,3 170,12 L176,31" fill="#081622" stroke="#1a2235" strokeWidth={0.8} />
        <path d="M48,32 L57,15 L70,32" fill="#081622" stroke="#1a2235" strokeWidth={0.7} />
        <path d="M74,32 L77,12 L120,11 L120,32" fill="#081622" stroke="#1a2235" strokeWidth={0.7} />
        <path d="M123,32 L123,11 L157,12 L162,32" fill="#081622" stroke="#1a2235" strokeWidth={0.7} />
        <path d="M165,32 L173,14 L183,32" fill="#081622" stroke="#1a2235" strokeWidth={0.7} />
        <line x1={108} y1={33} x2={108} y2={73} stroke="#111827" strokeWidth={0.8} />
        <rect x={118} y={47} width={14} height={3} rx={1.5} fill="#1e2740" />
        <rect x={78} y={47} width={14} height={3} rx={1.5} fill="#1e2740" />
        <path d="M186,35 Q198,37 198,44" fill="none" stroke={evCharging ? "#bfdbfe" : "#1e2740"} strokeWidth={2.5} strokeLinecap="round" />
        <rect x={187} y={42} width={13} height={4} rx={2} fill={evCharging ? "#93c5fd" : "#1e2740"} opacity={0.8} />
        <rect x={9} y={38} width={6} height={9} rx={2} fill="#7f1d1d" opacity={0.8} />
        <rect x={6} y={28} width={10} height={8} rx={2} fill={evCharging ? "#1d4ed8" : "#0d1525"} stroke={evCharging ? "#3b82f6" : "#1e2740"} strokeWidth={1} />
        {evCharging && (
          <circle cx={11} cy={32} r={2.5} fill="#60a5fa" opacity={0.9}>
            <animate attributeName="opacity" values="0.4;1;0.4" dur="0.7s" repeatCount="indefinite" />
          </circle>
        )}
        <circle cx={45} cy={75} r={18} fill="#060c18" stroke="#1a2235" strokeWidth={2} />
        <circle cx={45} cy={75} r={11} fill="#0a1020" stroke="#374151" strokeWidth={1.5} />
        <circle cx={45} cy={75} r={4} fill="#1e2740" />
        {[0, 60, 120, 180, 240, 300].map((degrees, index) => (
          <line
            key={`front-wheel-${index}`}
            x1={45 + Math.cos((degrees * Math.PI) / 180) * 5}
            y1={75 + Math.sin((degrees * Math.PI) / 180) * 5}
            x2={45 + Math.cos((degrees * Math.PI) / 180) * 10}
            y2={75 + Math.sin((degrees * Math.PI) / 180) * 10}
            stroke="#374151"
            strokeWidth={1.5}
          />
        ))}
        <circle cx={160} cy={75} r={18} fill="#060c18" stroke="#1a2235" strokeWidth={2} />
        <circle cx={160} cy={75} r={11} fill="#0a1020" stroke="#374151" strokeWidth={1.5} />
        <circle cx={160} cy={75} r={4} fill="#1e2740" />
        {[0, 60, 120, 180, 240, 300].map((degrees, index) => (
          <line
            key={`rear-wheel-${index}`}
            x1={160 + Math.cos((degrees * Math.PI) / 180) * 5}
            y1={75 + Math.sin((degrees * Math.PI) / 180) * 5}
            x2={160 + Math.cos((degrees * Math.PI) / 180) * 10}
            y2={75 + Math.sin((degrees * Math.PI) / 180) * 10}
            stroke="#374151"
            strokeWidth={1.5}
          />
        ))}
        <rect x={28} y={61} width={62} height={4} rx={2} fill="#0d1525" />
        <rect
          x={28}
          y={61}
          width={evCharging ? 48 : 0}
          height={4}
          rx={2}
          fill={evCharging ? "#3b82f6" : "#374151"}
          opacity={0.9}
          style={{ transition: "width 1s ease" }}
        />
        <text x={94} y={65} fill="#374151" fontSize={7} fontFamily="monospace">
          {evCharging ? "74%" : "idle"}
        </text>
        {evCharging && (
          <ellipse cx={104} cy={52} rx={104} ry={40} fill="#3b82f6" opacity={0.03}>
            <animate attributeName="opacity" values="0.02;0.07;0.02" dur="2s" repeatCount="indefinite" />
          </ellipse>
        )}
      </g>
    </svg>
  );
}
