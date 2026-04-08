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
  hoverLabelTemplate: SVGTextElement;
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
    this.minSpan = this.container.querySelector(".support .axis.x .min-date") as HTMLDivElement;
    this.maxSpan = this.container.querySelector(".support .axis.x .max-date") as HTMLDivElement;
    this.hoverSpan = this.container.querySelector(".support .axis.x .hover-date") as HTMLDivElement;
    this.trendRange = this.svg.querySelector(".trend.range") as SVGPathElement;
    this.medianTrend = this.svg.querySelector(".trend.median") as SVGPathElement;
    this.sampleTrend = this.svg.querySelector(".trend.sample") as SVGPathElement;
    // this.highlightDistribution = this.svg.querySelector(".dist") as SVGPathElement;
    this.highlightG = this.svg.querySelector("g.highlight") as SVGGElement;
    this.labelContainer = this.container.querySelector(".chart .feature .axis.y svg.log-scale-ticks") as SVGElement;
    this.labelTextTemplate = this.labelContainer.querySelector(".tick") as SVGTextElement;
    this.labelTickTemplate = this.labelContainer.querySelector("line") as SVGLineElement;
    this.hoverLabelTemplate = this.labelContainer.querySelector(".hover") as SVGTextElement;
    this.hoverLabelTemplate.remove();
    const gammaData = this.traceData as GammaData;
    this.svg.addEventListener('pointerenter', (event: PointerEvent)=>{
      const xPct = event.offsetX / this.width;
      const dateIndex = Math.round(gammaData.minDate + xPct * (gammaData.maxDate - gammaData.minDate));
      gammaData.setDateIndex(dateIndex);
      requestAnimationFrame(()=>this.draw());
    });
    this.svg.addEventListener('pointermove', (event: PointerEvent)=>{
      const xPct = event.offsetX / this.width;
      const dateIndex = Math.round(gammaData.minDate + xPct * (gammaData.maxDate - gammaData.minDate));
      if (gammaData.setDateIndex(dateIndex)) {
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
    let median = knotStats[0][MEDIAN_INDEX];
    x = PADDING;
    y = height-(median-displayMin) * verticalScale;
    medianD = `M${x} ${y} L`;
    for (i = 1; i < kCount; i++) {
      median = knotStats[i][MEDIAN_INDEX];
      y = height-(median-displayMin) * verticalScale;
      if (drawingStaircase) {
        medianD = `M${x} ${y} L`;
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
      this.highlightG.setAttribute("transform", `translate(${dateX}, 0)`);
      this.container.classList.add("highlighting");
    } else {
      this.container.classList.remove("highlighting");
    }


    this.trendRange.setAttribute("d", rangeD);
    this.medianTrend.setAttribute("d", medianD);
  }


  drawLabels():void {
    const { yAxisHeight, minSpan, maxSpan, height } = this;
    const { logRange, maxMagnitude, minDate, maxDate,
      highlightData } = this.traceData as GammaData;
    const labelHeight = LABEL_HEIGHT * logRange;
    const labelsOK = yAxisHeight >= labelHeight;
    // ctx.strokeStyle = 'black';
    // ctx.lineWidth = 0;
    // ctx.beginPath();
    let dateX = NO_VALUE;
    const highlighting = highlightData !== null;
    this.labelContainer.innerHTML = '';

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
    if (highlightData === null) {
      this.addText(`${safeLabel(Math.pow(10, maxMagnitude), LOWER_OOM, UPPER_OOM)} years`, 0);
      // const valRange = displayMax - displayMin;
      // const verticalScale = height / (valRange || 1);
      // const firstKnot = knotStats[0].slice(0);
      // let medianY = height-(firstKnot[MEDIAN_INDEX]-displayMin) * verticalScale;
      // let hpdMinY = height-(firstKnot[HPD_MIN_INDEX]-displayMin) * verticalScale;
      // let hpdMaxY = height-(firstKnot[HPD_MAX_INDEX]-displayMin) * verticalScale;
      // const positions: [number, number, number] = [hpdMinY, medianY, hpdMaxY];
      // this.setLabelYSpacing(positions);
      // hpdMinY = positions[0];
      // medianY = positions[1];
      // hpdMaxY = positions[2];
      // (this.svg.querySelector(".labels .hpdmin") as SVGTextElement).setAttribute("y", `${hpdMinY}`);
      // (this.svg.querySelector(".labels .median") as SVGTextElement).setAttribute("y", `${medianY}`);
      // (this.svg.querySelector(".labels .hpdmax") as SVGTextElement).setAttribute("y", `${hpdMaxY}`);
    } else {
      const { median, hpdMin, hpdMax, dateLabel } = highlightData;
      dateX = PADDING + highlightData.dateX * this.width;
      dateX = Math.min(Math.max(HALF_DATE_LABEL_WIDTH, dateX), this.width - HALF_DATE_LABEL_WIDTH);
      const positions: [number, number, number] = [
        highlightData.hpdMinY * height,
        highlightData.medianY * height,
        highlightData.hpdMaxY * height];
      this.setLabelYSpacing(positions);
      const [hpdMinY, medianY, hpdMaxY] = positions;
      this.addHighlightText(hpdMax, hpdMaxY, "max");
      this.addHighlightText(median, medianY, "median");
      this.addHighlightText(hpdMin, hpdMinY, "min");
      this.hoverSpan.textContent = dateLabel;
      this.hoverSpan.style.left = `${dateX}px`;
    }
    minSpan.textContent = toFullDateString(minDate);
    maxSpan.textContent = toFullDateString(maxDate);
    minSpan.classList.toggle("hidden", dateX !== NO_VALUE && dateX <= DATE_LABEL_WIDTH * 1.5);
    maxSpan.classList.toggle("hidden", dateX >= this.width - DATE_LABEL_WIDTH * 1.5);
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


  addHighlightText(value: number, y: number, stat: string) : SVGTextElement {
    const scaledValue = Math.exp(value) / 365;
    const textEle = this.hoverLabelTemplate.cloneNode(true) as SVGTextElement;
    const label = `${ safeLabel(scaledValue)} years`;
    (textEle.querySelector(".value") as SVGTSpanElement).textContent = label;
    (textEle.querySelector(".label") as SVGTSpanElement).textContent = ` ${stat}`;
    textEle.classList.add(stat);
    textEle.setAttribute("x", `${ POP_CHART_Y_AXIS_TEXT_RIGHT }`);
    textEle.setAttribute("y", `${y}`);
    this.labelContainer.appendChild(textEle);
    return textEle;
  }

}

