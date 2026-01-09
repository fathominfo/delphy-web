import { resizeCanvas, UNSET } from '../common';

const maybeChartContainer = document.querySelector('#runner--panel--modules');
if (!maybeChartContainer) {
  throw new Error("index.html doesn't have the container for the charts!");
}

export const chartContainer = <HTMLDivElement> maybeChartContainer;

const maybeTemplate = chartContainer.querySelector('.module');
if (!maybeTemplate) {
  throw new Error("index.html doesn't have a template for the charts!");
}
const template = <HTMLDivElement> maybeTemplate;
template.remove();


export const DIST_WIDTH = 0;
export const TRACE_MARGIN = 0;
export const BG_COLOR = '#f5f5f5';
export const BORDER_COLOR = '#cbcbcb';
export const BORDER_WEIGHT = 0;
export const TICK_LENGTH = 0;

export const log10 = Math.log(10);


export const HALF_BORDER = BORDER_WEIGHT / 2;




export class TraceCanvas {



  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  container: HTMLDivElement;
  // maxLabel: HTMLLIElement;
  // minLabel: HTMLLIElement;
  // avgLabel: HTMLLIElement;
  // firstStepLabel: HTMLLIElement;
  // midStepLabel: HTMLLIElement;
  // lastStepLabel: HTMLLIElement;
  readout: HTMLParagraphElement;
  isDiscrete: boolean;
  className: string;


  sampleIndex: number;
  sampleCount: number;


  displayMin: number;
  displayMax: number;
  dataMin: number;
  dataMax: number;

  label:string;
  unit:string;
  height: number;
  width: number;
  traceWidth: number;
  distLeft: number;
  chartHeight: number;
  count: number;
  hovering: boolean;

  isVisible: boolean;

  /*
  distinguish between the knee index
  that is used as the leftmost sample when we are
  hiding the burn in period, vs. the knee index that
  we highlight
  */
  savedKneeIndex: number;
  currentKneeIndex: number;
  settingKnee: boolean;


  constructor(label:string, unit='') {
    this.label = label;
    this.unit = unit;
    this.container = <HTMLDivElement>template.cloneNode(true);
    this.className = label.toLowerCase().replace(/ /g, '-').replace(/[()]/g, '');
    this.container.classList.add(this.className);
    // const moduleGroup = getModuleGroupContainer();
    // moduleGroup.appendChild(this.container);
    chartContainer.appendChild(this.container);
    const header = this.container.querySelector('h3.title') as HTMLHeadingElement;
    header.textContent = label;
    this.canvas = this.container.querySelector('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    // this.maxLabel = this.getLI('.max');
    // this.minLabel = this.getLI('.min');
    // this.avgLabel = this.getLI('.median');
    // this.firstStepLabel = this.getLI('.step-first');
    // this.midStepLabel = this.getLI('.step-mid');
    // this.lastStepLabel = this.getLI('.step-last');
    this.readout = this.container.querySelector(".block-readout") as HTMLParagraphElement;
    this.sampleCount = UNSET;
    this.displayMin = UNSET;
    this.displayMax = UNSET;
    this.dataMin = UNSET;
    this.dataMax = UNSET;

    this.isDiscrete = false;

    this.height = UNSET;
    this.width = UNSET;
    this.traceWidth = UNSET;
    this.distLeft = UNSET;
    this.chartHeight = UNSET;
    this.sampleIndex = UNSET;
    this.count = 0;
    this.savedKneeIndex = UNSET;
    this.currentKneeIndex = UNSET;
    this.settingKnee = false;
    this.hovering = false;
    this.isVisible = true;
  }

  sizeCanvas() {
    // hack to get the right height in the flex container:
    // set width and height to zero, then recalculate
    this.canvas.width = 0;
    this.canvas.height = 0;

    const {width, height} = resizeCanvas(this.canvas);
    this.width = width;
    this.height = height;
    this.distLeft = this.width - DIST_WIDTH;
    this.traceWidth = this.distLeft - TRACE_MARGIN - TICK_LENGTH;
    this.chartHeight = this.height - TICK_LENGTH;
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
    this.currentKneeIndex = kneeIndex;
    this.count = count;
    this.sampleCount = count - kneeIndex;
    if (!this.settingKnee) {
      this.savedKneeIndex = kneeIndex;
    }
  }

  draw() {} // eslint-disable-line @typescript-eslint/no-empty-function

  drawField() {
    const {ctx, traceWidth, chartHeight} = this;
    /* draw background and borders for the charts */
    ctx.fillStyle = BG_COLOR;
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = BORDER_WEIGHT;
    ctx.fillRect(TICK_LENGTH, 0, traceWidth, chartHeight);
    ctx.strokeRect(TICK_LENGTH + HALF_BORDER, HALF_BORDER, traceWidth-1, chartHeight-1);
  }

}

