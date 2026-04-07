import { toDateString, toFullDateString } from "../../pythia/dates";
import { SkygridPopModel, SkygridPopModelType } from "../../pythia/delphy_api";
import { getDateLabel, NO_VALUE, numericSort, safeLabel, UNSET } from "../common";
import { GammaData, LogLabelType } from "./gammadata";
import { GammaDataFunction } from "./runcommon";
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


const PADDING = 3;

const DATE_LABEL_WIDTH = 86;
const HALF_DATE_LABEL_WIDTH = DATE_LABEL_WIDTH / 2;
const POP_CHART_Y_AXIS_TEXT_RIGHT = 10;

type highlightDataType = {
  median: number,
  medianY: number,
  hpdMin: number,
  hpdMinY: number,
  hpdMax: number,
  hpdMaxY: number
};



export class GammaHistCanvas extends TraceCanvas {

  minSpan: HTMLDivElement;
  maxSpan: HTMLDivElement;
  hoverSpan: HTMLDivElement;
  trendRange: SVGPathElement;
  medianTrend: SVGPathElement;
  sampleTrend: SVGPathElement;
  // highlightDistribution: SVGPathElement;
  highlightG: SVGGElement;
  labelContainer: SVGElement;
  labelTextTemplate: SVGTextElement;
  labelTickTemplate: SVGLineElement;
  yAxisWidth: number = UNSET;
  yAxisHeight: number = UNSET;
  dataWidth: number = UNSET;
  highlightData: highlightDataType = {
    median: UNSET,
    medianY: UNSET,
    hpdMin: UNSET,
    hpdMinY: UNSET,
    hpdMax: UNSET,
    hpdMaxY: UNSET
  };

  constructor(label:string, getDataFnc: GammaDataFunction) {
    const className = label.toLowerCase().replace(/ /g, '-').replace(/[()<>]/g, '');
    super(label, '', className, getDataFnc, POP_TEMPLATE);
    this.traceData = new GammaData(label, '', getDataFnc);
    this.minSpan = this.container.querySelector(".support .axis.x .min-date") as HTMLDivElement;
    this.maxSpan = this.container.querySelector(".support .axis.x .max-date") as HTMLDivElement;
    this.hoverSpan = this.container.querySelector(".support .axis.x .hover-date") as HTMLDivElement;
    this.trendRange = this.svg.querySelector(".trend.range") as SVGPathElement;
    this.medianTrend = this.svg.querySelector(".trend.median") as SVGPathElement;
    this.sampleTrend = this.svg.querySelector(".trend.sample") as SVGPathElement;
    // this.highlightDistribution = this.svg.querySelector(".dist") as SVGPathElement;
    this.highlightG = this.svg.querySelector("g.highlight") as SVGGElement;
    this.labelContainer = this.container.querySelector(".chart .feature .axis.y svg.log-scale-ticks") as SVGElement;
    this.labelTextTemplate = this.labelContainer.querySelector("text") as SVGTextElement;
    this.labelTickTemplate = this.labelContainer.querySelector("line") as SVGLineElement;
    const gammaData = this.traceData as GammaData;
    this.svg.addEventListener('pointerenter', (event: PointerEvent)=>{
      const xPct = event.offsetX / this.width;
      gammaData.dateIndex = Math.round(gammaData.minDate + xPct * (gammaData.maxDate - gammaData.minDate));
      requestAnimationFrame(()=>this.draw());
    });
    this.svg.addEventListener('pointermove', (event: PointerEvent)=>{
      const old = gammaData.knotIndex;
      const xPct = event.offsetX / this.width;
      gammaData.dateIndex = Math.round(gammaData.minDate + xPct * (gammaData.maxDate - gammaData.minDate));
      if (old !== gammaData.knotIndex) {
        requestAnimationFrame(()=>this.draw());
      }
    });
    this.svg.addEventListener('pointerleave', (event: PointerEvent)=>{
      gammaData.dateIndex = NO_VALUE;
      requestAnimationFrame(()=>this.draw());
    });
  }

  sizeCanvas() {
    const wrapper = this.labelContainer.parentElement as HTMLDivElement;
    this.yAxisWidth = wrapper.offsetWidth;
    this.yAxisHeight = wrapper.offsetHeight;
    super.sizeCanvas();
    this.dataWidth = this.width - 2 * PADDING;

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

  // setRangeData(data:number[][], dates: number[], isLogLinear: boolean, kneeIndex: number, sampleIndex: number):void {
  //   (this.traceData as GammaData).setRangeData(data, dates, isLogLinear, kneeIndex, sampleIndex);
  // }

  setRangeData(kneeIndex: number):void {
    const popModelHist : SkygridPopModel[] = (this.traceData.getDataFnc as GammaDataFunction)();
    const gamma = popModelHist.map(popModel=>popModel.gamma);
    const xHist = popModelHist[0].x;
    const isLogLinear = popModelHist[0].type === SkygridPopModelType.LogLinear;
    (this.traceData as GammaData).setRangeData(gamma, xHist, isLogLinear, kneeIndex);
  }

  handleTreeHighlight(treeIndex: number): void {
    this.traceData.handleTreeHighlight(treeIndex);
  }

  draw():void {
    this.drawRangeSeriesSVG();
    this.drawLabels();
  }


  drawRangeSeriesSVG():void {
    const gammaData = (this.traceData as GammaData);
    const {rangeData, sampleIndex, knotIndex, postBurnin, knotStats: converted } = gammaData;
    if (converted.length === 0) return;
    const {height, dataWidth} = this;
    const {displayMin, displayMax} = this.traceData;
    const valRange = displayMax - displayMin;
    const verticalScale = height / (valRange || 1);
    const kCount = converted.length;
    const kWidth = dataWidth / (kCount - 1);
    let i = 0;
    let hpd = converted[i][MIN_HPD_INDEX];
    const firstY = height-(hpd-displayMin) * verticalScale;
    let x = PADDING;
    let y = firstY;

    const drawingStaircase = !(this.traceData as GammaData).isLogLinear;

    // console.log(this.dataMin, this.dataMax, this.displayMin, this.displayMax);
    let rangeD: string;
    let sampleD = "";
    let medianD = "";

    // draw the 95% HPD area
    rangeD = `M${x} ${y} L`;
    for (i = 1; i < kCount; i++) {
      hpd = converted[i][MIN_HPD_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      if (drawingStaircase) {
        rangeD += `${x} ${y} `;
      }
      x = PADDING + i * kWidth;
      rangeD += `${x} ${y} `;
    }
    for (i = kCount - 1; i > 0; i--) {
      x = PADDING + i * kWidth;
      hpd = converted[i][MAX_HPD_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      rangeD += `${x} ${y} `;
      if (drawingStaircase) {
        x = PADDING + (i-1) * kWidth;
        rangeD += `${x} ${y} `;
      }
    }
    if (!drawingStaircase) {
      x = PADDING;
      hpd = converted[0][MAX_HPD_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      rangeD += `${x} ${y} `;
    }
    rangeD += `${PADDING} ${firstY} `;

    // draw the population curve for the current sample
    if (sampleIndex !== UNSET) {
      const sampleData = rangeData[sampleIndex];
      console.assert(sampleData.length === kCount, "Current population curve has different number of points than mean curve?");
      x = PADDING;
      y = height-(sampleData[0]-displayMin) * verticalScale;
      if (!drawingStaircase) {
        sampleD = `M${x} ${y} L`;
      }
      for (i = 1; i < kCount; i++) {
        y = height-(sampleData[i]-displayMin) * verticalScale;
        if (drawingStaircase) {
          sampleD = `M${x} ${y} L`;
        }
        x = PADDING + i * kWidth;
        sampleD += `${x} ${y} `;
      }
      this.sampleTrend.classList.remove("hidden");
      this.sampleTrend.setAttribute("d", sampleD);
    } else {
      this.sampleTrend.classList.add("hidden");
    }

    // draw the median
    let median = converted[0][MEDIAN_INDEX];
    x = PADDING;
    y = height-(median-displayMin) * verticalScale;
    medianD = `M${x} ${y} L`;
    for (i = 1; i < kCount; i++) {
      median = converted[i][MEDIAN_INDEX];
      y = height-(median-displayMin) * verticalScale;
      if (drawingStaircase) {
        medianD = `M${x} ${y} L`;
      }
      x = PADDING + i * kWidth;
      medianD += `${x} ${y} `;
    }

    if (knotIndex !== NO_VALUE) {
      // /* get all the samples at this time */
      // const samples = postBurnin.map(treeData=>treeData[knotIndex]);
      // const x1 = knotIndex * kWidth - 2;
      // const x2 = x1 + 4;
      // samples.forEach((value, i)=>{
      //   const y = height-(value-displayMin) * verticalScale;
      //   distD += `M${x1} ${y} L${x2} ${y}  `;
      // });
      /* get median and 95% HPD for this time / knot */
      const x = PADDING + knotIndex * kWidth;
      const knotData = converted[knotIndex].slice(0);
      const median = knotData[MEDIAN_INDEX];
      const hpdMin = knotData[MIN_HPD_INDEX];
      const hpdMax = knotData[MAX_HPD_INDEX];
      const medianY = height-(median-displayMin) * verticalScale;
      const hpdMinY = height-(hpdMin-displayMin) * verticalScale;
      const hpdMaxY = height-(hpdMax-displayMin) * verticalScale;
      this.highlightData = { median, medianY, hpdMin, hpdMinY, hpdMax, hpdMaxY };
      let line = this.highlightG.querySelector(".dist") as SVGLineElement;
      line.setAttribute("y1", `${hpdMinY}`);
      line.setAttribute("y2", `${hpdMaxY}`);
      line = this.svg.querySelector(".marker.hpdmin") as SVGLineElement;
      line.setAttribute("x1", `${PADDING}`);
      line.setAttribute("x2", `${this.width - PADDING}`);
      line.setAttribute("y1", `${hpdMinY}`);
      line.setAttribute("y2", `${hpdMinY}`);
      line = this.svg.querySelector(".marker.median") as SVGLineElement;
      line.setAttribute("x1", `${PADDING}`);
      line.setAttribute("x2", `${this.width - PADDING}`);
      line.setAttribute("y1", `${medianY}`);
      line.setAttribute("y2", `${medianY}`);
      line = this.svg.querySelector(".marker.hpdmax") as SVGLineElement;
      line.setAttribute("x1", `${PADDING}`);
      line.setAttribute("x2", `${this.width - PADDING}`);
      line.setAttribute("y1", `${hpdMaxY}`);
      line.setAttribute("y2", `${hpdMaxY}`);

      (this.highlightG.querySelector(".point.hpdmin") as SVGEllipseElement).setAttribute("cy", `${hpdMinY}`);
      (this.highlightG.querySelector(".point.median") as SVGEllipseElement).setAttribute("cy", `${medianY}`);
      (this.highlightG.querySelector(".point.hpdmax") as SVGEllipseElement).setAttribute("cy", `${hpdMaxY}`);
      this.highlightG.setAttribute("transform", `translate(${x}, 0)`);
      this.container.classList.add("highlighting");
      console.log(knotIndex, knotData);
    } else {
      this.container.classList.remove("highlighting");
    }


    this.trendRange.setAttribute("d", rangeD);
    this.medianTrend.setAttribute("d", medianD);
  }


  drawLabels():void {
    const { yAxisHeight, minSpan, maxSpan, height } = this;
    const { logRange, maxMagnitude, minDate, maxDate, knotIndex, dates, knotStats: converted } = this.traceData as GammaData;
    const labelHeight = LABEL_HEIGHT * logRange;
    const labelsOK = yAxisHeight >= labelHeight;
    // ctx.strokeStyle = 'black';
    // ctx.lineWidth = 0;
    // ctx.beginPath();
    let dateX = NO_VALUE;
    const highlighting = knotIndex !== NO_VALUE;
    this.labelContainer.innerHTML = '';
    {
      this.hoverSpan.textContent = '';
      this.addTick(yAxisHeight, (this.traceData as GammaData).getTickLength(9));
      const logLabels = (this.traceData as GammaData).logLabels;
      logLabels.forEach((ll:LogLabelType)=>{
        const { ticks, value } = ll;
        ticks.forEach(([pct, tickLength], i)=>{
          const y = yAxisHeight - pct * yAxisHeight;
          const x2 = tickLength;
          /* we don't want the tics to be so dense that they become a single shape */
          if (labelsOK || i === 0 || i % 3 === 1) {
            const tic = this.addTick(y, x2);
            if (i === 0) {
              tic.classList.add("on-mag");
              if (!highlighting) {
                this.addText(safeLabel(value), y);
              }
            }
          }
        });

      });
      /* label the top tick */
      this.addTick(0, (this.traceData as GammaData).getTickLength(9));
      if (!highlighting) {
        this.addText(`${safeLabel(Math.pow(10, maxMagnitude), LOWER_OOM, UPPER_OOM)} years`, 0);
      }
    }

    if (highlighting) {
      let { medianY, hpdMinY, hpdMaxY } = this.highlightData;
      const { median, hpdMin, hpdMax } = this.highlightData;
      const dateIndex = dates[knotIndex];
      const kWidth = this.dataWidth / (converted.length - 1);
      dateX = Math.min(Math.max(HALF_DATE_LABEL_WIDTH, PADDING + knotIndex * kWidth), this.width - HALF_DATE_LABEL_WIDTH);
      if (medianY < LABEL_HEIGHT * 1.5) {
        hpdMaxY = LABEL_HEIGHT * 0.5;
        medianY = LABEL_HEIGHT * 1.5;
      } else if (hpdMaxY - LABEL_HEIGHT / 2 < 0) {
        hpdMaxY = LABEL_HEIGHT / 2;
      }
      if (medianY > height - LABEL_HEIGHT * 1.5) {
        hpdMinY = height - LABEL_HEIGHT * 0.5;
        medianY = height - LABEL_HEIGHT * 1.5;
      } else if (hpdMinY > height - LABEL_HEIGHT * 0.5) {
        hpdMinY = height - LABEL_HEIGHT * 0.5;
      }
      if (medianY - hpdMaxY < LABEL_HEIGHT) {
        hpdMaxY = medianY - LABEL_HEIGHT;
      }
      if (hpdMinY - medianY < LABEL_HEIGHT) {
        hpdMinY = medianY + LABEL_HEIGHT;
      }

      this.addHighlightText(hpdMax, hpdMaxY, true);
      this.addHighlightText(median, medianY);
      this.addHighlightText(hpdMin, hpdMinY);
      this.hoverSpan.textContent = toFullDateString(dateIndex);
      this.hoverSpan.style.left = `${dateX}px`;
    }
    minSpan.textContent = toFullDateString(minDate);
    maxSpan.textContent = toFullDateString(maxDate);
    minSpan.classList.toggle("hidden", dateX !== NO_VALUE && dateX <= DATE_LABEL_WIDTH * 1.5);
    maxSpan.classList.toggle("hidden", dateX >= this.width - DATE_LABEL_WIDTH * 1.5);

  }

  addTick(y: number, x2: number) : SVGLineElement {
    const tick = this.labelTickTemplate.cloneNode(true) as SVGLineElement;
    tick.setAttribute("x1", `${ 0 }`);
    tick.setAttribute("y1", `${ y }`);
    tick.setAttribute("x2", `${ x2 }`);
    tick.setAttribute("y2", `${ y }`);
    this.labelContainer.appendChild(tick);
    return tick;
  }

  addText(text: string, y: number): SVGTextElement {
    const textEle = this.labelTextTemplate.cloneNode(true) as SVGTextElement;
    textEle.textContent = text;
    textEle.setAttribute("x", `${ POP_CHART_Y_AXIS_TEXT_RIGHT }`);
    textEle.setAttribute("y", `${y}`);
    this.labelContainer.appendChild(textEle);
    return textEle;
  }


  addHighlightText(value: number, y: number, showUnit=false) : SVGTextElement {
    const scaledValue = Math.exp(value) / 365;
    const textEle = this.labelTextTemplate.cloneNode(true) as SVGTextElement;
    let label = `${ safeLabel(scaledValue)}`;
    if (showUnit) {
      label += ' years';
    }
    textEle.textContent = label;
    textEle.classList.add("highlight");
    textEle.setAttribute("x", `${ POP_CHART_Y_AXIS_TEXT_RIGHT }`);
    textEle.setAttribute("y", `${y}`);
    this.labelContainer.appendChild(textEle);
    return textEle;
  }

}

