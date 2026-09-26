// Versão: 1.0
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { ChartConfiguration } from 'chart.js';
import { buildPriceChartModel, type PriceChartModel } from '../domain/price-series';
import type { Airport, FlightOffer } from '../domain/types';
import { formatPrice } from './format';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const INK = '#efedf0';
const MUTED = '#a39aa8';
const GRID = 'rgba(239, 237, 240, 0.12)';
const BARGAIN = '#ff5a1f';
const ACCENT = '#c4b5fd';
const LINE_COLORS = [ACCENT, BARGAIN, '#7dd3c0', '#f5d576'];

export class PriceCharts {
  private destinationChart: Chart | null = null;
  private departureChart: Chart | null = null;
  private frame = 0;

  constructor(
    private readonly destinationCanvas: HTMLCanvasElement,
    private readonly departureCanvas: HTMLCanvasElement,
    private readonly destinationCard: HTMLElement,
    private readonly departureCard: HTMLElement,
    private readonly emptyNote: HTMLElement,
    private readonly departureNote: HTMLElement,
  ) {}

  render(offers: readonly FlightOffer[], airports: readonly Airport[]): void {
    cancelAnimationFrame(this.frame);
    const model = buildPriceChartModel(offers, airports);
    const empty = model.bars.length === 0;
    this.emptyNote.hidden = !empty;
    this.destinationCard.hidden = empty;
    this.departureCard.hidden = empty;
    this.departureNote.textContent = model.collapsedToCheapest
      ? 'Muitos destinos: a linha mostra o menor preço de cada dia.'
      : '';
    this.destroy();
    if (empty) return;
    this.frame = requestAnimationFrame(() => this.draw(model));
  }

  private draw(model: PriceChartModel): void {
    this.destinationCard.style.height = `${barCardHeight(model.bars.length)}px`;
    this.destinationChart = new Chart(this.destinationCanvas, destinationConfig(model));
    this.departureChart = new Chart(this.departureCanvas, departureConfig(model));
  }

  private destroy(): void {
    this.destinationChart?.destroy();
    this.departureChart?.destroy();
    this.destinationChart = null;
    this.departureChart = null;
  }
}

function barCardHeight(count: number): number {
  return Math.min(420, Math.max(220, count * 36 + 72));
}

function destinationConfig(model: PriceChartModel): ChartConfiguration<'bar'> {
  return {
    type: 'bar',
    data: {
      labels: model.bars.map((bar) => bar.city),
      datasets: [{
        data: model.bars.map((bar) => bar.price),
        backgroundColor: model.bars.map((bar) => (bar.isBargain ? BARGAIN : ACCENT)),
        borderRadius: 6,
        maxBarThickness: 18,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => formatPrice(Number(item.raw), model.currency) } },
      },
      scales: axisScales(model.currency, true),
    },
  };
}

function departureConfig(model: PriceChartModel): ChartConfiguration<'line'> {
  return {
    type: 'line',
    data: {
      labels: model.dates,
      datasets: model.lines.map((line, index) => ({
        label: line.label,
        data: line.prices,
        borderColor: LINE_COLORS[index % LINE_COLORS.length],
        backgroundColor: LINE_COLORS[index % LINE_COLORS.length],
        spanGaps: false,
        tension: 0.25,
        pointRadius: 4,
        pointHoverRadius: 6,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: model.lines.length > 1, labels: { color: INK, boxWidth: 10 } },
        tooltip: { callbacks: { label: (item) => `${item.dataset.label}: ${formatPrice(Number(item.raw), model.currency)}` } },
      },
      scales: axisScales(model.currency, false),
    },
  };
}

function axisScales(currency: string, horizontalBars: boolean) {
  const value = {
    grid: { color: GRID },
    ticks: {
      color: MUTED,
      maxTicksLimit: 5,
      callback: (value: string | number) => formatPrice(Number(value), currency),
    },
  };
  const category = { grid: { display: false }, ticks: { color: INK } };
  return horizontalBars ? { x: value, y: category } : { x: category, y: value };
}
