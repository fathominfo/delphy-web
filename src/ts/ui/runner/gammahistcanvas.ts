import { toFullDateString } from "../../pythia/dates";
import { UNSET } from "../common";
import { GammaData, LogLabelType } from "./gammadata";
import { TRACE_COLOR, CURRENT_POP_CURVE_COLOR } from "./runcommon";
import { TraceCanvas, BORDER_COLOR } from "./tracecanvas";


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
    const {height, ctx, width} = this;
    const {displayMin, displayMax} = this.traceData;
    const valRange = displayMax - displayMin;
    const verticalScale = height / (valRange || 1);
    const kCount = data.length;
    const kWidth = width / (kCount - 1);
    let i = 0;
    let hpd = data[i][MIN_HPD_INDEX];
    const firstY = height-(hpd-displayMin) * verticalScale;
    let x = 0;
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
      y = height-(hpd-displayMin) * verticalScale;
      if (drawingStaircase) {
        ctx.lineTo(x, y);
      }
      x = i * kWidth;
      ctx.lineTo(x, y);
    }
    for (i = kCount - 1; i > 0; i--) {
      x = i * kWidth;
      hpd = data[i][MAX_HPD_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      ctx.lineTo(x, y);
      if (drawingStaircase) {
        x = (i-1) * kWidth;
        ctx.lineTo(x, y);
      }
    }
    if (!drawingStaircase) {
      x = 0;
      hpd = data[0][MAX_HPD_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(0, firstY);
    ctx.fill();

    // draw the population curve for the current sample
    const {rangeData, sampleIndex } = (this.traceData as GammaData);
    const drawnSampleIndex = sampleIndex === UNSET ? rangeData.length - 1 : sampleIndex;
    if (0 <= drawnSampleIndex && drawnSampleIndex < rangeData.length) {
      const sampleData = rangeData[drawnSampleIndex];
      console.assert(sampleData.length === kCount, "Current population curve has different number of points than mean curve?");

      ctx.beginPath();
      ctx.strokeStyle = CURRENT_POP_CURVE_COLOR;
      x = 0;
      y = height-(sampleData[0]-displayMin) * verticalScale;
      if (!drawingStaircase) {
        ctx.moveTo(x, y);
      }
      for (i = 1; i < kCount; i++) {
        y = height-(sampleData[i]-displayMin) * verticalScale;
        if (drawingStaircase) {
          ctx.moveTo(x, y);
        }
        x = i * kWidth;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // draw the median
    ctx.beginPath();
    ctx.strokeStyle = TRACE_COLOR;
    let median = data[0][MEDIAN_INDEX];
    x = 0;
    y = height-(median-displayMin) * verticalScale;
    ctx.moveTo(x, y);
    for (i = 1; i < kCount; i++) {
      median = data[i][MEDIAN_INDEX];
      y = height-(median-displayMin) * verticalScale;
      if (drawingStaircase) {
        ctx.moveTo(x, y);
      }
      x = i * kWidth;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawLabels():void {
    const {height} = this;
    const {ctx,
      // avgLabel,
      midLabels,
      // maxLabel, minLabel,
      // labelContainer,
      minSpan, maxSpan} = this;
    // const {dates, yearsMin, yearsMax, logRange, minMagnitude, maxMagnitude} = this.traceData as GammaData;
    const {dates, logRange, minMagnitude, maxMagnitude} = this.traceData as GammaData;
    // maxLabel.textContent = minimalDecimalLabel(yearsMax);
    // minLabel.textContent = minimalDecimalLabel(yearsMin);
    /* clear the mid labels */
    midLabels.forEach(ele=>ele.remove());
    midLabels.length = 0;
    minSpan.textContent = toFullDateString(dates[0])
    maxSpan.textContent = toFullDateString(dates[dates.length - 1]);
    const labelHeight = LABEL_HEIGHT * logRange;
    const labelsOK = height >= labelHeight;
    // const step = Math.pow(10, minMagnitude);
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 0;
    ctx.beginPath();
    const logLabels = (this.traceData as GammaData).logLabels;
    logLabels.forEach((ll:LogLabelType)=>{
      // const {value, mag, ticks} = ll;
      const {mag, ticks} = ll;
      ticks.forEach(([pct, tickLength], i)=>{
        const y = 0 + height - pct * height;
        if (i === 0) {
          ctx.stroke();
          ctx.beginPath();
          ctx.lineWidth = 0;
          ctx.globalAlpha = 1;
          if (labelsOK && mag !== minMagnitude && mag !== maxMagnitude) {
            // const label = avgLabel.cloneNode(true) as HTMLLIElement;
            // label.style.top = `${y-2}px`;
            // label.textContent = minimalDecimalLabel(value);
            // this.midLabels.push(label);
            // labelContainer.appendChild(label);
          }
          ctx.moveTo(0, y);
          ctx.lineTo(0 - tickLength, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.globalAlpha = 0.7;
          if (!labelsOK) {
            ctx.lineWidth = 0 / 2;
          }
        } else if (labelsOK || i % 3 === 1) {
          ctx.moveTo(0, y);
          ctx.lineTo(0 - tickLength, y);
        }


      });
    });
    /* the top tick */
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth = 0;
    ctx.globalAlpha = 1;
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();
  }

}

