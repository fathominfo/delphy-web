import { toFullDateString } from "../../pythia/dates";
import { NO_VALUE, safeLabel, UNSET } from "../common";
import { ScatterDataFunction } from "./runcommon";
import { ScatterData } from "./scatterdata";
import { chartContainer, TraceCanvas } from "./tracecanvas";



const SCATTER_TEMPLATE = chartContainer.querySelector('.module.scatter') as HTMLDivElement;
SCATTER_TEMPLATE.remove();
const DOT_TEMPLATE = SCATTER_TEMPLATE.querySelector("ellipse") as SVGEllipseElement;
DOT_TEMPLATE.remove();

/* labels for the y-axis can extend above and below the range of the chart */
const Y_AXIS_OVERFLOW = 10;
const LABEL_HEIGHT = 14;
const DATE_LABEL_WIDTH = 86;
const HALF_DATE_LABEL_WIDTH = DATE_LABEL_WIDTH / 2;


const DOT_RADIUS = 1.5;
const MARGIN = {
  left: DOT_RADIUS,
  top: 22,
  right: 50,
  bottom: 24
};






export class ScatterPlotCanvas extends TraceCanvas {

  minSpan: HTMLDivElement;
  maxSpan: HTMLDivElement;
  hoverSpan: HTMLDivElement;
  yAxisWidth: number = UNSET;
  yAxisHeight: number = UNSET;
  dataWidth: number = UNSET;
  dataHeight: number = UNSET;
  dots: SVGEllipseElement[] = [];
  regressionLine: SVGLineElement;
  background: SVGRectElement;

  constructor(label:string, subtitle: string, className: string,
    getDataFnc: ScatterDataFunction, tipCount: number
  ) {
    if (className === '') {
      className = label.toLowerCase().replace(/ /g, '-').replace(/[()<>]/g, '');
    }
    super(label, '', className, getDataFnc, SCATTER_TEMPLATE);
    if (subtitle !== '') {
      (this.container.querySelector(".header .subtitle") as HTMLParagraphElement).innerHTML = subtitle;
    }
    this.traceData = new ScatterData(label, '', getDataFnc);
    this.minSpan = this.container.querySelector(".support .axis.x .min-date") as HTMLDivElement;
    this.maxSpan = this.container.querySelector(".support .axis.x .max-date") as HTMLDivElement;
    this.hoverSpan = this.container.querySelector(".support .axis.x .hover-date") as HTMLDivElement;
    /* the number of tips will not change */
    for (let i=0; i < tipCount; i++) {
      const dot = DOT_TEMPLATE.cloneNode(true) as SVGEllipseElement;
      dot.setAttribute("data-index", `${i}`);
      this.svg.appendChild(dot);
      this.dots.push(dot);
    }
    this.regressionLine = this.svg.querySelector(".regression") as SVGLineElement;
    this.background = this.svg.querySelector(".bg") as SVGRectElement;


    // this.svg.addEventListener('pointerenter', (event: PointerEvent)=>{
    //   const xPct = event.offsetX / this.width;
    //   const dateIndex = Math.round(gammaData.minDate + xPct * (gammaData.maxDate - gammaData.minDate));
    //   if (Number.isFinite(dateIndex)) {
    //     gammaData.setDateIndex(dateIndex);
    //     requestAnimationFrame(()=>this.draw());
    //   }
    // });
    // this.svg.addEventListener('pointermove', (event: PointerEvent)=>{
    //   const xPct = event.offsetX / this.width;
    //   const dateIndex = Math.round(gammaData.minDate + xPct * (gammaData.maxDate - gammaData.minDate));
    //   if (Number.isFinite(dateIndex) && gammaData.setDateIndex(dateIndex)) {
    //     requestAnimationFrame(()=>this.draw());
    //   }
    // });
    // this.svg.addEventListener('pointerleave', ()=>{
    //   gammaData.setDateIndex(NO_VALUE);
    //   requestAnimationFrame(()=>this.draw());
    // });
  }

  sizeCanvas() {
    // const wrapper = this.labelContainer.parentElement as HTMLDivElement;
    // this.yAxisWidth = wrapper.offsetWidth;
    // this.yAxisHeight = wrapper.offsetHeight;
    super.sizeCanvas();
    this.dataWidth = this.width - MARGIN.left - MARGIN.right;
    this.dataHeight = this.height - MARGIN.top - MARGIN.bottom;
    this.background.setAttribute("x", `${MARGIN.left}`);
    this.background.setAttribute("y", `${MARGIN.top}`);
    this.background.setAttribute("width", `${this.dataWidth}`);
    this.background.setAttribute("height", `${this.dataHeight}`);

  }

  protected setSizes(): void {
    super.setSizes();
    // const svgHeight = this.yAxisHeight + (Y_AXIS_OVERFLOW * 2);
    // const viewBox = `0 -${Y_AXIS_OVERFLOW -1 } ${this.yAxisWidth} ${svgHeight + 4}`;
    // this.labelContainer.setAttribute("width", `${this.yAxisWidth}`);
    // this.labelContainer.setAttribute("height", `${svgHeight}`);
    // this.labelContainer.setAttribute("viewBox", viewBox);
    // this.labelContainer.style.marginTop = `-${Y_AXIS_OVERFLOW - 1}px`;
  }

  // setRangeData(data:number[][], dates: number[], isLogLinear: boolean, kneeIndex: number, sampleIndex: number):void {
  //   (this.traceData as GammaData).setRangeData(data, dates, isLogLinear, kneeIndex, sampleIndex);
  // }

  setRangeData(kneeIndex: number, minDate: number, maxDate: number):void {
    const mutsAndDates : number[][] = (this.traceData.getDataFnc as ScatterDataFunction)();
    (this.traceData as ScatterData).setTipData(mutsAndDates, kneeIndex, minDate, maxDate);
  }

  handleTreeHighlight(treeIndex: number): void {
    this.traceData.handleTreeHighlight(treeIndex);
  }

  draw():void {
    this.drawScatterPlot();
  }


  drawScatterPlot():void {
    const { tipCoords, slope, intercept } = (this.traceData as ScatterData);
    const { dataWidth, dataHeight, svg } = this;
    tipCoords.forEach(([x, y], i)=>{
      const dot = this.dots[i];
      x = MARGIN.left + x * dataWidth;
      y = MARGIN.top + y * dataHeight
      dot.setAttribute("cx", `${x}`);
      dot.setAttribute("cy", `${y}`);
      dot.setAttribute("rx", `${DOT_RADIUS}`);
      dot.setAttribute("ry", `${DOT_RADIUS}`);
      svg.appendChild(dot);
    });
  }


}

