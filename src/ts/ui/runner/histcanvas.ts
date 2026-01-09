import { KernelDensityEstimate } from "../../pythia/kde";
import { safeLabel, UNSET } from '../common';
import { TraceCanvas, TICK_LENGTH, TRACE_MARGIN, BG_COLOR, BORDER_COLOR, BORDER_WEIGHT, HALF_BORDER, DIST_WIDTH } from "./tracecanvas";
import { kneeHoverListenerType } from './runcommon';
import { HistData } from "./histdata";



const TRACE_WEIGHT = 1;
const TRACE_COLOR = 'rgb(45, 126, 207)';
const TRACE_COLOR_PRE_KNEE = 'rgb(150, 181, 212)';
const DOT_COLOR = 'rgb(52, 107, 190)';
const DOT_SIZE = 4;
const KNEE_LINE_COLOR = 'rgb(104,104,104)';
const MCC_DOT_COLOR = 'rgb(28, 189, 168)';
const DIST_BAR_COLOR = '#aaaaaa';
const MAX_STEP_SIZE = 3;




export class HistCanvas extends TraceCanvas {



  hideBurnIn: boolean;
  kneeListener: kneeHoverListenerType;


  constructor(label:string, unit='', kneeListener: kneeHoverListenerType) {
    super(label, unit);
    this.traceData = new HistData(label, unit)
    this.kneeListener = kneeListener;
    this.height = UNSET;
    this.width = UNSET;
    this.traceWidth = UNSET;
    this.distLeft = UNSET;
    this.chartHeight = UNSET;
    this.hideBurnIn = false;
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

  setState(isSettingKnee:boolean): void {
    this.traceData.settingKnee = isSettingKnee;
  }




  handleMouseDown(event:PointerEvent) : void {
    this.canvas.classList.add('dragging');
    // this.stateListeners.forEach(fnc=>fnc(true));
    const moveHandler = (event:PointerEvent)=>{
      const x = event.offsetX - TICK_LENGTH;
      const count = this.traceData.count;
      let pct = x /  this.traceWidth;
      // console.log('knee', x, pct)
      if (count * MAX_STEP_SIZE < this.traceWidth) {
        pct = x / (count * MAX_STEP_SIZE);
      }
      if (this.hideBurnIn) {
        /*
        rescale the pct from just the visible trees
        to all the trees.

        the visible trees are what percent of all the trees?
        */
        const totalCount = this.traceData.savedKneeIndex + count,
          totalIndex = this.traceData.savedKneeIndex + Math.round(pct * count);
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
    (this.traceData as HistData).setData(data, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    requestAnimationFrame(()=>this.canvas.classList.toggle('kneed', kneeIndex > 0));
  }

  setMetadata(count: number, kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    super.setKneeIndex(count, kneeIndex);
    (this.traceData as HistData).setMetadata(count, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
  }

  draw() {
    let {data, mccIndex, sampleIndex, hideBurnIn,
      currentKneeIndex: kneeIndex, savedKneeIndex } = this.traceData as HistData;
    if (hideBurnIn && savedKneeIndex > 0) {
      data = data.slice(savedKneeIndex);
      kneeIndex -= savedKneeIndex;
      mccIndex -= savedKneeIndex;
      sampleIndex -= savedKneeIndex;
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

    const {displayCount} = this.traceData as HistData;
    const {ctx, traceWidth} = this;
    let chartHeight = this.chartHeight,
      top = 0;

    this.drawField();

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
      const {displayMin, displayMax, isDiscrete} = this.traceData;
      const valRange = displayMax - displayMin;

      if (isDiscrete && valRange < 20) {
        const h = chartHeight / (valRange + 1);
        top = h * 0.5;
        chartHeight -= h;
      }


      const stepW = Math.min(MAX_STEP_SIZE, traceWidth / displayCount || 1);
      const burnInX = TICK_LENGTH + kneeIndex * stepW;


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
            if (this.traceData.isDiscrete) {
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
      const {displayMin, displayMax, isDiscrete} = this.traceData as HistData;
      const valRange = displayMax - displayMin;
      let estimateData = kneeIndex > 0 ? data.slice(kneeIndex) : data.slice(0);
      estimateData = estimateData.filter(n=>isFinite(n) && !isNaN(n));
      if (estimateData.length >= 10) {
        if (isDiscrete && valRange < 20) {
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
    this.traceData.count = count;
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
      const {displayMin, displayMax} = this.traceData;
      // this.readout.innerHTML = `${safeLabel(data[data.length - 1])} ${this.traceData.unit}`;

      ctx.strokeStyle = TRACE_COLOR;
      if (displayMax === displayMin) {
        ctx.strokeStyle = TRACE_COLOR;
        ctx.moveTo(TICK_LENGTH, chartHeight * 0.5);
        ctx.lineTo(TICK_LENGTH + traceWidth, chartHeight * 0.5);
        ctx.stroke();
        // this.maxLabel.innerHTML = ``;
        // this.minLabel.innerHTML = ``;
        // this.avgLabel.innerHTML = `${safeLabel(displayMax)}`;
      } else {

        ctx.strokeStyle = BORDER_COLOR;
        ctx.lineWidth = BORDER_WEIGHT;
        ctx.beginPath();
        ctx.moveTo(0, BORDER_WEIGHT * 0.5);
        ctx.lineTo(TICK_LENGTH, BORDER_WEIGHT * 0.5);

        const midVal = (displayMin + displayMax) / 2;
        // this.maxLabel.innerHTML = `${safeLabel(displayMax)}`;
        // this.minLabel.innerHTML = `${safeLabel(displayMin)}`;
        let skipMiddle = false;
        if (this.traceData.isDiscrete && displayMax - displayMin < 20 && midVal !== Math.floor(midVal)) {
          skipMiddle = true;
        } else if (safeLabel(displayMax) === safeLabel(midVal)) skipMiddle = true;
        else if (safeLabel(displayMin) === safeLabel(midVal)) skipMiddle = true;
        if (skipMiddle) {
          // this.avgLabel.innerHTML = '';
        } else {
          // this.avgLabel.innerHTML = `${safeLabel(midVal)}`;
          ctx.moveTo(0, chartHeight/2);
          ctx.lineTo(TICK_LENGTH, chartHeight/2);
        }
        ctx.moveTo(0, chartHeight - BORDER_WEIGHT * 0.5);
        ctx.lineTo(TICK_LENGTH, chartHeight - BORDER_WEIGHT * 0.5);
        ctx.stroke();
      }
      // this.firstStepLabel.innerHTML = '';
      // this.midStepLabel.innerHTML = ``;
      // this.lastStepLabel.innerHTML = '';
    } else {
      // this.readout.innerHTML = `0 ${this.unit}`;
    }
    this.canvas.classList.toggle('kneed', kneeIndex > 0);
    // ctx.fillStyle = 'black';
    // const label = `ESS: ${  this.ess.toLocaleString(undefined, {maximumFractionDigits: 2, minimumFractionDigits: 2})}`;
    // ctx.fillText(label, this.distLeft - 70, chartHeight - 2);
  }




}

