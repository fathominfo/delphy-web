import { toFullDateString } from "../../pythia/dates";
import { UNSET } from "../common";
import { GammaData, LogLabelType } from "./gammadata";
import { TRACE_COLOR, CURRENT_POP_CURVE_COLOR } from "./runcommon";
import { chartContainer, TraceCanvas } from "./tracecanvas";


export const POP_TEMPLATE = chartContainer.querySelector('.module.population') as HTMLDivElement;
POP_TEMPLATE.remove();



const HPD_COLOR = 'rgb(184, 208, 238)';

const LABEL_HEIGHT = 14;

const MIN_HPD_INDEX = 0;
const MAX_HPD_INDEX = 1;
const MEDIAN_INDEX = 3;


export class GammaHistCanvas extends TraceCanvas {

  midLabels: HTMLLIElement[];
  minSpan: HTMLDivElement;
  maxSpan: HTMLDivElement;
  trendRange: SVGPathElement;
  medianTrend: SVGPathElement;
  sampleTrend: SVGPathElement;
  // labelContainer: HTMLUListElement;

  constructor(label:string) {
    super(label, '', POP_TEMPLATE);
    this.traceData = new GammaData(label);
    this.midLabels = [];
    // const minDate = dates[0];
    // const maxDate = dates[dates.length - 1];
    this.minSpan = this.container.querySelector(".support .axis.x .min-date") as HTMLDivElement;
    this.maxSpan = this.container.querySelector(".support .axis.x .max-date") as HTMLDivElement;
    this.trendRange = this.svg.querySelector(".trend.range") as SVGPathElement;
    this.medianTrend = this.svg.querySelector(".trend.median") as SVGPathElement;
    this.sampleTrend = this.svg.querySelector(".trend.sample") as SVGPathElement;
    // this.labelContainer = this.avgLabel.parentNode as HTMLUListElement;
    // use the avgLabel as a cloning template
    // this.avgLabel.textContent = '';
    // this.avgLabel.style.position = 'absolute';
  }

  sizeCanvas() {
    console.log('sizing gamma')
    super.sizeCanvas();
  }

  setRangeData(data:number[][], dates: number[], isLogLinear: boolean, kneeIndex: number, sampleIndex: number):void {
    (this.traceData as GammaData).setRangeData(data, dates, isLogLinear, kneeIndex, sampleIndex);
  }

  handleTreeHighlight(treeIndex: number): void {
    this.traceData.handleTreeHighlight(treeIndex);
  }

  draw():void {
    this.drawRangeSeriesSVG();
    this.drawLabels();
  }


  drawRangeSeriesSVG():void {
    const data:number[][] = (this.traceData as GammaData).converted;
    if (data.length === 0) return;
    const {height, svg, width} = this;
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

    const drawingStaircase = !(this.traceData as GammaData).isLogLinear;

    // console.log(this.dataMin, this.dataMax, this.displayMin, this.displayMax);
    let rangeD: string;
    let sampleD = "";
    let medianD = "";

    // draw the 95% HPD area
    rangeD = `M${x} ${y} L`;
    for (i = 1; i < kCount; i++) {
      hpd = data[i][MIN_HPD_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      if (drawingStaircase) {
        rangeD += `${x} ${y} `;
      }
      x = i * kWidth;
      rangeD += `${x} ${y} `;
    }
    for (i = kCount - 1; i > 0; i--) {
      x = i * kWidth;
      hpd = data[i][MAX_HPD_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      rangeD += `${x} ${y} `;
      if (drawingStaircase) {
        x = (i-1) * kWidth;
        rangeD += `${x} ${y} `;
      }
    }
    if (!drawingStaircase) {
      x = 0;
      hpd = data[0][MAX_HPD_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      rangeD += `${x} ${y} `;
    }
    rangeD += `${0} ${firstY} `;

    // draw the population curve for the current sample
    const {rangeData, highlightIndex: sampleIndex } = (this.traceData as GammaData);
    const drawnSampleIndex = sampleIndex === UNSET ? rangeData.length - 1 : sampleIndex;
    if (0 <= drawnSampleIndex && drawnSampleIndex < rangeData.length) {
      const sampleData = rangeData[drawnSampleIndex];
      console.assert(sampleData.length === kCount, "Current population curve has different number of points than mean curve?");
      x = 0;
      y = height-(sampleData[0]-displayMin) * verticalScale;
      if (!drawingStaircase) {
        sampleD = `M${x} ${y} L`;
      }
      for (i = 1; i < kCount; i++) {
        y = height-(sampleData[i]-displayMin) * verticalScale;
        if (drawingStaircase) {
          sampleD = `M${x} ${y} L`;
        }
        x = i * kWidth;
        sampleD += `${x} ${y} `;
      }
      this.sampleTrend.classList.remove("hidden");
      this.sampleTrend.setAttribute("d", sampleD);
    } else {
      this.sampleTrend.classList.add("hidden");
    }

    // draw the median
    let median = data[0][MEDIAN_INDEX];
    x = 0;
    y = height-(median-displayMin) * verticalScale;
    medianD = `M${x} ${y} L`;
    for (i = 1; i < kCount; i++) {
      median = data[i][MEDIAN_INDEX];
      y = height-(median-displayMin) * verticalScale;
      if (drawingStaircase) {
        medianD = `M${x} ${y} L`;
      }
      x = i * kWidth;
      medianD += `${x} ${y} `;
    }

    this.trendRange.setAttribute("d", rangeD);
    this.medianTrend.setAttribute("d", medianD);
  }


  drawLabels():void {
    const {height} = this;
    const { midLabels, minSpan, maxSpan} = this;
    const {dates, logRange, minMagnitude, maxMagnitude} = this.traceData as GammaData;
    /* clear the mid labels */
    midLabels.forEach(ele=>ele.remove());
    midLabels.length = 0;
    minSpan.textContent = toFullDateString(dates[0])
    maxSpan.textContent = toFullDateString(dates[dates.length - 1]);
    const labelHeight = LABEL_HEIGHT * logRange;
    const labelsOK = height >= labelHeight;
    // ctx.strokeStyle = 'black';
    // ctx.lineWidth = 0;
    // ctx.beginPath();
    const logLabels = (this.traceData as GammaData).logLabels;
    logLabels.forEach((ll:LogLabelType)=>{
      const {mag, ticks} = ll;
      ticks.forEach(([pct, tickLength], i)=>{
        const y = 0 + height - pct * height;
        if (i === 0) {
          // ctx.stroke();
          // ctx.beginPath();
          // ctx.lineWidth = 0;
          // ctx.globalAlpha = 1;
          // ctx.moveTo(0, y);
          // ctx.lineTo(0 - tickLength, y);
          // ctx.stroke();
          // ctx.beginPath();
          // ctx.globalAlpha = 0.7;
          // if (!labelsOK) {
          //   ctx.lineWidth = 0 / 2;
          // }
        } else if (labelsOK || i % 3 === 1) {
        //   ctx.moveTo(0, y);
        //   ctx.lineTo(0 - tickLength, y);
        }


      });
    });
    /* the top tick */
    // ctx.stroke();
    // ctx.beginPath();
    // ctx.lineWidth = 0;
    // ctx.globalAlpha = 1;
    // ctx.moveTo(0, 0);
    // ctx.lineTo(0, 0);
    // ctx.stroke();
  }

}

