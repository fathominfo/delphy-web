import { KernelDensityEstimate } from "../../pythia/kde";
import { safeLabel, UNSET } from '../common';
import { calcEffectiveSampleSize } from "./effectivesamplesize";
import { log10, TraceCanvas, TICK_LENGTH, TRACE_MARGIN, BG_COLOR, BORDER_COLOR, BORDER_WEIGHT, HALF_BORDER, DIST_WIDTH } from "./tracecanvas";
import { hoverListenerType, kneeListenerType } from './runcommon';



const TRACE_WEIGHT = 1;
const TRACE_COLOR = 'rgb(45, 126, 207)';
const TRACE_COLOR_PRE_KNEE = 'rgb(150, 181, 212)';
const DOT_COLOR = 'rgb(52, 107, 190)';
const DOT_SIZE = 4;
const KNEE_LINE_COLOR = 'rgb(104,104,104)';
const MCC_DOT_COLOR = 'rgb(28, 189, 168)';
const DIST_BAR_COLOR = '#aaaaaa';
const MAX_STEP_SIZE = 3;

type BucketConfig = {
  buckets: number[],
  values: number[],
  positions: number[],
  maxBucketValue: number
};

const MIN_COUNT_FOR_HISTO = 10;
const MAX_COUNT_FOR_DISCRETE = 20;


export class HistCanvas extends TraceCanvas {



  hideBurnIn = false;
  data:number[] = []
  mccIndex: number = UNSET;
  sampleIndex: number = UNSET;
  sampleCount = 0;
  ess = 0;
  displayCount = 0;
  isDragging = false;
  readoutIndex: number = UNSET;

  bucketConfig: BucketConfig;
  kneeListener: kneeListenerType;
  hoverListener: hoverListenerType;


  constructor(label:string, unit='', kneeListener: kneeListenerType, hoverListener: hoverListenerType) {
    super(label, unit);
    this.kneeListener = kneeListener;
    this.hoverListener = hoverListener;
    this.bucketConfig = { buckets: [], maxBucketValue: 0, values : [], positions: []};
    this.canvas.addEventListener('pointerdown', event=>{
      this.canvas.classList.add('dragging');
      this.isDragging = true;
      this.handlePointerMove(event);
    });
    this.canvas.addEventListener('pointermove', event=>{
      this.handlePointerMove(event);
    });
    this.canvas.addEventListener('pointerup', ()=>{
      this.canvas.classList.remove('dragging');
      this.isDragging = false;
    });
    // const requestDraw = ()=>requestAnimationFrame(()=>this.draw());
    this.canvas.addEventListener('pointerover', ()=>{
      // this.hovering = true;
      // requestDraw();
    });
    this.canvas.addEventListener('pointerleave', ()=>{
      // this.hovering = false;

      // requestDraw();
      this.hoverListener(this.data.length - 1);
    });

  }

  setState(isSettingKnee:boolean): void {
    this.settingKnee = isSettingKnee;
  }

  getTreePercentAtX(event:PointerEvent) {
    let pct = UNSET;
    const x = event.offsetX - TICK_LENGTH;
    if (x >= 0) {
      pct = x / this.traceWidth;
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
    }
    return pct;
  }

  getTreeAtX(event:PointerEvent) {
    const pct = this.getTreePercentAtX(event);
    let index = Math.floor(pct * this.data.length);
    if (!Number.isFinite(this.data[index])) {
      index = UNSET;
    }
    return index;
  }


  handlePointerMove(event:PointerEvent) : void {
    if (this.isDragging) {
      const pct = this.getTreePercentAtX(event);
      if (pct <= 1) {
        this.kneeListener(pct);
      }
    } else {
      const treeIndex = this.getTreeAtX(event);
      this.hoverListener(treeIndex);
    }
  }

  handleTreeHighlight(treeIndex: number): void {
    const { data, readout, unit } = this;
    const readoutIndex = treeIndex === UNSET ? data.length - 1: treeIndex;
    this.readoutIndex = readoutIndex;
    readout.innerHTML = `${safeLabel(data[readoutIndex])} ${unit}`;

  }


  setData(data:number[], kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    this.data = data;
    this.setMetadata(data.length, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    this.ess = calcEffectiveSampleSize(data.slice(kneeIndex));
    const shown = hideBurnIn && this.savedKneeIndex > 0 ? data.slice(this.savedKneeIndex) : data;
    const safe = shown.filter(n=>!isNaN(n) && isFinite(n));
    if (this.readoutIndex === UNSET) {
      this.readoutIndex = data.length - 1;
    }

    this.dataMin = Math.min(...safe);
    this.dataMax = Math.max(...safe);
    /* what scale is the range in? */
    const range = this.dataMax - this.dataMin;

    if (range === 0 || this.isDiscrete && range < MAX_COUNT_FOR_DISCRETE) {
      this.displayMin = this.dataMin;
      this.displayMax = this.dataMax;
    } else {
      const expRange = Math.floor(Math.log(range) / log10),
        mag = Math.pow(10, expRange),
        magPad = mag * 0.1;
      this.displayMin = Math.floor((this.dataMin - magPad) / mag) * mag;
      this.displayMax = Math.ceil((this.dataMax + magPad) / mag) * mag;
    }


    this.setBucketData();

    requestAnimationFrame(()=>this.canvas.classList.toggle('kneed', kneeIndex > 0));
  }


  setBucketData() {
    const {data } = this,
      kneeIndex = this.currentKneeIndex;
    if (data.length > 1) {
      let estimateData = kneeIndex > 0 ? data.slice(kneeIndex) : data.slice(0);
      estimateData = estimateData.filter(n=>isFinite(n) && !isNaN(n));
      if (estimateData.length >= MIN_COUNT_FOR_HISTO) {
        const histoMinVal = Math.min(...estimateData);
        const histoMaxVal = Math.max(...estimateData);
        const histoRange = histoMaxVal - histoMinVal;
        if (this.isDiscrete && histoRange < 20) {
          this.bucketConfig = this.getDiscreteHistoData(estimateData, histoRange, histoMinVal);
        } else {
          this.bucketConfig = this.getKDEHistoData(estimateData);
        }
      }
    }
  }

  getDiscreteHistoData(estimateData: number[], valRange: number, displayMin: number) : BucketConfig {
    const buckets: number[] = Array(valRange + 1).fill(0);
    estimateData.forEach(n=>buckets[n-displayMin]++);
    const values = buckets.map((_n, i)=>i+displayMin);
    const maxBucketValue = Math.max(...buckets);
    return {buckets, values, maxBucketValue, positions: [] };
  }

  getKDEHistoData(estimateData: number[]) : BucketConfig {
    const kde:KernelDensityEstimate = new KernelDensityEstimate(estimateData),
      buckets: number[] = [],
      values: number[] = [],
      min = kde.min_sample,
      max = kde.max_sample,
      bandwidth = kde.bandwidth,
      limit = max - bandwidth / 2;
    let n = min + bandwidth / 2,
      maxBucketValue = 0;
    while (n <= limit && bandwidth > 0) {
      const gaust = kde.value_at(n);
      values.push(n);
      buckets.push(gaust);
      maxBucketValue = Math.max(maxBucketValue, gaust);
      n += bandwidth;
    }
    return {buckets, values, maxBucketValue, positions: [] };
  }




  setMetadata(count: number, kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    super.setKneeIndex(count, kneeIndex);
    this.mccIndex = mccIndex;
    this.hideBurnIn = hideBurnIn;
    this.sampleIndex = sampleIndex;
    this.displayCount = this.hideBurnIn && this.savedKneeIndex > 0 ? this.count - this.savedKneeIndex : this.count;
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
    this.drawHistogram();
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
      const {displayMin, displayMax} = this;
      const valRange = displayMax - displayMin;

      if (this.isDiscrete && valRange < MAX_COUNT_FOR_DISCRETE) {
        const bucketSize = chartHeight / (valRange + 1);
        top = bucketSize * 0.5;
        chartHeight -= bucketSize;
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
          // mccX = UNSET,
          // mccY = UNSET,
          hoverX = UNSET,
          hoverY = UNSET,
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
            // if (i === mccIndex) {
            //   mccX = x;
            //   mccY = y;
            // } else
            if (i === sampleIndex || sampleIndex === UNSET) {
              sampleX = x;
              sampleY = y;
            }
            if (i === this.readoutIndex) {
              hoverX = x;
              hoverY = y;
            }
          }
        }
        ctx.stroke();
        // ctx.fillStyle = DOT_COLOR;
        // ctx.beginPath();
        // ctx.arc(sampleX, sampleY, 2, 0, Math.PI * 2);
        // ctx.fill();
        // if (this.hovering && mccIndex>UNSET) {
        //   ctx.fillStyle = MCC_DOT_COLOR;
        //   ctx.beginPath();
        //   ctx.arc(mccX, mccY, DOT_SIZE, 0, Math.PI * 2);
        //   ctx.fill();
        // }
        if (hoverX !== UNSET) {
          ctx.fillStyle = DOT_COLOR;
          ctx.beginPath();
          ctx.arc(hoverX, hoverY, DOT_SIZE, 0, Math.PI * 2);
          ctx.fill();
        }

      }
    }
  }


  drawHistogram() {
    const { ctx, distLeft, bucketConfig, displayMax, displayMin } = this;
    const { buckets, values, maxBucketValue, positions } = bucketConfig;
    const valRange = displayMax - displayMin + 1;
    let { chartHeight } = this;
    let top = 0;
    /* draw background and borders for the charts */
    ctx.fillStyle = BG_COLOR;
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = BORDER_WEIGHT;
    ctx.fillRect(distLeft, 0, DIST_WIDTH, chartHeight);
    ctx.strokeRect(distLeft+HALF_BORDER, HALF_BORDER, DIST_WIDTH-1, chartHeight-1);

    /*
    since burnin might be visible, and the histogram does not include burn-in values,
    we need to calculate how much room the histogram takes.
    */
    const firstValue = values[0];
    const lastValue = values[values.length-1];
    const histoValueRange = lastValue - firstValue + 1;
    const histoSize = histoValueRange / valRange * chartHeight;
    let bucketSize = histoSize / buckets.length;


    // if (this.className === 'mutation-rate-μ') {
    //   console.log(`         ${this.className}`);
    // }

    if (this.label === "Number of Mutations") {
      console.log( `   `, this.label);
    }


    if (this.isDiscrete && histoValueRange < MAX_COUNT_FOR_DISCRETE) {
      bucketSize = chartHeight / (valRange + 1);
      top = bucketSize * 0.5;
      chartHeight -= bucketSize;
    }
    ctx.fillStyle = DIST_BAR_COLOR;
    buckets.forEach((n, i)=>{
      const value = values[i];
      const size = n / maxBucketValue * DIST_WIDTH;
      /*
      we go from low values at the bottom to higher at the top
      which also accounts for the negative height
      */
      const y = (1 - (value - displayMin) / valRange) * chartHeight + top;
      ctx.fillRect(distLeft, y, size, - bucketSize);
      positions[i] = y;
      if (i === 0 || i === buckets.length - 1) {
        ctx.fillStyle = 'black';
        ctx.textBaseline = i === 0 ? "top" : "bottom";
        ctx.fillText(`${value}`, distLeft, i === 0 ? y : y - bucketSize);
        ctx.fillStyle = DIST_BAR_COLOR;
      }
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
      const label = safeLabel(data[this.readoutIndex]) || ' ';
      this.readout.innerHTML = `${label} ${this.unit}`;

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

