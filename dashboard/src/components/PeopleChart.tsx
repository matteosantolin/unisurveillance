import React, { useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import { Line } from "react-chartjs-2";
import type { Detection } from "../hooks/useDetections";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin
);

interface Props {
  detections: Detection[];
  onSelectDetection: (d: Detection) => void;
}

export function PeopleChart({ detections, onSelectDetection }: Props) {
  const chartRef = useRef<ChartJS<"line"> | null>(null);

  const handleResetZoom = () => {
    chartRef.current?.resetZoom();
  };

  const labels = detections.map((d) => {
    const date = d.timestamp.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
    const time = d.timestamp.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return [date, time];
  });

  const data = {
    labels,
    datasets: [
      {
        label: "Persone rilevate",
        data: detections.map((d) => d.people_count),
        borderColor: "#FF7B95",
        backgroundColor: "rgba(255, 123, 149, 0.08)",
        borderWidth: 1.5,
        pointBackgroundColor: "#0B0B0E",
        pointBorderColor: "#FF7B95",
        pointBorderWidth: 1.5,
        pointHoverBackgroundColor: "#FF7B95",
        pointHoverBorderColor: "#0B0B0E",
        pointRadius: 3,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.25,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_: unknown, elements: Array<{ index: number }>) => {
      if (elements.length > 0) {
        const idx = elements[0].index;
        onSelectDetection(detections[idx]);
      }
    },
    plugins: {
      legend: { display: false },
      zoom: {
        pan: {
          enabled: true,
          mode: "x" as const,
          modifierKey: "shift" as const,
        },
        zoom: {
          wheel: { enabled: true, speed: 0.1 },
          pinch: { enabled: true },
          drag: {
            enabled: true,
            backgroundColor: "rgba(255, 123, 149, 0.15)",
            borderColor: "#FF7B95",
            borderWidth: 1,
          },
          mode: "x" as const,
        },
        limits: {
          x: { minRange: 2 },
        },
      },
      tooltip: {
        backgroundColor: "#15151B",
        titleColor: "#ECECEF",
        bodyColor: "#FF7B95",
        borderColor: "#3A3A45",
        borderWidth: 1,
        padding: 12,
        titleFont: {
          family: "'JetBrains Mono', monospace",
          size: 11,
          weight: 500 as const,
        },
        bodyFont: {
          family: "'Fraunces', serif",
          size: 16,
          style: "italic" as const,
          weight: 400 as const,
        },
        displayColors: false,
        callbacks: {
          label: (ctx: { raw: unknown }) => `${ctx.raw} person${ctx.raw === 1 ? "a" : "e"}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#5A5A65",
          font: {
            family: "'JetBrains Mono', monospace",
            size: 10,
          },
          maxTicksLimit: 10,
        },
        grid: { color: "rgba(38, 38, 46, 0.6)", drawTicks: false },
        border: { color: "#26262E" },
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: "#8A8A95",
          font: {
            family: "'JetBrains Mono', monospace",
            size: 13,
            weight: 500 as const,
          },
          stepSize: 1,
          padding: 8,
        },
        grid: { color: "rgba(38, 38, 46, 0.4)", drawTicks: false },
        border: { color: "#26262E" },
      },
    },
  };

  if (detections.length === 0) {
    return (
      <div
        style={{
          height: 300,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          color: "var(--bone-muted)",
          background: "transparent",
          borderRadius: 0,
          border: "1px dashed var(--border)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ color: "var(--signal)" }}>// no signal</span>
        <span>Nessun dato per il periodo selezionato</span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--bone-dim)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        <span>
          <span style={{ color: "var(--signal)" }}>↕</span> drag = zoom &nbsp;·&nbsp;
          <span style={{ color: "var(--signal)" }}>scroll</span> = zoom &nbsp;·&nbsp;
          <span style={{ color: "var(--signal)" }}>shift+drag</span> = pan
        </span>
        <button
          onClick={handleResetZoom}
          style={{
            background: "transparent",
            color: "var(--bone-muted)",
            border: "1px solid var(--border)",
            padding: "6px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "color 0.18s, border-color 0.18s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--signal)";
            e.currentTarget.style.borderColor = "var(--signal)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--bone-muted)";
            e.currentTarget.style.borderColor = "var(--border)";
          }}
        >
          ⟲ Reset zoom
        </button>
      </div>
      <div style={{ height: 320, cursor: "crosshair" }}>
        <Line ref={chartRef} data={data} options={options as never} />
      </div>
    </div>
  );
}
