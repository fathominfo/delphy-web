import { toFullDateString } from "../../pythia/dates";
import { UNSET } from "../common";
import { GammaData, LogLabelType } from "./gammadata";
import { TRACE_COLOR, CURRENT_POP_CURVE_COLOR } from "./runcommon";
import { TraceCanvas, TICK_LENGTH, BORDER_WEIGHT, BORDER_COLOR, HALF_BORDER } from "./tracecanvas";


const HPD_COLOR = 'rgb(184, 208, 238)';

const LABEL_HEIGHT = 14;

const MIN_HPD_INDEX = 0;
const MAX_HPD_INDEX = 1;
const MEDIAN_INDEX = 3;


export class GammaHistCanvas extends TraceCanvas {

  minSpan: HTMLSpanElement;
  maxSpan: HTMLSpanElement;
  midLabels: HTMLLIElement[];
  // labelContainer: HTMLUListElement;

  constructor(label:string) {
    super(label, '');
    this.traceData = new GammaData(label);
    this.minSpan = document.createElement('span');
    this.maxSpan = document.createElement('span');
    // this.readout.appendChild(this.minSpan);
    // this.readout.appendChild(this.maxSpan);
    // this.readout.classList.add('range');
    this.midLabels = [];
    // this.labelContainer = this.avgLabel.parentNode as HTMLUListElement;
    // use the avgLabel as a cloning template
    // this.avgLabel.textContent = '';
    // this.avgLabel.style.position = 'absolute';
  }

  setRangeData(data:number[][], dates: number[], isLogLinear: boolean, kneeIndex: number, sampleIndex: number):void {
    (this.traceData as GammaData).setRangeData(data, dates, isLogLinear, kneeIndex, sampleIndex);
    requestAnimationFrame(()=>this.canvas.classList.toggle('kneed', kneeIndex > 0));
  }


  draw():void {
    const {converted} = this.traceData as GammaData;
    const {ctx, width, height} = this;
    ctx.clearRect(0, 0, width + 1, height + 1);
    this.drawField();
    this.drawRangeSeries(converted);
    this.drawLabels();
  }


  drawRangeSeries(data:number[][]):void {
    if (data.length === 0) return;
    const {chartHeight, ctx, traceWidth} = this;
    const {displayMin, displayMax} = this.traceData;
    const valRange = displayMax - displayMin;
    const verticalScale = chartHeight / (valRange || 1);
    const kCount = data.length;
    const kWidth = traceWidth / (kCount - 1);
    let i = 0;
    let hpd = data[i][MIN_HPD_INDEX];
    const firstY = chartHeight-(hpd-displayMin) * verticalScale;
    let x = TICK_LENGTH;
    let y = firstY;
    ctx.lineWidth = 1;
    ctx.fillStyle = HPD_COLOR;

    const drawingStaircase = !(this.traceData as GammaData).isLogLinear;

    // console.log(this.dataMin, this.dataMax, this.displayMin, this.displayMax);

    // draw the 95% HPD area
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (i = 1; i < kCount; i++) {
      hpd = data[i][MIN_HPD_INDEX];
      y = chartHeight-(hpd-displayMin) * verticalScale;
      if (drawingStaircase) {
        ctx.lineTo(x, y);
      }
      x = TICK_LENGTH + i * kWidth;
      ctx.lineTo(x, y);
    }
    for (i = kCount - 1; i > 0; i--) {
      x = TICK_LENGTH + i * kWidth;
      hpd = data[i][MAX_HPD_INDEX];
      y = chartHeight-(hpd-displayMin) * verticalScale;
      ctx.lineTo(x, y);
      if (drawingStaircase) {
        x = TICK_LENGTH + (i-1) * kWidth;
        ctx.lineTo(x, y);
      }
    }
    if (!drawingStaircase) {
      x = TICK_LENGTH;
      hpd = data[0][MAX_HPD_INDEX];
      y = chartHeight-(hpd-displayMin) * verticalScale;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(TICK_LENGTH, firstY);
    ctx.fill();

    // draw the population curve for the current sample
    const {rangeData, sampleIndex } = (this.traceData as GammaData);
    const drawnSampleIndex = sampleIndex === UNSET ? rangeData.length - 1 : sampleIndex;
    if (0 <= drawnSampleIndex && drawnSampleIndex < rangeData.length) {
      const sampleData = rangeData[drawnSampleIndex];
      console.assert(sampleData.length === kCount, "Current population curve has different number of points than mean curve?");

      ctx.beginPath();
      ctx.strokeStyle = CURRENT_POP_CURVE_COLOR;
      x = TICK_LENGTH;
      y = chartHeight-(sampleData[0]-displayMin) * verticalScale;
      if (!drawingStaircase) {
        ctx.moveTo(x, y);
      }
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

    // draw the median
    ctx.beginPath();
    ctx.strokeStyle = TRACE_COLOR;
    let median = data[0][MEDIAN_INDEX];
    x = TICK_LENGTH;
    y = chartHeight-(median-displayMin) * verticalScale;
    ctx.moveTo(x, y);
    for (i = 1; i < kCount; i++) {
      median = data[i][MEDIAN_INDEX];
      y = chartHeight-(median-displayMin) * verticalScale;
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
      // avgLabel,
      midLabels,
      // maxLabel, minLabel,
      // labelContainer,
      minSpan, maxSpan} = this;
    // const {dates, yearsMin, yearsMax, logRange, minMagnitude, maxMagnitude} = this.traceData as GammaData;
    const {dates, logRange, minMagnitude, maxMagnitude} = this.traceData as GammaData;
    chartHeight -= HALF_BORDER * 2;
    // maxLabel.textContent = minimalDecimalLabel(yearsMax);
    // minLabel.textContent = minimalDecimalLabel(yearsMin);
    /* clear the mid labels */
    midLabels.forEach(ele=>ele.remove());
    midLabels.length = 0;
    minSpan.textContent = toFullDateString(dates[0])
    maxSpan.textContent = toFullDateString(dates[dates.length - 1]);
    const labelHeight = LABEL_HEIGHT * logRange;
    const labelsOK = chartHeight >= labelHeight;
    // const step = Math.pow(10, minMagnitude);
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = BORDER_WEIGHT;
    ctx.beginPath();
    const logLabels = (this.traceData as GammaData).logLabels;
    logLabels.forEach((ll:LogLabelType)=>{
      // const {value, mag, ticks} = ll;
      const {mag, ticks} = ll;
      ticks.forEach(([pct, tickLength], i)=>{
        const y = HALF_BORDER + chartHeight - pct * chartHeight;
        if (i === 0) {
          ctx.stroke();
          ctx.beginPath();
          ctx.lineWidth = BORDER_WEIGHT;
          ctx.globalAlpha = 1;
          if (labelsOK && mag !== minMagnitude && mag !== maxMagnitude) {
            // const label = avgLabel.cloneNode(true) as HTMLLIElement;
            // label.style.top = `${y-2}px`;
            // label.textContent = minimalDecimalLabel(value);
            // this.midLabels.push(label);
            // labelContainer.appendChild(label);
          }
          ctx.moveTo(TICK_LENGTH, y);
          ctx.lineTo(TICK_LENGTH - tickLength, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.globalAlpha = 0.7;
          if (!labelsOK) {
            ctx.lineWidth = BORDER_WEIGHT / 2;
          }
        } else if (labelsOK || i % 3 === 1) {
          ctx.moveTo(TICK_LENGTH, y);
          ctx.lineTo(TICK_LENGTH - tickLength, y);
        }


      });
    });
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

