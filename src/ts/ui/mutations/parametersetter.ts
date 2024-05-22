// import { getPercentLabel, UNSET } from '../common';
import { CHART_TEXT_FONT, UNSET, measureText, resizeCanvas } from '../common';
import { ParameterCallback } from './mutationscommon';
// const TAU = Math.PI * 2;

const maybeDiv = document.querySelector(".moi-list--parameter-histogram");
if (!maybeDiv) {
  throw new Error('no template div for Mutation parameter histogram');
}

const margin = {
  top: 10,
  right: 7.5,
  bottom: 4.5,
  left: 7.5
};

const BIN_COUNT = 20,
  BG_COLOR = 'rgb(251, 251, 251)',
  OUT_COLOR =  'rgb(180,180, 180)',
  IN_COLOR =  'rgb(120, 120, 120)',
  HIGHLIGHT_COLOR = 'rgb(126, 126, 126)';



export class ParameterSetter {

  data: number[];
  threshold: number;
  bins: number[];
  max: number;
  div: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  callback: ParameterCallback;

  range: HTMLInputElement;

  defaultValue: number;

  constructor(container: HTMLElement, callback: ParameterCallback, defaultValue: number) {
    this.data = [];
    this.threshold = 0;
    this.bins = Array(BIN_COUNT);

    this.max = UNSET;
    this.defaultValue = defaultValue;

    this.div = container as HTMLDivElement;
    this.canvas = this.div.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;

    this.range = this.div.querySelector(".parameter-range") as HTMLInputElement;
    this.range.step = `${100 / BIN_COUNT}`;
    this.range.value = `${defaultValue * 100}`;
    this.range.addEventListener("input", () => {
      const value = this.range.value;
      const pct = parseInt(value) / 100;
      callback(pct);
    });

    const dismisser = this.div.querySelector(".dismisser") as HTMLDivElement;
    dismisser.addEventListener("click", ()=>this.hide());

    const resetButton = this.div.querySelector(".reset-button") as HTMLButtonElement;
    resetButton.addEventListener("click", () => this.reset());

    this.callback = callback;
    this.width = UNSET;
    this.height = UNSET;
    this.resize();

    this.ctx.font = CHART_TEXT_FONT;
  }

  resize(): void {
    const {width, height} = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;

  }

  set(data: number[], threshold: number, max: number) : void {
    this.data = data;
    this.threshold = Math.round(threshold / max * BIN_COUNT) * max / BIN_COUNT;
    this.bins.fill(0);
    this.max = max;
    data.forEach(n=>{
      const b = Math.min(Math.ceil(n/max* BIN_COUNT), BIN_COUNT) - 1;
      this.bins[b]++;
    });
    this.draw();
  }

  draw(): void {
    const {ctx, width, height, bins, max, threshold} = this;

    const bottom = height - margin.bottom;
    let right = width - margin.right,
      hRange = right - margin.left;
    const binMax = Math.max(...bins),
      barW = (hRange / BIN_COUNT) - 1,
      scaled = threshold / max * BIN_COUNT;
    let x = margin.left;
    hRange = (barW + 1) * BIN_COUNT - 1;
    right = margin.left + hRange;
    const thresholdX = margin.left + threshold / max * hRange;

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = IN_COLOR;
    ctx.beginPath();
    ctx.moveTo(margin.left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.strokeStyle = OUT_COLOR;
    ctx.beginPath();
    ctx.moveTo(margin.left, bottom);
    ctx.lineTo(thresholdX, bottom);
    ctx.stroke();

    ctx.fillStyle = OUT_COLOR;
    for (let i = 0; i < bins.length; i++) {
      if (i>=scaled) {
        ctx.fillStyle = IN_COLOR;
      }
      const h = bins[i] / binMax * (height - margin.top - margin.top);
      ctx.fillRect(x, bottom, barW, -h);
      x += barW + 1;
    }

    ctx.fillStyle = HIGHLIGHT_COLOR;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    const label = `${Math.round(threshold / max * 100)}%`;
    const metrics = measureText(ctx, label);
    let labelX = thresholdX;
    if (labelX - metrics.width / 2 < 0) {
      labelX = metrics.width / 2;
    } else if (labelX + metrics.width / 2 > width) {
      labelX = width - metrics.width / 2;
    }
    ctx.fillText(label, labelX, 3);
  }


  show(): void {
    this.div.classList.add('active');
    this.resize();
    this.draw();
  }

  hide(): void {
    this.div.classList.remove('active')
  }

  toggle(): void {
    const active = this.div.classList.toggle('active');
    if (active) {
      this.resize();
      this.draw();
    }
  }

  reset(): void {
    this.range.value = `${this.defaultValue * 100}`;
    this.callback(this.defaultValue);
  }

}