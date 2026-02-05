import { UNSET } from '../common';
import { TraceData } from './tracedata';

const maybeChartContainer = document.querySelector('#runner--panel--modules');
if (!maybeChartContainer) {
  throw new Error("index.html doesn't have the container for the charts!");
}

export const chartContainer = <HTMLDivElement> maybeChartContainer;

const maybeTemplate = chartContainer.querySelector('.module');
if (!maybeTemplate) {
  throw new Error("index.html doesn't have a template for the charts!");
}
export const TRACE_TEMPLATE = <HTMLDivElement> maybeTemplate;
TRACE_TEMPLATE.remove();


export const BG_COLOR = '#f5f5f5';
export const BORDER_COLOR = '#cbcbcb';





export class TraceCanvas {


  traceData: TraceData;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  svg: SVGElement;
  container: HTMLDivElement;
  className: string;


  height: number;
  width: number;
  hovering: boolean;

  isVisible: boolean;



  constructor(label:string, unit='') {
    this.traceData = new TraceData(label, unit);
    this.container = <HTMLDivElement>TRACE_TEMPLATE.cloneNode(true);
    this.className = label.toLowerCase().replace(/ /g, '-').replace(/[()]/g, '');
    this.container.classList.add(this.className);
    chartContainer.appendChild(this.container);
    const header = this.container.querySelector('h3.title') as HTMLHeadingElement;
    header.textContent = label;
    this.canvas = this.container.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas?.getContext("2d") as CanvasRenderingContext2D;
    this.svg = this.container.querySelector(".graph svg") as SVGElement;
    this.height = UNSET;
    this.width = UNSET;
    this.hovering = false;
    this.isVisible = true;
  }

  sizeCanvas() {
    // hack to get the right height in the flex container:
    // set width and height to zero, then recalculate
    const wrapper = this.svg.parentElement as HTMLDivElement;
    this.width = wrapper.offsetWidth;
    this.height = wrapper.offsetHeight;
    requestAnimationFrame(()=>this.setSizes());
  }

  protected setSizes() {
    if (this.canvas) {
      if (window.devicePixelRatio > 1) {
        this.canvas.width = Math.round(window.devicePixelRatio * this.width);
        this.canvas.height = Math.round(window.devicePixelRatio * this.height);
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      } else {
        this.canvas.width = this.width;
        this.canvas.height = this.height;
      }
    }
    this.svg.setAttribute("width", `${this.width}`);
    this.svg.setAttribute("height", `${this.height}`);
    this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
  }

  setVisible(showIt: boolean) {
    this.isVisible = showIt;
    this.container.classList.toggle("hidden", !showIt);
  }

  getLI(selector: string): HTMLLIElement {
    const mabel = this.container.querySelector(selector);
    if (!mabel) {
      throw new Error(`This chart container does not have an element with the class "${selector}".`);
    }
    return <HTMLLIElement>mabel;
  }

  setKneeIndex(count: number, kneeIndex:number) {
    this.traceData.setKneeIndex(count, kneeIndex);
  }


  handleTreeHighlight(treeIndex: number): void {
    this.traceData.handleTreeHighlight(treeIndex);
  }

  /* eslint-disable @typescript-eslint/no-empty-function */
  draw() {}
  /* eslint-enable @typescript-eslint/no-empty-function */

  drawField() {
    const {ctx, width, height} = this;
    /* draw background and borders for the charts */
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);
  }

}

