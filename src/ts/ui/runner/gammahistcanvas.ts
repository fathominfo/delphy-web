import { toFullDateString } from "../../pythia/dates";
import { safeLabel, UNSET } from "../common";
import { GammaData, LogLabelType } from "./gammadata";
import { chartContainer, TraceCanvas } from "./tracecanvas";



const POP_TEMPLATE = chartContainer.querySelector('.module.population') as HTMLDivElement;
POP_TEMPLATE.remove();

/* labels for the y-axis can extend above and below the range of the chart */
const Y_AXIS_OVERFLOW = 10;

const LABEL_HEIGHT = 14;

const MIN_HPD_INDEX = 0;
const MAX_HPD_INDEX = 1;
const MEDIAN_INDEX = 3;


const LOWER_OOM = -2;
const UPPER_OOM = 3;


export class GammaHistCanvas extends TraceCanvas {

  minSpan: HTMLDivElement;
  maxSpan: HTMLDivElement;
  trendRange: SVGPathElement;
  medianTrend: SVGPathElement;
  sampleTrend: SVGPathElement;
  labelContainer: SVGElement;
  labelTextTemplate: SVGTextElement;
  labelTicTemplate: SVGLineElement;
  yAxisWidth: number = UNSET;
  yAxisHeight: number = UNSET;

  constructor(label:string) {
    super(label, '', POP_TEMPLATE);
    this.traceData = new GammaData(label);
    this.minSpan = this.container.querySelector(".support .axis.x .min-date") as HTMLDivElement;
    this.maxSpan = this.container.querySelector(".support .axis.x .max-date") as HTMLDivElement;
    this.trendRange = this.svg.querySelector(".trend.range") as SVGPathElement;
    this.medianTrend = this.svg.querySelector(".trend.median") as SVGPathElement;
    this.sampleTrend = this.svg.querySelector(".trend.sample") as SVGPathElement;
    this.labelContainer = this.container.querySelector(".chart .feature .axis.y svg.log-scale-tics") as SVGElement;
    this.labelTextTemplate = this.labelContainer.querySelector("text") as SVGTextElement;
    this.labelTicTemplate = this.labelContainer.querySelector("line") as SVGLineElement;
  }

  sizeCanvas() {
    super.sizeCanvas();
    const wrapper = this.labelContainer.parentElement as HTMLDivElement;
    this.yAxisWidth = wrapper.offsetWidth;
    this.yAxisHeight = wrapper.offsetHeight;
    requestAnimationFrame(()=>this.setSizes());
  }

  protected setSizes(): void {
    super.setSizes();
    const svgHeight = this.yAxisHeight + (Y_AXIS_OVERFLOW * 2);
    const viewBox = `0 -${Y_AXIS_OVERFLOW -1 } ${this.yAxisWidth} ${svgHeight + 4}`;
    this.labelContainer.setAttribute("width", `${this.yAxisWidth}`);
    this.labelContainer.setAttribute("height", `${svgHeight}`);
    this.labelContainer.setAttribute("viewBox", viewBox);
    this.labelContainer.style.marginTop = `-${Y_AXIS_OVERFLOW - 1}px`;
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
    const {height, width} = this;
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
    if (sampleIndex !== UNSET) {
      const sampleData = rangeData[sampleIndex];
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
    const { yAxisWidth, yAxisHeight, minSpan, maxSpan} = this;
    const {dates, logRange, maxMagnitude} = this.traceData as GammaData;
    this.labelContainer.innerHTML = '';
    minSpan.textContent = toFullDateString(dates[0])
    maxSpan.textContent = toFullDateString(dates[dates.length - 1]);
    const labelHeight = LABEL_HEIGHT * logRange;
    const labelsOK = yAxisHeight >= labelHeight;
    // ctx.strokeStyle = 'black';
    // ctx.lineWidth = 0;
    // ctx.beginPath();

    this.addTic(yAxisHeight, (this.traceData as GammaData).getTickLength(9));
    const logLabels = (this.traceData as GammaData).logLabels;
    logLabels.forEach((ll:LogLabelType)=>{
      const { ticks, value } = ll;
      ticks.forEach(([pct, tickLength], i)=>{
        const y = yAxisHeight - pct * yAxisHeight;
        const x2 = yAxisWidth - tickLength;
        /* we don't want the tics to be so dense that they become a single shape */
        if (labelsOK || i === 0 || i % 3 === 1) {
          const tic = this.addTic(y, x2);
          if (i === 0) {
            tic.classList.add("on-mag");
            this.addText(safeLabel(value), y);
          }
        }
      });

    });
    /* label the top tick */
    this.addTic(0, (this.traceData as GammaData).getTickLength(9));
    this.addText(safeLabel(Math.pow(10, maxMagnitude), LOWER_OOM, UPPER_OOM), 0);
  }

  addTic(y: number, x2: number) : SVGLineElement {
    const tic = this.labelTicTemplate.cloneNode(true) as SVGLineElement;
    tic.setAttribute("x1", `${ this.yAxisWidth }`);
    tic.setAttribute("y1", `${ y }`);
    tic.setAttribute("x2", `${ x2 }`);
    tic.setAttribute("y2", `${ y }`);
    this.labelContainer.appendChild(tic);
    return tic;
  }

  addText(text: string, y: number): SVGTextElement {
    const textEle = this.labelTextTemplate.cloneNode(true) as SVGTextElement;
    textEle.textContent = text;
    textEle.setAttribute("x", `${ this.yAxisWidth - 12 }`);
    textEle.setAttribute("y", `${y}`);
    this.labelContainer.appendChild(textEle);
    return textEle;
  }

}

