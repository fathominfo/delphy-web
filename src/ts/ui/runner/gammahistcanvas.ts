import { toFullDateString } from "../../pythia/dates";
import { minimalDecimalLabel, numericSort, UNSET } from "../common";
import { calcHPD } from "../distribution";
import { TRACE_COLOR, CURRENT_POP_CURVE_COLOR } from "./runcommon";
import { TraceCanvas, TICK_LENGTH, BORDER_WEIGHT, BORDER_COLOR, log10, HALF_BORDER } from "./tracecanvas";


const HPD_COLOR = 'rgb(184, 208, 238)';

const LABEL_HEIGHT = 14;

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
      const minLog = Math.log10(dataMinYears);
      const maxLog = Math.log10(dataMaxYears);
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
    ctx.stroke();
  }

  drawLabels():void {
    let {chartHeight} = this;
    const {ctx,
      avgLabel, midLabels, maxLabel, minLabel,
      labelContainer, minSpan, maxSpan,
      displayMin, displayMax} = this;
    chartHeight -= HALF_BORDER * 2;
    let yearsMin = gammaToYears(displayMin);
    let yearsMax = gammaToYears(displayMax);
    const minMagnitude = Math.round(Math.log10(yearsMin));
    const maxMagnitude = Math.round(Math.log10(yearsMax));
    yearsMin = defractionalize(yearsMin, minMagnitude);
    yearsMax = defractionalize(yearsMax, maxMagnitude);
    const logRange = maxMagnitude - minMagnitude;
    maxLabel.textContent = minimalDecimalLabel(yearsMax);
    minLabel.textContent = minimalDecimalLabel(yearsMin);
    /* clear the mid labels */
    midLabels.forEach(ele=>ele.remove());
    midLabels.length = 0;
    minSpan.textContent = toFullDateString(this.dates[0])
    maxSpan.textContent = toFullDateString(this.dates[this.dates.length - 1]);
    const magSpan = maxMagnitude - minMagnitude;
    const labelHeight = LABEL_HEIGHT * magSpan;
    const labelsOK = chartHeight >= labelHeight;
    // const step = Math.pow(10, minMagnitude);
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = BORDER_WEIGHT;
    ctx.beginPath();
    let mag = minMagnitude;
    let tens = Math.pow(10, mag);
    let tickLength = 0;
    while (mag < maxMagnitude) {
      for (let i = 1; i <10; i++) {
        const n = i * tens;
        const nLog = Math.log10(n);
        const pct = (nLog - minMagnitude) / logRange;
        const y = HALF_BORDER + chartHeight - pct * chartHeight;
        if (i === 1) {
          ctx.stroke();
          ctx.beginPath();
          tickLength = TICK_LENGTH;
          ctx.lineWidth = BORDER_WEIGHT;
          ctx.globalAlpha = 1;
          if (labelsOK && mag !== minMagnitude && mag !== maxMagnitude) {
            const label = avgLabel.cloneNode(true) as HTMLLIElement;
            label.style.top = `${y-2}px`;
            label.textContent = minimalDecimalLabel(n);
            this.midLabels.push(label);
            labelContainer.appendChild(label);
          }
        } else if (labelsOK || i % 3 === 2) {
          tickLength = TICK_LENGTH * (4 + i * i) / 104.0; // 10 * 10 + 4
          // tickLength = TICK_LENGTH / 2;
        }
        ctx.moveTo(TICK_LENGTH, y);
        ctx.lineTo(TICK_LENGTH - tickLength, y);
        if (i === 1) {
          ctx.stroke();
          ctx.beginPath();
          ctx.globalAlpha = 0.7;
          if (!labelsOK) {
            ctx.lineWidth = BORDER_WEIGHT / 2;
          }
        }
      }
      mag++;
      tens *= 10;
    }
    /* the top tick */
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth = BORDER_WEIGHT;
    ctx.globalAlpha = 1;
    ctx.moveTo(0, HALF_BORDER);
    ctx.lineTo(TICK_LENGTH, HALF_BORDER);
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

const defractionalize = (n:number, mag:number):number => {
  const tensy = Math.pow(10, mag);
  let nn = Math.round(n/tensy) * tensy;
  if (nn > 1) nn = Math.round(nn);
  return nn;
}