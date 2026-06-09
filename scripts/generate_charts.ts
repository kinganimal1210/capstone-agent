import * as fs from 'fs';
import * as path from 'path';

async function downloadChart(filename: string, chartConfig: any) {
  const url = 'https://quickchart.io/chart';
  const payload = {
    chart: chartConfig,
    width: 900,
    height: 500,
    backgroundColor: '#ffffff',
    devicePixelRatio: 2.0,
  };

  console.log(`Generating ${filename}...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Failed to generate ${filename}: ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const artifactDir = 'C:\\Users\\wogns\\.gemini\\antigravity\\brain\\10bf691f-eb20-494e-9315-909c0758db5f';
  const outPath = path.resolve(artifactDir, filename);
  fs.writeFileSync(outPath, buffer);
  console.log(`Saved ${outPath}`);
}

async function main() {
  const categories = ['SS (Short/Simple)', 'SC (Short/Complex)', 'LS (Long/Simple)', 'LC (Long/Complex)'];
  
  // 1. Total Tokens Chart
  await downloadChart('chart_total_tokens.png', {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [
        { label: 'No-RAG (Before)', data: [2712, 3003, 3116, 3247], backgroundColor: 'rgba(239, 68, 68, 0.85)', borderColor: 'rgba(239, 68, 68, 1)', borderWidth: 1 },
        { label: 'RAG (After)', data: [440, 593, 673, 777], backgroundColor: 'rgba(59, 130, 246, 0.85)', borderColor: 'rgba(59, 130, 246, 1)', borderWidth: 1 }
      ]
    },
    options: {
      plugins: {
        title: { display: true, text: 'RAG vs No-RAG: Total Token Usage', font: { size: 26, weight: 'bold', family: 'sans-serif' } },
        datalabels: { align: 'end', anchor: 'end', font: { size: 16, weight: 'bold' } }
      },
      scales: { y: { beginAtZero: true, max: 4000 } }
    }
  });

  // 2. Savings Ratio Chart
  await downloadChart('chart_savings.png', {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [{
        label: 'Token Savings (%)',
        data: [83.8, 80.3, 78.4, 76.1],
        backgroundColor: 'rgba(16, 185, 129, 0.85)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 1
      }]
    },
    options: {
      plugins: {
        title: { display: true, text: 'Token Savings Ratio (%)', font: { size: 26, weight: 'bold', family: 'sans-serif' } },
        datalabels: { align: 'center', anchor: 'center', color: '#ffffff', font: { size: 18, weight: 'bold' }, formatter: (value: any) => value + '%' }
      },
      scales: { y: { beginAtZero: true, max: 100 } }
    }
  });

  // 3. Response Time Chart
  await downloadChart('chart_latency.png', {
    type: 'bar',
    data: {
      labels: categories,
      datasets: [
        { label: 'No-RAG (Latency ms)', data: [3844, 6715, 7374, 8938], backgroundColor: 'rgba(245, 158, 11, 0.85)', borderColor: 'rgba(245, 158, 11, 1)', borderWidth: 1 },
        { label: 'RAG (Latency ms)', data: [2032, 2624, 3271, 3395], backgroundColor: 'rgba(59, 130, 246, 0.85)', borderColor: 'rgba(59, 130, 246, 1)', borderWidth: 1 }
      ]
    },
    options: {
      plugins: {
        title: { display: true, text: 'Response Time (Latency)', font: { size: 26, weight: 'bold', family: 'sans-serif' } },
        datalabels: { align: 'end', anchor: 'end', font: { size: 16, weight: 'bold' } }
      },
      scales: { y: { beginAtZero: true, max: 10000 } }
    }
  });
}

main().catch(err => {
  console.error('Error generating charts:', err);
  process.exit(1);
});
