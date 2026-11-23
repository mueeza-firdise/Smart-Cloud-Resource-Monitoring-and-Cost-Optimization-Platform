import PDFDocument from 'pdfkit';
import type {
  CostHistoryRecord,
  PredictionRecord,
  ResourceLogRecord,
  ScalingHistoryRecord,
} from './db.ts';

export async function buildPdfReportBuffer(params: {
  resource: ResourceLogRecord;
  prediction: PredictionRecord;
  scaling: ScalingHistoryRecord;
  cost: CostHistoryRecord;
  scalingHistory: ScalingHistoryRecord[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({margin: 48, size: 'A4'});
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const {resource, prediction, scaling, cost, scalingHistory} = params;

    // Header
    doc
      .fontSize(18)
      .fillColor('#0F172A')
      .text('CloudScale ML — Cloud Resource & Auto-Scaling Audit Report', {align: 'left'});
    doc
      .moveDown(0.3)
      .fontSize(10)
      .fillColor('#475569')
      .text(`Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC  |  Traffic Profile: ${resource.traffic_mode}`);

    doc.moveTo(48, doc.y + 8).lineTo(547, doc.y + 8).strokeColor('#CBD5E1').stroke();
    doc.moveDown(1.2);

    // Section 1: Current Telemetry & ML Prediction
    doc.fontSize(13).fillColor('#1E3A8A').text('1. Current Cloud Resources & ML Prediction');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#0F172A');

    const telemetryRows = [
      ['CPU Usage', `${resource.cpu_usage.toFixed(2)}%`],
      ['RAM Usage', `${resource.ram_usage.toFixed(2)}%`],
      ['Storage Usage', `${resource.storage_usage.toFixed(2)}%`],
      ['Active Virtual Servers', `${resource.server_count} nodes (Min: 2, Max: 20)`],
      ['Network Throughput', `${resource.network_load.toFixed(2)} Mbps (${resource.users_count} concurrent users)`],
      ['Predicted Future CPU', `${prediction.predicted_cpu.toFixed(2)}% (Linear Regression R²=${prediction.r2_score}, MAE=${prediction.mae}%)`],
    ];

    telemetryRows.forEach(([label, val]) => {
      doc.font('Helvetica-Bold').text(`${label}: `, {continued: true}).font('Helvetica').text(val);
      doc.moveDown(0.2);
    });

    doc.moveDown(0.8);

    // Section 2: Scaling Decision
    doc.fontSize(13).fillColor('#1E3A8A').text('2. Latest Auto-Scaling Decision');
    doc.moveDown(0.4);
    doc
      .fontSize(10)
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .text(`Action: ${scaling.action}  (${scaling.previous_servers} -> ${scaling.new_servers} servers, Delta: ${scaling.delta >= 0 ? '+' : ''}${scaling.delta})`);
    doc.font('Helvetica').text(`Rationale: ${scaling.reason}`);
    doc.moveDown(0.8);

    // Section 3: Cost Optimization Analysis
    doc.fontSize(13).fillColor('#1E3A8A').text('3. Cost Optimization Analysis (INR 10 / Server / Hour)');
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#0F172A');

    const costRows = [
      ['Current Hourly Cost', `INR ${cost.hourly_cost.toFixed(2)} / hour`],
      ['Daily Cost (With Auto-Scaling)', `INR ${cost.daily_cost.toFixed(2)} / day`],
      ['Monthly Projected Cost', `INR ${cost.monthly_cost.toFixed(2)} / month`],
      ['Cost Without Optimization (Static Peak)', `INR ${cost.cost_without_optimization.toFixed(2)} / day`],
      ['Net Daily Cost Saved', `INR ${cost.cost_saved_daily.toFixed(2)} / day (${cost.savings_percent.toFixed(1)}% reduction)`],
    ];

    costRows.forEach(([label, val]) => {
      doc.font('Helvetica-Bold').text(`${label}: `, {continued: true}).font('Helvetica').text(val);
      doc.moveDown(0.2);
    });

    doc.moveDown(0.8);

    // Section 4: Recent Audit Log
    doc.fontSize(13).fillColor('#1E3A8A').text('4. Recent Scaling Decision History');
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor('#334155');

    scalingHistory.slice(-10).forEach((item) => {
      doc.text(
        `[${item.timestamp}] ${item.action} | ${item.previous_servers}->${item.new_servers} servers | Pred CPU ${item.predicted_cpu.toFixed(1)}% | ${item.reason}`,
      );
      doc.moveDown(0.2);
    });

    doc.end();
  });
}
