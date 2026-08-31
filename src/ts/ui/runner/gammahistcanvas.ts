import { toFullDateString } from "../../pythia/dates";
import { SkygridPopModel, SkygridPopModelType } from "../../pythia/delphy_api";
import { NO_VALUE, safeLabel, UNSET } from "../common";
import { MEDIAN_INDEX, HPD_MIN_INDEX, HPD_MAX_INDEX } from "../distribution";
import { GammaData, LogLabelType } from "./gammadata";
import { GammaDataFunction } from "./runcommon";
import { chartContainer, TraceCanvas } from "./tracecanvas";



const POP_TEMPLATE = chartContainer.querySelector('.module.population') as HTMLDivElement;
POP_TEMPLATE.remove();

/* labels for the y-axis can extend above and below the range of the chart */
const Y_AXIS_OVERFLOW = 10;

const LABEL_HEIGHT = 14;



const LOWER_OOM = -2;
const UPPER_OOM = 3;


const PADDING = 3;

const DATE_LABEL_WIDTH = 86;
const HALF_DATE_LABEL_WIDTH = DATE_LABEL_WIDTH / 2;
const POP_CHART_Y_AXIS_TEXT_RIGHT = 10;
const POP_CHART_LABEL_WIDTH = 95;





export class GammaHistCanvas extends TraceCanvas {

  minSpan: SVGTextElement;
  maxSpan: SVGTextElement;
  hoverSpan: SVGTextElement;
  trendRange: SVGPathElement;
  medianTrend: SVGPathElement;
  sampleTrend: SVGPathElement;
  // highlightDistribution: SVGPathElement;
  highlightG: SVGGElement;
  labelContainer: SVGElement;
  labelTextTemplate: SVGTextElement;
  labelTickTemplate: SVGLineElement;
  // hoverLabelTemplate: SVGTextElement;

  xAxisContainer: SVGGElement;
  xAxisMinTick: SVGLineElement;
  xAxisMaxTick: SVGLineElement;
  xAxisHoverTick: SVGLineElement;

  scrim: SVGRectElement;
  yAxisWidth: number = UNSET;
  yAxisHeight: number = UNSET;
  dataWidth: number = UNSET;

  constructor(label:string, subtitle: string, className: string, getDataFnc: GammaDataFunction) {
    if (className === '') {
      className = label.toLowerCase().replace(/ /g, '-').replace(/[()<>]/g, '');
    }
    super(label, '', className, getDataFnc, POP_TEMPLATE);
    if (subtitle !== '') {
      (this.container.querySelector(".header .subtitle") as HTMLParagraphElement).innerHTML = subtitle;
    }
    this.traceData = new GammaData(label, '', getDataFnc);
    this.minSpan = this.container.querySelector(".support .axis.x .min-date") as SVGTextElement;
    this.maxSpan = this.container.querySelector(".support .axis.x .max-date") as SVGTextElement;
    this.hoverSpan = this.container.querySelector(".support .axis.x .hover-date") as SVGTextElement;
    this.trendRange = this.svg.querySelector(".trend.range") as SVGPathElement;
    this.medianTrend = this.svg.querySelector(".trend.median") as SVGPathElement;
    this.sampleTrend = this.svg.querySelector(".trend.sample") as SVGPathElement;
    // this.highlightDistribution = this.svg.querySelector(".dist") as SVGPathElement;
    this.highlightG = this.svg.querySelector("g.highlight") as SVGGElement;
    this.labelContainer = this.container.querySelector(".chart .feature .axis.y svg.log-scale-ticks") as SVGElement;
    this.labelTextTemplate = this.labelContainer.querySelector(".tick") as SVGTextElement;
    this.labelTickTemplate = this.labelContainer.querySelector("line") as SVGLineElement;
    // this.hoverLabelTemplate = this.labelContainer.querySelector(".hover") as SVGTextElement;
    // this.hoverLabelTemplate.remove();

    this.xAxisContainer = this.container.querySelector(".x.axis") as SVGGElement;
    this.xAxisMinTick = this.xAxisContainer.querySelector(".tick.min") as SVGLineElement;
    this.xAxisMaxTick = this.xAxisContainer.querySelector(".tick.max") as SVGLineElement;
    this.xAxisHoverTick = this.xAxisContainer.querySelector(".tick.hover") as SVGLineElement;

    this.scrim = this.svg.querySelector(".scrim") as SVGRectElement;
    const gammaData = this.traceData as GammaData;
    this.svg.addEventListener('pointerenter', (event: PointerEvent)=>{
      const xPct = event.offsetX / this.width;
      const dateIndex = Math.round(gammaData.minDate + xPct * (gammaData.maxDate - gammaData.minDate));
      if (Number.isFinite(dateIndex)) {
        gammaData.setDateIndex(dateIndex);
        requestAnimationFrame(()=>this.draw());
      }
    });
    this.svg.addEventListener('pointermove', (event: PointerEvent)=>{
      const xPct = event.offsetX / this.width;
      const dateIndex = Math.round(gammaData.minDate + xPct * (gammaData.maxDate - gammaData.minDate));
      if (Number.isFinite(dateIndex) && gammaData.setDateIndex(dateIndex)) {
        requestAnimationFrame(()=>this.draw());
      }
    });
    this.svg.addEventListener('pointerleave', ()=>{
      gammaData.setDateIndex(NO_VALUE);
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

    const borderRect = this.svg.querySelector(".border") as SVGRectElement;
    borderRect.setAttribute("x", `${PADDING}`);
    borderRect.setAttribute("y", `${1}`);
    borderRect.setAttribute("width", `${this.width - PADDING * 2}`);
    borderRect.setAttribute("height", `${this.height - 2}`);

    this.labelContainer.setAttribute("width", `${this.yAxisWidth}`);
    this.labelContainer.setAttribute("height", `${svgHeight}`);
    this.labelContainer.setAttribute("viewBox", viewBox);
    this.labelContainer.style.marginTop = `-${Y_AXIS_OVERFLOW - 1}px`;

    this.xAxisContainer.querySelector("svg")?.setAttribute("viewBox", `0 0 ${this.width} 30`);
  }

  // setRangeData(data:number[][], dates: number[], isLogLinear: boolean, kneeIndex: number, sampleIndex: number):void {
  //   (this.traceData as GammaData).setRangeData(data, dates, isLogLinear, kneeIndex, sampleIndex);
  // }

  setRangeData(kneeIndex: number, minDate: number):void {
    const popModelHist : SkygridPopModel[] = (this.traceData.getDataFnc as GammaDataFunction)();
    const gamma = popModelHist.map(popModel=>popModel.gamma);
    const xHist = popModelHist[0].x;
    const isLogLinear = popModelHist[0].type === SkygridPopModelType.LogLinear;
    (this.traceData as GammaData).setRangeData(gamma, xHist, isLogLinear, kneeIndex, minDate);
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
    const {rangeData, sampleIndex, knotStats, highlightData } = gammaData;
    if (knotStats.length === 0) return;
    const {height, dataWidth} = this;
    const {displayMin, displayMax} = this.traceData;
    const valRange = displayMax - displayMin;
    const verticalScale = height / (valRange || 1);
    const kCount = knotStats.length;
    const kWidth = dataWidth / (kCount - 1);
    let i = 0;
    let hpd = knotStats[i][HPD_MIN_INDEX];
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
      hpd = knotStats[i][HPD_MIN_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      if (drawingStaircase) {
        rangeD += `${x} ${y} `;
      }
      x = PADDING + i * kWidth;
      rangeD += `${x} ${y} `;
    }
    for (i = kCount - 1; i > 0; i--) {
      x = PADDING + i * kWidth;
      hpd = knotStats[i][HPD_MAX_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      rangeD += `${x} ${y} `;
      if (drawingStaircase) {
        x = PADDING + (i-1) * kWidth;
        rangeD += `${x} ${y} `;
      }
    }
    if (!drawingStaircase) {
      x = PADDING;
      hpd = knotStats[0][HPD_MAX_INDEX];
      y = height-(hpd-displayMin) * verticalScale;
      rangeD += `${x} ${y} `;
    }
    rangeD += `${PADDING} ${firstY} `;

    // draw the population curve for the current sample
    if (sampleIndex !== UNSET && rangeData[sampleIndex]) {
      const sampleData = rangeData[sampleIndex];
      console.assert(sampleData.length === kCount, "Current population curve has different number of points than mean curve?");
      x = PADDING;
      y = height - (sampleData[0] - displayMin) * verticalScale;
      if (!drawingStaircase) {
        sampleD = `M${x} ${y} L`;
      }
      for (i = 1; i < kCount; i++) {
        y = height - (sampleData[i] - displayMin) * verticalScale;
        if (drawingStaircase) {
          sampleD += `M${x} ${y} L`;
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
    let median = knotStats[0][MEDIAN_INDEX];
    x = PADDING;
    y = height-(median-displayMin) * verticalScale;
    if (!drawingStaircase) {
      medianD = `M${x} ${y} L`;
    }
    for (i = 1; i < kCount; i++) {
      median = knotStats[i][MEDIAN_INDEX];
      y = height-(median-displayMin) * verticalScale;
      if (drawingStaircase) {
        medianD += `M${x} ${y} L`;
      }
      x = PADDING + i * kWidth;
      medianD += `${x} ${y} `;
    }

    if (highlightData !== null) {
      // /* get all the samples at this time */
      // const samples = postBurnin.map(treeData=>treeData[knotIndex]);
      // const x1 = knotIndex * kWidth - 2;
      // const x2 = x1 + 4;
      // samples.forEach((value, i)=>{
      //   const y = height-(value-displayMin) * verticalScale;
      //   distD += `M${x1} ${y} L${x2} ${y}  `;
      // });
      /* get median and 95% HPD for this time / knot */
      let { medianY, hpdMinY, hpdMaxY, dateX } = highlightData;
      medianY *= height;
      hpdMinY *= height;
      hpdMaxY *= height;
      dateX *= this.width;
      const { median, hpdMin, hpdMax, dateLabel } = highlightData;
      const positions: [number, number, number] = [hpdMinY, medianY, hpdMaxY];
      this.setLabelYSpacing(positions);
      const [hpdMinLabelY, medianLabelY, hpdMaxLabelY] = positions;
      const rightAlign = dateX > this.width - POP_CHART_LABEL_WIDTH;
      const textX = rightAlign ? - 4 : 4;
      let label = this.highlightG.querySelector(".hover.hpdmax") as SVGTextElement;
      label.setAttribute("x", `${textX}`);
      label.setAttribute("y", `${hpdMaxLabelY}`);
      (label.querySelector(".value") as SVGTSpanElement).textContent = `${safeLabel(hpdMax)} years`;
      label = this.highlightG.querySelector(".hover.median") as SVGTextElement;
      label.setAttribute("x", `${textX}`);
      label.setAttribute("y", `${medianLabelY}`);
      (label.querySelector(".value") as SVGTSpanElement).textContent = `${safeLabel(median)} years`;
      label = this.highlightG.querySelector(".hover.hpdmin") as SVGTextElement;
      label.setAttribute("x", `${textX}`);
      label.setAttribute("y", `${hpdMinLabelY}`);
      (label.querySelector(".value") as SVGTSpanElement).textContent = `${safeLabel(hpdMin)} years`;
      dateX = PADDING + highlightData.dateX * (this.width - PADDING * 2);
      (this.highlightG.querySelector(".point.hpdmin") as SVGEllipseElement).setAttribute("cy", `${hpdMinY}`);
      (this.highlightG.querySelector(".point.median") as SVGEllipseElement).setAttribute("cy", `${medianY}`);
      (this.highlightG.querySelector(".point.hpdmax") as SVGEllipseElement).setAttribute("cy", `${hpdMaxY}`);
      this.highlightG.setAttribute("transform", `translate(${dateX}, 0)`);
      if (rightAlign) {
        this.highlightG.classList.add("right");
        this.scrim.setAttribute("x", `${dateX - this.width}`);
      } else {
        this.highlightG.classList.remove("right");
        this.scrim.setAttribute("x", `${dateX}`);
      }

      this.scrim.setAttribute("width", `${this.width}`);
      this.scrim.setAttribute("height", `${height}`);
      this.container.classList.add("highlighting");
    }else{
      this.container.classList.remove("highlighting");
      // this.scrim.setAttribute("x", `${this.width}`);
    }

    this.trendRange.setAttribute("d", rangeD);
    this.medianTrend.setAttribute("d", medianD);
  }


  drawLabels():void {
    const { yAxisHeight} = this;
    const { logRange, maxMagnitude } = this.traceData as GammaData;
    const labelHeight = LABEL_HEIGHT * logRange;
    const labelsOK = yAxisHeight >= labelHeight;
    // const dateX = NO_VALUE;
    this.labelContainer.innerHTML = '';
    this.addTick(yAxisHeight, (this.traceData as GammaData).getTickLength(9));
    const logLabels = (this.traceData as GammaData).logLabels;
    let prevY = yAxisHeight * 2;
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
            if (prevY - y >= LABEL_HEIGHT && y >= LABEL_HEIGHT) {
              this.addText(safeLogLabel(safeLabel(value)), y);
              prevY = y;
            }
          }
        }
      });

    });
    /* label the top tick */
    this.addTick(0, (this.traceData as GammaData).getTickLength(9));
    this.addText(`${safeLogLabel(safeLabel(Math.pow(10, maxMagnitude), LOWER_OOM, UPPER_OOM))} years`, 0);
    this.drawXAxis();
  }

  drawXAxis(): void {
    const { minDate, maxDate, highlightData } = this.traceData as GammaData;
    const y1 = 0, y2 = 8, yLabel = 20;

    this.minSpan.setAttribute("x", `${PADDING + HALF_DATE_LABEL_WIDTH}`);
    this.minSpan.setAttribute("y", `${yLabel}`);

    this.maxSpan.setAttribute("x", `${this.width - PADDING - HALF_DATE_LABEL_WIDTH}`);
    this.maxSpan.setAttribute("y", `${yLabel}`);

    this.minSpan.textContent = toFullDateString(minDate);
    this.maxSpan.textContent = toFullDateString(maxDate);

    // endpoints
    this.xAxisMinTick.setAttribute("x1", `${1}`);
    this.xAxisMinTick.setAttribute("x2", `${1}`);
    this.xAxisMinTick.setAttribute("y1", `${y1}`);
    this.xAxisMinTick.setAttribute("y2", `${y2}`);

    this.xAxisMaxTick.setAttribute("x1", `${this.width -1}`);
    this.xAxisMaxTick.setAttribute("x2", `${this.width - 1}`);
    this.xAxisMaxTick.setAttribute("y1", `${y1}`);
    this.xAxisMaxTick.setAttribute("y2", `${y2}`);

    // hover
    if (highlightData !== null) {
      const { dateX, dateLabel } = highlightData;
      let x = Math.min(Math.max(.5, dateX * this.width), this.width - .5 * 2);
      this.xAxisHoverTick.setAttribute("x1", `${x}`);
      this.xAxisHoverTick.setAttribute("x2", `${x}`);
      this.xAxisHoverTick.setAttribute("y1", `${y1}`);
      this.xAxisHoverTick.setAttribute("y2", `${y2}`);

      this.hoverSpan.textContent = dateLabel;

      this.xAxisHoverTick.classList.remove("hidden")
      this.xAxisMinTick.classList.toggle("hidden", x !== NO_VALUE && x <= DATE_LABEL_WIDTH * 1.5);
      this.xAxisMaxTick.classList.toggle("hidden", x >= this.width - DATE_LABEL_WIDTH * 1.5);
      this.minSpan.classList.toggle("hidden", x !== NO_VALUE && x <= DATE_LABEL_WIDTH * 1.5);
      this.maxSpan.classList.toggle("hidden", x >= this.width - DATE_LABEL_WIDTH * 1.5);

      x = Math.min(Math.max(HALF_DATE_LABEL_WIDTH, x), this.width - HALF_DATE_LABEL_WIDTH * 2);

      this.hoverSpan.setAttribute("x", `${x}`)
      this.hoverSpan.setAttribute("y", `20`)

    } else {
      this.xAxisMinTick.classList.remove("hidden");
      this.xAxisMaxTick.classList.remove("hidden");
      this.minSpan.classList.remove("hidden");
      this.maxSpan.classList.remove("hidden");
      this.xAxisHoverTick.classList.add("hidden")
      this.hoverSpan.textContent = '';
    }
  }

  /* Warning: modifies the values in the supplied array */
  setLabelYSpacing(positions: [number, number, number]) : void {
    let [hpdMinY, medianY, hpdMaxY] = positions;
    const height = this.height;
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
    positions[0] = hpdMinY;
    positions[1] = medianY;
    positions[2] = hpdMaxY;
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


  // addHighlightText(value: number, y: number, stat: string) : SVGTextElement {
  //   const scaledValue = Math.exp(value) / 365;
  //   const textEle = this.hoverLabelTemplate.cloneNode(true) as SVGTextElement;
  //   const label = `${ safeLabel(scaledValue)} years`;
  //   (textEle.querySelector(".value") as SVGTSpanElement).textContent = label;
  //   (textEle.querySelector(".label") as SVGTSpanElement).textContent = ` ${stat}`;
  //   textEle.classList.add(stat);
  //   textEle.setAttribute("x", `${ POP_CHART_Y_AXIS_TEXT_RIGHT }`);
  //   textEle.setAttribute("y", `${y}`);
  //   this.labelContainer.appendChild(textEle);
  //   return textEle;
  // }

}


/*
for log labels, we get a lot of `1.00e+N`, and
we can simplify that to 1e+N
*/
const safeLogLabel = (label:string)=>label.replace('1.00e', '1e');