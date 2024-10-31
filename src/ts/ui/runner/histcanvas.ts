import { KernelDensityEstimate } from "../../pythia/kde";
import { safeLabel, resizeCanvas, UNSET } from '../common';
import { calcEffectiveSampleSize } from "./effectivesamplesize";
import { kneeListenerType } from './runcommon';

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



const TRACE_MARGIN = 10;
export const DIST_WIDTH = 35;

const BG_COLOR = '#f5f5f5';
const BORDER_COLOR = '#cbcbcb';
const BORDER_WEIGHT = 1;
const TRACE_WEIGHT = 1;
const TRACE_COLOR = 'rgb(45, 126, 207)';
const TRACE_COLOR_PRE_KNEE = 'rgb(150, 181, 212)';
const DOT_COLOR = 'rgb(52, 107, 190)';
const DOT_SIZE = 4;
const KNEE_LINE_COLOR = 'rgb(104,104,104)';
const MCC_DOT_COLOR = 'rgb(28, 189, 168)';
const DIST_BAR_COLOR = '#aaaaaa';
const TICK_LENGTH = 10;
const MAX_STEP_SIZE = 3;

const log10 = Math.log(10);


const HALF_BORDER = BORDER_WEIGHT / 2;



export class HistCanvas {



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
  hideBurnIn: boolean;
  isDiscrete: boolean;
  className: string;


  data:number[];
  mccIndex: number;
  sampleIndex: number;
  sampleCount: number;
  ess: number;


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
  displayCount: number;
  /*
  distinguish between the knee index
  that is used as the leftmost sample when we are
  hiding the burn in period, vs. the knee index that
  we highlight
  */
  savedKneeIndex: number;
  currentKneeIndex: number;
  settingKnee: boolean;
  hovering: boolean;

  kneeListener: kneeListenerType;

  isVisible: boolean;



  constructor(label:string, unit='', kneeListener: kneeListenerType) {
    this.label = label;
    this.unit = unit;
    this.kneeListener = kneeListener;
    this.container = <HTMLDivElement>template.cloneNode(true);
    this.className = label.toLowerCase().replace(/ /g, '-');
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
    this.data = [];
    this.ess = UNSET;
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
    this.mccIndex = UNSET;
    this.sampleIndex = UNSET;
    this.count = 0;
    this.displayCount = 0;
    this.savedKneeIndex = UNSET;
    this.currentKneeIndex = UNSET;
    this.settingKnee = false;
    this.hideBurnIn = false;
    this.hovering = false;
    this.isVisible = true;
    this.canvas.addEventListener('pointerdown', event=>this.handleMouseDown(event));
    const requestDraw = ()=>requestAnimationFrame(()=>this.draw());
    this.canvas.addEventListener('pointerover', ()=>{
      this.hovering = true;
      requestDraw();
    });
    this.canvas.addEventListener('pointerleave', ()=>{
      this.hovering = false;
      requestDraw();
    });

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

  setState(isSettingKnee:boolean): void {
    this.settingKnee = isSettingKnee;
  }




  handleMouseDown(event:PointerEvent) : void {
    this.canvas.classList.add('dragging');
    // this.stateListeners.forEach(fnc=>fnc(true));
    const moveHandler = (event:PointerEvent)=>{
      const x = event.offsetX - TICK_LENGTH;
      let pct = x /  this.traceWidth;
      // console.log('knee', x, pct)
      if (this.count * MAX_STEP_SIZE < this.traceWidth) {
        pct = x / (this.count * MAX_STEP_SIZE);
      }
      if (this.hideBurnIn) {
        /*
        rescale the pct from just the visible trees
        to all the trees.

        the visible trees are what percent of all the trees?
        */
        const totalCount = this.savedKneeIndex + this.count,
          totalIndex = this.savedKneeIndex + Math.round(pct * this.count);
        pct = totalIndex / totalCount;
      }
      if (pct <= 1) {
        this.kneeListener(pct);
      }
    }
    moveHandler(event);
    const remover = ()=>{
      this.canvas.removeEventListener('pointermove', moveHandler);
      this.canvas.removeEventListener('pointerup', remover);
      this.canvas.classList.remove('dragging');
      // this.stateListeners.forEach(fnc=>fnc(false));
    };
    this.canvas.addEventListener('pointermove', moveHandler);
    this.canvas.addEventListener('pointerup', remover);
  }


  setData(data:number[], kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    this.data = data;
    this.mccIndex = mccIndex;
    this.hideBurnIn = hideBurnIn;
    this.currentKneeIndex = kneeIndex;
    this.sampleIndex = sampleIndex;
    this.count = data.length;
    this.displayCount = this.hideBurnIn && this.savedKneeIndex > 0 ? this.count - this.savedKneeIndex : this.count;
    this.sampleCount = data.length - kneeIndex;
    this.ess = calcEffectiveSampleSize(data.slice(kneeIndex));

    if (!this.settingKnee) {
      this.savedKneeIndex = kneeIndex;
    }
    const shown = hideBurnIn && this.savedKneeIndex > 0 ? data.slice(this.savedKneeIndex) : data;
    const safe = shown.filter(n=>!isNaN(n) && isFinite(n));

    this.dataMin = Math.min(...safe);
    this.dataMax = Math.max(...safe);
    /* what scale is the range in? */
    const range = this.dataMax - this.dataMin;

    if (range === 0 || this.isDiscrete && range < 20) {
      this.displayMin = this.dataMin;
      this.displayMax = this.dataMax;
    } else {
      const expRange = Math.floor(Math.log(range) / log10),
        mag = Math.pow(10, expRange),
        magPad = mag * 0.1;
      this.displayMin = Math.floor((this.dataMin - magPad) / mag) * mag;
      this.displayMax = Math.ceil((this.dataMax + magPad) / mag) * mag;
    }

    requestAnimationFrame(()=>this.canvas.classList.toggle('kneed', kneeIndex > 0));
  }

  draw() {
    let {data, mccIndex, sampleIndex} = this,
      kneeIndex = this.currentKneeIndex;
    if (this.hideBurnIn && this.savedKneeIndex > 0) {
      data = data.slice(this.savedKneeIndex);
      kneeIndex -= this.savedKneeIndex;
      mccIndex -= this.savedKneeIndex;
      sampleIndex -= this.savedKneeIndex;
    }
    const {ctx, width, height} = this;
    ctx.clearRect(0, 0, width + 1, height + 1);
    this.drawSeries(data, kneeIndex, mccIndex, sampleIndex);
    this.drawHistogram(data, kneeIndex);
    this.drawLabels(data, kneeIndex);
  }

  drawSeries(data:number[], kneeIndex:number, mccIndex:number, sampleIndex: number) {
    // if (this.label === "Mutation Rate μ") {
    //   console.log( `   `, this.label, kneeIndex, ess)
    // }

    const {displayCount} = this;
    const {ctx, traceWidth} = this;
    let chartHeight = this.chartHeight,
      top = 0;

    /* draw background and borders for the charts */
    ctx.fillStyle = BG_COLOR;
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = BORDER_WEIGHT;
    ctx.fillRect(TICK_LENGTH, 0, traceWidth, chartHeight);

    ctx.strokeRect(TICK_LENGTH + HALF_BORDER, HALF_BORDER, traceWidth-1, chartHeight-1);


    /*
    as we get more and more data, the time series gets more compact,
    and the lines acquire a density that is fairly ugly. So we try
    to counter that by getting a lighter line weight as we get more data.
    */
    ctx.beginPath();
    ctx.lineWidth = TRACE_WEIGHT * Math.min(1, Math.sqrt(traceWidth / data.length));
    if (data.length === 1) {
      ctx.strokeStyle = TRACE_COLOR;
      ctx.moveTo(0, chartHeight * 0.5);
      ctx.lineTo(3, chartHeight * 0.5);
      ctx.stroke();
    } else if (data.length > 1) {
      const {displayMin, displayMax} = this;
      const valRange = displayMax - displayMin;

      if (this.isDiscrete && valRange < 20) {
        const h = chartHeight / (valRange + 1);
        top = h * 0.5;
        chartHeight -= h;
      }


      const stepW = Math.min(MAX_STEP_SIZE, traceWidth / displayCount || 1);
      const burnInX = TICK_LENGTH + kneeIndex * stepW;
      // this.drawEssIntervals(stepW, burnInX);

      ctx.strokeStyle = TRACE_COLOR;
      if (displayMax === displayMin) {
        // console.log(displayMax);
        ctx.strokeStyle = TRACE_COLOR;
        ctx.beginPath();
        ctx.moveTo(TICK_LENGTH, chartHeight * 0.5);
        ctx.lineTo(TICK_LENGTH + traceWidth, chartHeight * 0.5);
        ctx.stroke();
      } else {
        const verticalScale = chartHeight / (valRange || 1);
        // find the middlemost step
        let n = data[0],
          x = 0,
          y = 0,
          mccX = UNSET,
          mccY = UNSET,
          sampleX = UNSET,
          sampleY = UNSET;
        if (kneeIndex > 0) {
          ctx.strokeStyle = KNEE_LINE_COLOR;
          x = burnInX;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, chartHeight);
          ctx.stroke();
          ctx.strokeStyle = TRACE_COLOR_PRE_KNEE;
        }
        ctx.beginPath();
        x = TICK_LENGTH;
        if (isNaN(n) || !isFinite(n)) {
          ctx.moveTo(x, chartHeight);
        } else {
          ctx.moveTo(x, chartHeight-(n-displayMin) * verticalScale);
        }
        for (let i = 1; i < data.length; i++) {
          n = data[i];
          if (!isNaN(n) && isFinite(n)) {
            y = top + chartHeight -(n-displayMin) * verticalScale;
            if (this.isDiscrete) {
              ctx.lineTo(x, y);
            }
            x = TICK_LENGTH + i * stepW;
            ctx.lineTo(x, y);
            if (i === kneeIndex) {
              ctx.stroke();
              ctx.strokeStyle = TRACE_COLOR
              ctx.beginPath();
              ctx.moveTo(x, y);
            }
            if (i === mccIndex) {
              mccX = x;
              mccY = y;
            } else if (i === sampleIndex || sampleIndex === UNSET) {
              sampleX = x;
              sampleY = y;
            }
          }
        }
        ctx.stroke();
        ctx.fillStyle = DOT_COLOR;
        ctx.beginPath();
        ctx.arc(sampleX, sampleY, 2, 0, Math.PI * 2);
        ctx.fill();
        if (this.hovering && mccIndex>UNSET) {
          ctx.fillStyle = MCC_DOT_COLOR;
          ctx.beginPath();
          ctx.arc(mccX, mccY, DOT_SIZE, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }




  drawHistogram(data:number[], kneeIndex:number) {
    const {ctx, distLeft, chartHeight} = this;


    /* draw background and borders for the charts */
    ctx.fillStyle = BG_COLOR;
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = BORDER_WEIGHT;
    ctx.fillRect(distLeft, 0, DIST_WIDTH, chartHeight);
    ctx.strokeRect(distLeft+HALF_BORDER, HALF_BORDER, DIST_WIDTH-1, chartHeight-1);

    if (data.length > 1) {
      const {displayMin, displayMax} = this;
      const valRange = displayMax - displayMin;
      let estimateData = kneeIndex > 0 ? data.slice(kneeIndex) : data.slice(0);
      estimateData = estimateData.filter(n=>isFinite(n) && !isNaN(n));
      if (estimateData.length >= 10) {
        if (this.isDiscrete && valRange < 20) {
          this.drawDiscreteHistogram(estimateData, valRange, displayMin, chartHeight, distLeft, ctx);
        } else {
          this.drawKDE(estimateData, valRange, displayMin, chartHeight, distLeft, ctx);
        }
      }
    }
  }

  drawDiscreteHistogram(estimateData: number[], valRange: number, displayMin: number, chartHeight: number, distLeft: number, ctx: CanvasRenderingContext2D) : void {
    const buckets: number[] = Array(valRange + 1).fill(0),
      h = chartHeight / (valRange + 1);
    estimateData.forEach(n=>buckets[n-displayMin]++);
    const bandMax = Math.max(...buckets);
    let y = chartHeight - h;
    ctx.fillStyle = DIST_BAR_COLOR;
    buckets.forEach((n)=>{
      const x = n / bandMax * DIST_WIDTH;
      ctx.fillRect(distLeft, y, x, h);
      y -= h;
    })
  }


  drawKDE(estimateData: number[], valRange: number, minVal: number, chartHeight: number, distLeft: number, ctx: CanvasRenderingContext2D) : void {
    const kde:KernelDensityEstimate = new KernelDensityEstimate(estimateData),
      bands = [],
      min = kde.min_sample,
      max = kde.max_sample,
      bandwidth = kde.bandwidth,
      limit = max - bandwidth / 2,
      h = bandwidth / valRange * chartHeight;
    let n = min + bandwidth / 2,
      y = (1 - (min - minVal) / valRange) * chartHeight - h,
      bandMax = 0;
    while (n <= limit && bandwidth > 0) {
      const gaust = kde.value_at(n);
      bands.push(gaust);
      bandMax = Math.max(bandMax, gaust);
      n += bandwidth;
    }
    ctx.fillStyle = DIST_BAR_COLOR;
    bands.forEach(n=>{
      const x = n / bandMax * DIST_WIDTH;
      ctx.fillRect(distLeft, y, x, h);
      y -= h;
    });
  }




  drawLabels(data:number[], kneeIndex:number) {
    const count:number = data.length;
    this.count = count;
    const {ctx, traceWidth, chartHeight} = this;


    /* draw background and borders for the charts */
    ctx.fillStyle = BG_COLOR;


    /*
    as we get more and more data, the time series gets more compact,
    and the lines acquire a density that is fairly ugly. So we try
    to counter that by getting a lighter line weight as we get more data.
    */
    ctx.beginPath();
    if (data.length > 1) {
      const {displayMin, displayMax} = this;
      this.readout.innerHTML = `${safeLabel(data[data.length - 1])} ${this.unit}`;

      ctx.strokeStyle = TRACE_COLOR;
      if (displayMax === displayMin) {
        ctx.strokeStyle = TRACE_COLOR;
        ctx.moveTo(TICK_LENGTH, chartHeight * 0.5);
        ctx.lineTo(TICK_LENGTH + traceWidth, chartHeight * 0.5);
        ctx.stroke();
        this.maxLabel.innerHTML = ``;
        this.minLabel.innerHTML = ``;
        this.avgLabel.innerHTML = `${safeLabel(displayMax)}`;
      } else {

        ctx.strokeStyle = BORDER_COLOR;
        ctx.lineWidth = BORDER_WEIGHT;
        ctx.beginPath();
        ctx.moveTo(0, BORDER_WEIGHT * 0.5);
        ctx.lineTo(TICK_LENGTH, BORDER_WEIGHT * 0.5);

        const midVal = (displayMin + displayMax) / 2;
        this.maxLabel.innerHTML = `${safeLabel(displayMax)}`;
        this.minLabel.innerHTML = `${safeLabel(displayMin)}`;
        let skipMiddle = false;
        if (this.isDiscrete && displayMax - displayMin < 20 && midVal !== Math.floor(midVal)) {
          skipMiddle = true;
        } else if (safeLabel(displayMax) === safeLabel(midVal)) skipMiddle = true;
        else if (safeLabel(displayMin) === safeLabel(midVal)) skipMiddle = true;
        if (skipMiddle) {
          this.avgLabel.innerHTML = '';
        } else {
          this.avgLabel.innerHTML = `${safeLabel(midVal)}`;
          ctx.moveTo(0, chartHeight/2);
          ctx.lineTo(TICK_LENGTH, chartHeight/2);
        }
        ctx.moveTo(0, chartHeight - BORDER_WEIGHT * 0.5);
        ctx.lineTo(TICK_LENGTH, chartHeight - BORDER_WEIGHT * 0.5);
        ctx.stroke();
      }
      this.firstStepLabel.innerHTML = '';
      this.midStepLabel.innerHTML = ``;
      this.lastStepLabel.innerHTML = '';
    } else {
      this.readout.innerHTML = `0 ${this.unit}`;
    }
    this.canvas.classList.toggle('kneed', kneeIndex > 0);
    // ctx.fillStyle = 'black';
    // const label = `ESS: ${  this.ess.toLocaleString(undefined, {maximumFractionDigits: 2, minimumFractionDigits: 2})}`;
    // ctx.fillText(label, this.distLeft - 70, chartHeight - 2);
  }


  drawEssIntervals(stepW: number, burnInX: number) {
    const {sampleCount, ess, ctx, distLeft, chartHeight} = this;
    const autoCorrelationTime = sampleCount / ess;
    const essWidth = stepW * autoCorrelationTime;
    const rightEdge = distLeft - TRACE_MARGIN;
    /*
    draw stripes of width essWidth from the start of the burn in
    */
    ctx.strokeStyle = '#ddd';
    ctx.beginPath();
    let essX = burnInX;
    while (essX < rightEdge && essWidth >=1) {
      ctx.moveTo(essX, 0);
      ctx.lineTo(essX, chartHeight);
      essX += essWidth;
    }
    ctx.stroke();
  }


}

// export const addHistHeader = (text: string)=>{
//   const sectionLabel = document.createElement("h1") as HTMLHeadingElement;
//   sectionLabel.innerHTML = text;
//   chartContainer.appendChild(sectionLabel);
// }

