import { resizeCanvas, UNSET } from '../common';

const maybeChartContainer = document.querySelector('#runner--panel--blocks');
if (!maybeChartContainer) {
  throw new Error("index.html doesn't have the container for the charts!");
}

export const chartContainer = <HTMLDivElement> maybeChartContainer;
const maybeTemplate = chartContainer.querySelector('.block');
if (!maybeTemplate) {
  throw new Error("index.html doesn't have a template for the charts!");
}
const template = <HTMLDivElement> maybeTemplate;
template.remove();


export const DIST_WIDTH = 35;
export const TRACE_MARGIN = 10;
export const BG_COLOR = '#f5f5f5';
export const BORDER_COLOR = '#cbcbcb';
export const BORDER_WEIGHT = 1;
export const TICK_LENGTH = 10;

export const log10 = Math.log(10);


export const HALF_BORDER = BORDER_WEIGHT / 2;



export class TraceCanvas {



  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  container: HTMLDivElement;
  maxLabel: HTMLLIElement;
  minLabel: HTMLLIElement;
  avgLabel: HTMLLIElement;
  firstStepLabel: HTMLLIElement;
  midStepLabel: HTMLLIElement;
  lastStepLabel: HTMLLIElement;
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
    chartContainer.appendChild(this.container);
    const maybeHeader = this.container.querySelector('h1');
    if (maybeHeader) {
      (<HTMLElement>maybeHeader).innerHTML = label;
    }
    const maybe_canvas = this.container.querySelector('canvas');
    if (maybe_canvas === null) {
      throw new Error("UI canvas not found");
    }
    if (!(maybe_canvas instanceof HTMLCanvasElement)) {
      throw new Error("UI canvas is not a canvas");
    }
    this.canvas = maybe_canvas;
    const maybe_ctx = this.canvas.getContext("2d");
    if (maybe_ctx === null) {
      throw new Error('This browser does not support 2-dimensional canvas rendering contexts.');
    }
    const maybeReadout = this.container.querySelector(".block-readout") as HTMLParagraphElement;
    if (!maybeReadout) {
      throw new Error(`This chart container does not have an element with the class ".block-readout".`);
    }
    this.ctx = maybe_ctx;
    this.ctx.font = 'MDSystem, Roboto, sans-serif';
    this.maxLabel = this.getLI('.max');
    this.minLabel = this.getLI('.min');
    this.avgLabel = this.getLI('.median');
    this.firstStepLabel = this.getLI('.step-first');
    this.midStepLabel = this.getLI('.step-mid');
    this.lastStepLabel = this.getLI('.step-last');
    this.readout = maybeReadout;
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

  /* eslint-disable @typescript-eslint/no-unused-vars */
  /* eslint-disable @typescript-eslint/no-empty-function */
  handleTreeHighlight(treeIndex: number): void {}

  draw() {}
  /* eslint-enable @typescript-eslint/no-empty-function */
  /* eslint-enable @typescript-eslint/no-unused-vars */


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

