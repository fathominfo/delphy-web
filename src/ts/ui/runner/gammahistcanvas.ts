import { toFullDateString } from "../../pythia/dates";
import { numericSort, safeLabel } from "../common";
import { calcHPD } from "../distribution";
import { TRACE_COLOR } from "./runcommon";
import { TraceCanvas, log10, TICK_LENGTH } from "./tracecanvas";


const HPD_COLOR = 'rgb(184, 208, 238)';


export class GammaHistCanvas extends TraceCanvas {

  rangeData: number[][] = [];
  converted: number[][] = [];
  dates: number[] = [];
  minSpan: HTMLSpanElement;
  maxSpan: HTMLSpanElement;

  constructor(label:string) {
    super(label, '');
    this.minSpan = document.createElement('span');
    this.maxSpan = document.createElement('span');
    this.readout.appendChild(this.minSpan);
    this.readout.appendChild(this.maxSpan);
    this.readout.classList.add('range');
  }

  setRangeData(data:number[][], dates: number[], kneeIndex:number) {

    this.rangeData = data;
    this.dates = dates;
    this.setKneeIndex(data.length, kneeIndex);
    const shown = this.savedKneeIndex > 0 ? data.slice(this.savedKneeIndex) : data;
    /* pivot the data to make arrays for every knot */
    const byKnots:number[][] = shown[0].map(()=>new Array(shown.length));
    shown.forEach((gamma, i)=>{
      gamma.forEach((g, k)=>byKnots[k][i] = g);
    });
    this.converted = byKnots.map(hpdeify);
    const safe = this.converted.flat().filter(n=>Number.isFinite(n));

    this.dataMin = Math.min(...safe);
    this.dataMax = Math.max(...safe);
    /* what scale is the range in? */
    const range = this.dataMax - this.dataMin;

    if (range === 0 || this.isDiscrete && range < 20) {
      this.displayMin = this.dataMin;
      this.displayMax = this.dataMax;
    } else {
      const expRange = Math.floor(Math.log(range) / log10),
        mag = Math.pow(10, expRange),
        magPad = mag * 0.1;
      this.displayMin = Math.floor((this.dataMin - magPad) / mag) * mag;
      this.displayMax = Math.ceil((this.dataMax + magPad) / mag) * mag;
    }

    requestAnimationFrame(()=>this.canvas.classList.toggle('kneed', kneeIndex > 0));
  }


  draw() {
    let {converted} = this;
    if (this.savedKneeIndex > 0) {
      converted = converted.slice(this.savedKneeIndex);
    }
    const {ctx, width, height} = this;
    ctx.clearRect(0, 0, width + 1, height + 1);
    this.drawField();
    this.drawRangeSeries(converted);
    this.drawLabels();
  }


  drawRangeSeries(data:number[][]) {
    if (data.length === 0) return;
    const {chartHeight, ctx, traceWidth} = this;
    const {displayMin, displayMax} = this;
    const valRange = displayMax - displayMin;
    const verticalScale = chartHeight / (valRange || 1);
    const kCount = data.length;
    const kWidth = traceWidth / (kCount - 1);
    let i = 0;
    let hpd = data[i][0];
    let x = TICK_LENGTH;
    const firstY = chartHeight-(hpd-displayMin) * verticalScale;
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.fillStyle = HPD_COLOR;


    ctx.moveTo(x, firstY);
    for (i = 1; i < kCount; i++) {
      x = TICK_LENGTH + i * kWidth;
      hpd = data[i][0];
      ctx.lineTo(x, chartHeight-(hpd-displayMin) * verticalScale);
    }
    for (i = kCount - 1; i >= 0; i--) {
      x = TICK_LENGTH + i * kWidth;
      hpd = data[i][1];
      ctx.lineTo(x, chartHeight-(hpd-displayMin) * verticalScale);
    }
    ctx.lineTo(TICK_LENGTH, firstY);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = TRACE_COLOR;
    const means = data.map(arr=>arr[2]);
    let mean = means[0];
    x = TICK_LENGTH;
    ctx.lineTo(x, chartHeight-(mean-displayMin) * verticalScale);
    for (i = 1; i < kCount; i++) {
      x = TICK_LENGTH + i * kWidth;
      mean = means[i];
      ctx.lineTo(x, chartHeight-(mean-displayMin) * verticalScale);
    }
    ctx.stroke();
  }


  drawLabels() {
    this.maxLabel.textContent = safeLabel(this.displayMax);
    this.minLabel.textContent = safeLabel(this.displayMin);
    this.avgLabel.textContent = '';
    console.log(this.dates)
    this.minSpan.textContent = toFullDateString(this.dates[0])
    this.maxSpan.textContent = toFullDateString(this.dates[this.dates.length-1]);
  }

}


/*
take an array of numbers, and return a 3 element array
of the 95% hpd and the mean
*/
const hpdeify = (arr:number[]):number[]=>{
  const sorted = arr.filter(n=>Number.isFinite(n)).sort(numericSort);
  const [hpdMin, hpdMax] = calcHPD(sorted);
  const sum = sorted.reduce((tot, n)=>tot+n, 0);
  const mean = sum / sorted.length;
  // console.log(hpdMin, hpdMax, mean)
  return [hpdMin, hpdMax, mean];
}