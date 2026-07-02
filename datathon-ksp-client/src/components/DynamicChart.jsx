import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

export default function DynamicChart({ config, data }) {
  if (!config || !config.show_chart) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Ask a question to generate a visualization.
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        No data available.
      </div>
    );
  }

  const { chart_type, x_axis, y_axis, title, series } = config;

  return (
    <div className="flex h-full flex-col rounded-2xl bg-white shadow">
      <div className="border-b px-6 py-5">
        <h2 className="text-2xl font-semibold">{title}</h2>
      </div>

      <div className="flex-1 p-4">
        <ResponsiveContainer width="100%" height="100%">
          {/* BAR */}
          {chart_type === "bar" && (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={x_axis} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={y_axis} radius={[6, 6, 0, 0]} />
            </BarChart>
          )}

          {/* HORIZONTAL BAR */}
          {chart_type === "horizontal_bar" && (
            <BarChart
              layout="vertical"
              data={data}
              margin={{
                left: 40,
                right: 20,
                top: 20,
                bottom: 20,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis type="number" />

              <YAxis type="category" dataKey={y_axis} width={170} />

              <Tooltip />

              <Legend />

              <Bar dataKey={x_axis} radius={[0, 6, 6, 0]} />
            </BarChart>
          )}

          {/* LINE */}
          {chart_type === "line" && (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={x_axis} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={y_axis} strokeWidth={3} />
            </LineChart>
          )}

          {/* PIE */}
          {chart_type === "pie" && (
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie
                data={data}
                dataKey={y_axis}
                nameKey={x_axis}
                outerRadius={170}
                label
              />
            </PieChart>
          )}

          {/* SCATTER */}
          {chart_type === "scatter" && (
            <ScatterChart>
              <CartesianGrid />
              <XAxis dataKey={x_axis} />
              <YAxis dataKey={y_axis} />
              <Tooltip />
              <Scatter data={data} />
            </ScatterChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
