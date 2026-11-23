let charts = {};

function renderCharts(history) {
  const logs = history.resource_logs || [];
  const preds = history.predictions || [];
  const costs = history.cost_history || [];
  const scaling = history.scaling_history || [];

  const labels = logs.map((r) => r.timestamp.slice(11, 19));
  const cpuData = logs.map((r) => r.cpu_usage);
  const ramData = logs.map((r) => r.ram_usage);
  const predData = preds.map((p) => p.predicted_cpu);
  const serverData = scaling.map((s) => s.new_servers);
  const staticCostData = costs.map((c) => c.cost_without_optimization);
  const optCostData = costs.map((c) => c.cost_with_optimization);

  const destroyIfExists = (key) => {
    if (charts[key]) charts[key].destroy();
  };

  destroyIfExists("cpu");
  charts.cpu = new Chart(document.getElementById("cpuTrendChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "CPU Usage (%)", data: cpuData, borderColor: "#2563eb", tension: 0.3 }],
    },
    options: { scales: { y: { min: 0, max: 100 } } },
  });

  destroyIfExists("ram");
  charts.ram = new Chart(document.getElementById("ramTrendChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "RAM Usage (%)", data: ramData, borderColor: "#0d9488", tension: 0.3 }],
    },
    options: { scales: { y: { min: 0, max: 100 } } },
  });

  destroyIfExists("pred");
  charts.pred = new Chart(document.getElementById("predVsActualChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Actual CPU (%)", data: cpuData, borderColor: "#334155", tension: 0.25 },
        { label: "Predicted CPU (%)", data: predData, borderColor: "#dc2626", borderDash: [5, 5], tension: 0.25 },
      ],
    },
    options: { scales: { y: { min: 0, max: 100 } } },
  });

  destroyIfExists("servers");
  charts.servers = new Chart(document.getElementById("scalingHistoryChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Active Servers", data: serverData, backgroundColor: "#1d4ed8" }],
    },
    options: { scales: { y: { min: 0, max: 20, ticks: { stepSize: 2 } } } },
  });

  destroyIfExists("cost");
  charts.cost = new Chart(document.getElementById("costSavingsChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Without Optimization (INR/day)", data: staticCostData, backgroundColor: "#94a3b8" },
        { label: "With Auto-Scaling (INR/day)", data: optCostData, backgroundColor: "#16a34a" },
      ],
    },
  });
}

function updateCards(history, recommendations) {
  const r = history.resource_logs[history.resource_logs.length - 1];
  const p = history.predictions[history.predictions.length - 1];
  const s = history.scaling_history[history.scaling_history.length - 1];
  const c = history.cost_history[history.cost_history.length - 1];

  document.getElementById("card-cpu").textContent = `${r.cpu_usage.toFixed(1)}%`;
  document.getElementById("card-ram").textContent = `${r.ram_usage.toFixed(1)}%`;
  document.getElementById("card-storage").textContent = `${r.storage_usage.toFixed(1)}%`;
  document.getElementById("card-servers").textContent = `${r.server_count}`;
  document.getElementById("card-cost").textContent = `₹${c.hourly_cost.toFixed(0)}/hr`;
  document.getElementById("card-predicted").textContent = `${p.predicted_cpu.toFixed(1)}%`;

  document.getElementById("cost-daily").textContent = `₹${c.daily_cost.toFixed(0)}/day`;
  document.getElementById("cost-monthly").textContent = `₹${c.monthly_cost.toFixed(0)}/mo`;
  document.getElementById("cost-static").textContent = `₹${c.cost_without_optimization.toFixed(0)}/day`;
  document.getElementById("cost-saved").textContent = `₹${c.cost_saved_daily.toFixed(0)}/day (${c.savings_percent.toFixed(1)}%)`;

  const recEl = document.getElementById("ai-recommendations");
  const list = recommendations || [s.reason];
  recEl.innerHTML = "";
  list.forEach((msg) => {
    const li = document.createElement("li");
    li.className = "list-group-item px-0";
    li.textContent = msg;
    recEl.appendChild(li);
  });
}

async function simulateTraffic(mode) {
  const res = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) return;
  const data = await res.json();
  updateCards(data.history, data.scaling.recommendations);
  renderCharts(data.history);
}

if (window.INITIAL_HISTORY) {
  updateCards(window.INITIAL_HISTORY);
  renderCharts(window.INITIAL_HISTORY);
}
