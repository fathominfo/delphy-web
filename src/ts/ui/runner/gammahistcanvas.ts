import { toFullDateString } from "../../pythia/dates";
import { numericSort, safeLabel, UNSET } from "../common";
import { calcHPD } from "../distribution";
import { TRACE_COLOR, CURRENT_POP_CURVE_COLOR } from "./runcommon";
import { TraceCanvas, log10, TICK_LENGTH, BORDER_WEIGHT, BORDER_COLOR } from "./tracecanvas";


const HPD_COLOR = 'rgb(184, 208, 238)';


export class GammaHistCanvas extends TraceCanvas {

  rangeData: number[][] = [];
  converted: number[][] = [];
  dates: number[] = [];
  minSpan: HTMLSpanElement;
  maxSpan: HTMLSpanElement;
  isLogLinear = false;
  sampleIndex: number;
  midLabels: HTMLLIElement[];
  labelContainer: HTMLUListElement;

  constructor(label:string) {
    super(label, '');
    this.minSpan = document.createElement('span');
    this.maxSpan = document.createElement('span');
    this.readout.appendChild(this.minSpan);
    this.readout.appendChild(this.maxSpan);
    this.readout.classList.add('range');
    this.midLabels = [];
    this.sampleIndex = UNSET;
    this.labelContainer = this.avgLabel.parentNode as HTMLUListElement;
    // use the avgLabel as a cloning template
    this.avgLabel.textContent = '';
    this.avgLabel.style.position = 'absolute';
  }

  setRangeData(data:number[][], dates: number[], isLogLinear: boolean, kneeIndex: number, sampleIndex: number):void {

    this.rangeData = data;
    this.dates = dates;
    this.isLogLinear = isLogLinear;
    this.setKneeIndex(data.length, kneeIndex);
    this.sampleIndex = sampleIndex;
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
    if (this.dataMax === this.dataMin) {
      this.displayMin = this.dataMin;
      this.displayMax = this.dataMax;
    } else {
      /*
      the data coming back from delphy is the gamma value,
      but we want to convert that to years (where 1 year === 365 days)
      */
      const dataMinYears = gammaToYears(this.dataMin);
      const dataMaxYears = gammaToYears(this.dataMax);
      const minLog = Math.log(dataMinYears)/log10;
      const maxLog = Math.log(dataMaxYears)/log10;
      const minMagnitude = Math.floor(minLog);
      const maxMagnitude = Math.ceil(maxLog);
      const displayMinYears = Math.exp(minMagnitude * log10);
      const displayMaxYears = Math.exp(maxMagnitude * log10);
      this.displayMin = yearsToGamma(displayMinYears);
      this.displayMax = yearsToGamma(displayMaxYears);
    }

    requestAnimationFrame(()=>this.canvas.classList.toggle('kneed', kneeIndex > 0));
  }


  draw():void {
    const {converted} = this;
    const {ctx, width, height} = this;
    ctx.clearRect(0, 0, width + 1, height + 1);
    this.drawField();
    this.drawRangeSeries(converted);
    this.drawLabels();
  }


  drawRangeSeries(data:number[][]):void {
    if (data.length === 0) return;
    const {chartHeight, ctx, traceWidth} = this;
    const {displayMin, displayMax} = this;
    const valRange = displayMax - displayMin;
    const verticalScale = chartHeight / (valRange || 1);
    const kCount = data.length;
    const kWidth = traceWidth / (kCount - 1);
    let i = 0;
    let hpd = data[i][0];
    const firstY = chartHeight-(hpd-displayMin) * verticalScale;
    let x = TICK_LENGTH;
    let y = firstY;
    ctx.lineWidth = 1;
    ctx.fillStyle = HPD_COLOR;

    const drawingStaircase = !this.isLogLinear;

    // console.log(this.dataMin, this.dataMax, this.displayMin, this.displayMax);

    // draw the 95% HPD area
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (i = 1; i < kCount; i++) {
      hpd = data[i][0];
      y = chartHeight-(hpd-displayMin) * verticalScale;
      if (drawingStaircase) {
        ctx.lineTo(x, y);
      }
      x = TICK_LENGTH + i * kWidth;
      ctx.lineTo(x, y);
    }
    for (i = kCount - 1; i > 0; i--) {
      x = TICK_LENGTH + i * kWidth;
      hpd = data[i][1];
      y = chartHeight-(hpd-displayMin) * verticalScale;
      ctx.lineTo(x, y);
      if (drawingStaircase) {
        x = TICK_LENGTH + (i-1) * kWidth;
        ctx.lineTo(x, y);
      }
    }
    if (!drawingStaircase) {
      x = TICK_LENGTH;
      hpd = data[0][1];
      y = chartHeight-(hpd-displayMin) * verticalScale;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(TICK_LENGTH, firstY);
    ctx.fill();

    // draw the population curve for the current sample
    const drawnSampleIndex = this.sampleIndex === UNSET ? this.rangeData.length - 1 : this.sampleIndex;
    if (0 <= drawnSampleIndex && drawnSampleIndex < this.rangeData.length) {
      const sampleData = this.rangeData[drawnSampleIndex];
      console.assert(sampleData.length === kCount, "Current population curve has different number of points than mean curve?");

      ctx.beginPath();
      ctx.strokeStyle = CURRENT_POP_CURVE_COLOR;
      x = TICK_LENGTH;
      y = chartHeight-(sampleData[0]-displayMin) * verticalScale;
      if (!drawingStaircase)  ctx.moveTo(x, y);
      for (i = 1; i < kCount; i++) {
        y = chartHeight-(sampleData[i]-displayMin) * verticalScale;
        if (drawingStaircase) {
          ctx.moveTo(x, y);
        }
        x = TICK_LENGTH + i * kWidth;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // draw the mean
    ctx.beginPath();
    ctx.strokeStyle = TRACE_COLOR;
    const means = data.map(arr=>arr[2]);
    let mean = means[0];
    x = TICK_LENGTH;
    y = chartHeight-(mean-displayMin) * verticalScale;
    ctx.moveTo(x, y);
    for (i = 1; i < kCount; i++) {
      mean = means[i];
      y = chartHeight-(mean-displayMin) * verticalScale;
      if (drawingStaircase) {
        ctx.moveTo(x, y);
      }
      x = TICK_LENGTH + i * kWidth;
      ctx.lineTo(x, y);
    }
    ctx.stroke

  }

  drawLabels():void {
    const {chartHeight, ctx,
      avgLabel, midLabels, maxLabel, minLabel,
      labelContainer, minSpan} = this;
    const {displayMin, displayMax} = this;
    const yearsMin = gammaToYears(displayMin);
    const yearsMax = gammaToYears(displayMax);
    const minMagnitude = Math.log(yearsMin)/log10;
    const maxMagnitude = Math.log(yearsMax)/log10;
    const logRange = maxMagnitude - minMagnitude;
    maxLabel.textContent = safeLabel(yearsMax);
    minLabel.textContent = safeLabel(yearsMin);
    /* clear the mid labels */
    midLabels.forEach(ele=>ele.remove());
    midLabels.length = 0;
    minSpan.textContent = toFullDateString(this.dates[0])
    let step = Math.pow(10, minMagnitude);
    let oom = minMagnitude;
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = BORDER_WEIGHT;
    ctx.beginPath();
    for (let n = yearsMin; n <= yearsMax; n+= step) {
      const nLog = Math.log(n)/log10;
      const pct = (nLog - minMagnitude) / logRange;
      const y = chartHeight - pct * chartHeight;
      ctx.moveTo(0, y);
      ctx.lineTo(TICK_LENGTH, y);
      const noom = Math.floor(nLog);
      if (noom > oom && n !== yearsMax){
        const label = avgLabel.cloneNode(true) as HTMLLIElement;
        label.style.top = `${y}px`;
        label.textContent = safeLabel(n);
        this.midLabels.push(label);
        labelContainer.appendChild(label);
        step *= 10;
        oom = noom;
      }
    }
    ctx.stroke();
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


const gammaToYears = (n:number):number => {
  return Math.exp(n)/365;
}

const yearsToGamma = (n:number):number => {
  return Math.log(n * 365);
}