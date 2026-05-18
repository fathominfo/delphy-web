import { toFullDateString } from "../../pythia/dates";
import { NO_VALUE, safeLabel, UNSET } from "../common";
import { HoverNodeFnc, ScatterDataFunction } from "./runcommon";
import { ScatterData } from "./scatterdata";
import { chartContainer, TraceCanvas } from "./tracecanvas";
import { Quadtree, Quadtreeable } from '../../util/quadtree.js';


const TICK_SELECTOR = ".tick";
const TICK_LABEL_SELECTOR = ".tick-label";
const SCATTER_TEMPLATE = chartContainer.querySelector('.module.scatter') as HTMLDivElement;
SCATTER_TEMPLATE.remove();
const DOT_TEMPLATE = SCATTER_TEMPLATE.querySelector("ellipse") as SVGEllipseElement;
DOT_TEMPLATE.remove();
const TICK_TEMPLATE = SCATTER_TEMPLATE.querySelector(TICK_SELECTOR) as SVGLineElement;
TICK_TEMPLATE.remove();
const TICK_LABEL_TEMPLATE = SCATTER_TEMPLATE.querySelector(TICK_LABEL_SELECTOR) as SVGLineElement;
TICK_LABEL_TEMPLATE.remove();


const LABEL_HEIGHT = 13;
const DATE_LABEL_WIDTH = 86;
const HALF_DATE_LABEL_WIDTH = DATE_LABEL_WIDTH / 2;
const TICK_LENGTH = 5;
const TICK_GAP = 6;

const DOT_RADIUS = 1.5;
const MARGIN = {
  left: DOT_RADIUS,
  top: LABEL_HEIGHT / 2,
  right: 67,
  bottom: 20
};



type LabelY = {
  label: SVGTextElement,
  y: number
};


export class ScatterPlotCanvas extends TraceCanvas {

  minSpan: SVGTextElement;
  maxSpan: SVGTextElement;
  yAxisWidth: number = UNSET;
  yAxisHeight: number = UNSET;
  dataWidth: number = UNSET;
  dataHeight: number = UNSET;
  dots: SVGEllipseElement[] = [];
  regressionLine: SVGLineElement;
  background: SVGRectElement;
  quadTree: Quadtree;
  hoverDate: SVGTextElement;
  hoverCount: SVGTextElement;
  tickLabels: LabelY[] = [];




  constructor(label:string, subtitle: string, className: string,
    getDataFnc: ScatterDataFunction, tipCount: number,
    hoverCallback: HoverNodeFnc
  ) {
    if (className === '') {
      className = label.toLowerCase().replace(/ /g, '-').replace(/[()<>]/g, '');
    }
    super(label, '', className, getDataFnc, SCATTER_TEMPLATE);
    if (subtitle !== '') {
      (this.container.querySelector(".header .subtitle") as HTMLParagraphElement).innerHTML = subtitle;
    }
    this.traceData = new ScatterData(label, '', getDataFnc);
    this.minSpan = this.svg.querySelector(".min-date") as SVGTextElement;
    this.maxSpan = this.svg.querySelector(".max-date") as SVGTextElement;
    /* the number of tips will not change */
    for (let i=0; i < tipCount; i++) {
      const dot = DOT_TEMPLATE.cloneNode(true) as SVGEllipseElement;
      dot.setAttribute("data-index", `${i}`);
      this.svg.appendChild(dot);
      this.dots.push(dot);
    }
    this.regressionLine = this.svg.querySelector(".regression") as SVGLineElement;
    this.background = this.svg.querySelector(".bg") as SVGRectElement;
    this.hoverDate = this.svg.querySelector(".hover-date") as SVGTextElement;
    this.hoverCount = this.svg.querySelector(".hover-count") as SVGTextElement;
    this.quadTree = new Quadtree(DOT_RADIUS);


    let prevNodeIndex = UNSET;
    const handlePointer = (event: PointerEvent)=>{
      const { closest } = this.quadTree.getClosest(event.offsetX, event.offsetY);
      let nodeIndex: number = UNSET;
      if (closest) {
        nodeIndex = closest.obj as number;
      }
      if (nodeIndex !== prevNodeIndex) {
        prevNodeIndex = nodeIndex;
        hoverCallback(nodeIndex);
      }
    };
    this.svg.addEventListener('pointerenter', handlePointer);
    this.svg.addEventListener('pointermove', handlePointer);
    this.svg.addEventListener('pointerleave', ()=>{
      hoverCallback(UNSET);
    });
  }

  sizeCanvas() {
    super.sizeCanvas();
    this.dataWidth = this.width - MARGIN.left - MARGIN.right;
    this.dataHeight = this.height - MARGIN.top - MARGIN.bottom;
    this.background.setAttribute("x", `${MARGIN.left}`);
    this.background.setAttribute("y", `${MARGIN.top}`);
    this.background.setAttribute("width", `${this.dataWidth}`);
    this.background.setAttribute("height", `${this.dataHeight}`);
    this.minSpan.setAttribute("x", `${MARGIN.left}`);
    this.minSpan.setAttribute("y", `${this.height}`);
    this.maxSpan.setAttribute("x", `${this.width - MARGIN.right}`);
    this.maxSpan.setAttribute("y", `${this.height}`);
    this.hoverCount.setAttribute("x", `${this.width - MARGIN.right + TICK_LENGTH + TICK_GAP * 2}`);
    this.hoverDate.setAttribute("y", `${this.height}`);
  }

  protected setSizes(): void {
    super.setSizes();
    // const svgHeight = this.yAxisHeight + (Y_AXIS_OVERFLOW * 2);
    // const viewBox = `0 -${Y_AXIS_OVERFLOW -1 } ${this.yAxisWidth} ${svgHeight + 4}`;
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
    this.drawLabels();
  }


  drawScatterPlot():void {
    const { tipCoords, slope, intercept } = (this.traceData as ScatterData);
    const { dataWidth, dataHeight, svg, quadTree } = this;
    quadTree.clear();
    tipCoords.forEach(([x, y], i)=>{
      const dot = this.dots[i];
      x = MARGIN.left + x * dataWidth;
      y = MARGIN.top + y * dataHeight
      dot.setAttribute("cx", `${x}`);
      dot.setAttribute("cy", `${y}`);
      dot.setAttribute("rx", `${DOT_RADIUS}`);
      dot.setAttribute("ry", `${DOT_RADIUS}`);
      svg.appendChild(dot);
      const item: Quadtreeable = {x, y, obj: i};
      quadTree.insert(item);
    });
  }


  drawLabels():void {
    const { yAxisHeight, minSpan, maxSpan, dataHeight, svg } = this;
    const { countMin, countMax, minDate, maxDate } = this.traceData as ScatterData;
    const countRange = countMax - countMin;
    const labelHeight = LABEL_HEIGHT * countRange;
    const labelsOK = yAxisHeight >= labelHeight;
    svg.querySelectorAll(TICK_SELECTOR).forEach(ele=>ele.remove());
    svg.querySelectorAll(TICK_LABEL_SELECTOR).forEach(ele=>ele.remove());
    this.tickLabels.length = 0;
    for (let i = 0; i <= countRange; i++) {
      const y = MARGIN.top + (1 - i / countRange) * dataHeight;
      this.addTick(y);
      if (labelsOK) {
        const label = this.addText(`${countMin + i}`, y);
        this.tickLabels.push({label, y});
      }
    }
    if (!labelsOK) {
      let label = this.addText(`${countMin}`, this.dataHeight + MARGIN.top);
      this.tickLabels.push({label, y: this.dataHeight + MARGIN.top});
      label = this.addText(`${countMax}`, MARGIN.top);
      this.tickLabels.push({label, y: MARGIN.top});
    }

    /* label the top tick */

    // this.addText(`${safeLabel(Math.pow(10, maxMagnitude), LOWER_OOM, UPPER_OOM)} years`, 0);
    minSpan.textContent = toFullDateString(minDate);
    maxSpan.textContent = toFullDateString(maxDate);
  }


  addTick(y: number) : SVGLineElement {
    const tick = TICK_TEMPLATE.cloneNode(true) as SVGLineElement;
    const x = this.width - MARGIN.right + TICK_GAP;
    tick.setAttribute("x1", `${ x }`);
    tick.setAttribute("y1", `${ y }`);
    tick.setAttribute("x2", `${ x + TICK_LENGTH }`);
    tick.setAttribute("y2", `${ y }`);
    this.svg.appendChild(tick);
    return tick;
  }

  addText(text: string, y: number): SVGTextElement {
    const textEle = TICK_LABEL_TEMPLATE.cloneNode(true) as SVGTextElement;
    textEle.textContent = text;
    textEle.setAttribute("x", `${ this.width - MARGIN.right + TICK_LENGTH + TICK_GAP * 2 }`);
    textEle.setAttribute("y", `${y}`);
    this.svg.appendChild(textEle);
    return textEle;
  }


  handleHover(nodeIndex: number) : void {
    if (nodeIndex === UNSET) {
      this.dots.forEach((dot:SVGEllipseElement)=>{
        dot.classList.remove("back");
        dot.classList.remove("highlight");
      });
      this.svg.classList.remove("hovering");
      this.minSpan.classList.remove("back");
      this.maxSpan.classList.remove("back");
      this.tickLabels.forEach(({label})=>label.classList.remove("back"));
    } else {
      this.dots.forEach((dot:SVGEllipseElement, i: number)=>{
        dot.classList.add("back");
        dot.classList.remove("highlight");
      });
      const hDot = this.dots[nodeIndex];
      hDot.classList.remove("back");
      hDot.classList.add("highlight");
      const scatterData = (this.traceData as ScatterData);
      const date = scatterData.tipDates[nodeIndex];
      const count = scatterData.tipMutationCounts[nodeIndex];
      const dateXFactor = scatterData.tipCoords[nodeIndex][0];
      const countYFactor = scatterData.tipCoords[nodeIndex][1];
      let dateX = dateXFactor * this.dataWidth;
      if (dateX < DATE_LABEL_WIDTH * 1.5) {
        if (dateX < HALF_DATE_LABEL_WIDTH) {
          dateX = HALF_DATE_LABEL_WIDTH;
        }
        this.minSpan.classList.add("back");
      } else {
        this.minSpan.classList.remove("back");

      }
      dateX += MARGIN.left;
      const right = this.width - MARGIN.right;
      if (dateX > right - DATE_LABEL_WIDTH  * 1.5) {
        this.maxSpan.classList.add("back");
        if (dateX > right - HALF_DATE_LABEL_WIDTH) {
          dateX = right - HALF_DATE_LABEL_WIDTH;
        }
      } else {
        this.maxSpan.classList.remove("back");
      }
      const countY = MARGIN.top + countYFactor * this.dataHeight;
      this.hoverDate.textContent = `${ toFullDateString(date) }`;
      this.hoverDate.setAttribute("x", `${ dateX }`);
      this.hoverCount.textContent = `${ count }`;
      this.hoverCount.setAttribute("y", `${ countY }`);
      this.tickLabels.forEach(({label, y})=>{
        label.classList.toggle("back", Math.abs(y - countY) < LABEL_HEIGHT);
      });
      this.svg.classList.add("hovering");
    }
  }

}

