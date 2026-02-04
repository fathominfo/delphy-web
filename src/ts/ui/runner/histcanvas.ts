import { KernelDensityEstimate } from "../../pythia/kde";
import { safeLabel, UNSET } from '../common';
import { TraceCanvas, TRACE_TEMPLATE } from "./tracecanvas";
import { kneeHoverListenerType } from './runcommon';
import { HistData, MAX_COUNT_FOR_DISCRETE } from "./histdata";


const MAX_STEP_SIZE = 3;

const BAR_TEMPLATE = TRACE_TEMPLATE.querySelector(".chart .histogram .bars .distribution rect") as SVGRectElement;
BAR_TEMPLATE.remove();




export class HistCanvas extends TraceCanvas {



  kneeListener: kneeHoverListenerType;
  histoSVG: SVGElement;
  histoWidth: number;
  histoHeight: number;
  histoBarParent: SVGGElement;


  constructor(label:string, unit='', kneeListener: kneeHoverListenerType) {
    super(label, unit);
    this.traceData = new HistData(label, unit)
    this.kneeListener = kneeListener;
    this.isVisible = true;

    this.histoSVG = this.container.querySelector(".histogram svg") as SVGElement;
    this.histoBarParent = this.histoSVG.querySelector(".distribution") as SVGGElement;
    this.histoWidth = UNSET;
    this.histoHeight = UNSET;
    // this.canvas.addEventListener('pointerdown', event=>this.handleMouseDown(event));
    // const requestDraw = ()=>requestAnimationFrame(()=>this.draw());
    // const requestDraw = ()=>this.drawSvg();
    // this.canvas.addEventListener('pointerover', ()=>{
    //   this.hovering = true;
    //   requestDraw();
    // });
    // this.canvas.addEventListener('pointerleave', ()=>{
    //   this.hovering = false;
    //   requestDraw();
    // });

  }

  sizeCanvas(): void {
    const wrapper = this.histoSVG.parentElement as HTMLDivElement;
    this.histoWidth = wrapper.offsetWidth;
    this.histoHeight = wrapper.offsetHeight;
    super.sizeCanvas();
  }

  protected setSizes() {
    super.setSizes();
    this.histoSVG.setAttribute("width", `${this.histoWidth}`);
    this.histoSVG.setAttribute("height", `${this.histoHeight}`);
    this.histoSVG.setAttribute("viewBox", `0 0 ${this.histoWidth} ${this.histoHeight}`);
    this.svg.querySelectorAll(".graph.display rect.period").forEach(rect=>{
      (rect as SVGRectElement).setAttribute("width", `${this.width}`);
    });

  }

  setState(isSettingKnee:boolean): void {
    this.traceData.settingKnee = isSettingKnee;
  }




  handleMouseDown(event:PointerEvent) : void {
    this.canvas.classList.add('dragging');
    // this.stateListeners.forEach(fnc=>fnc(true));
    const moveHandler = (event:PointerEvent)=>{
      const x = event.offsetX;
      const count = this.traceData.count;
      let pct = x /  this.width;
      // console.log('knee', x, pct)
      if (count * MAX_STEP_SIZE < this.width) {
        pct = x / (count * MAX_STEP_SIZE);
      }
      if ((this.traceData as HistData).hideBurnIn) {
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


  setData(sourceData:number[], kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    const histData = this.traceData as HistData;
    histData.setData(sourceData, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
    requestAnimationFrame(()=>this.canvas.classList.toggle('kneed', kneeIndex > 0));
  }



  setMetadata(count: number, kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    super.setKneeIndex(count, kneeIndex);
    (this.traceData as HistData).setMetadata(count, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
  }

  draw() {
    // let {data, mccIndex, sampleIndex, currentKneeIndex: kneeIndex } = this.traceData as HistData;
    // const {hideBurnIn, savedKneeIndex } = this.traceData as HistData;
    // if (hideBurnIn && savedKneeIndex > 0) {
    //   data = data.slice(savedKneeIndex);
    //   kneeIndex -= savedKneeIndex;
    //   mccIndex -= savedKneeIndex;
    //   sampleIndex -= savedKneeIndex;
    // }
    // const {ctx, width, height} = this;
    // ctx.clearRect(0, 0, width + 1, height + 1);
    // this.drawSeries(data, kneeIndex, mccIndex, sampleIndex);
    // this.drawHistogram(data, kneeIndex);
    // this.drawLabels(data, kneeIndex);
    this.drawTrace();
    this.drawHistogramSVG(0);
  }


  drawTrace() {
    const { data, displayCount, savedKneeIndex, hideBurnIn } = this.traceData as HistData;
    const { height } = this;
    const burnInContainer = this.svg.querySelector(".burn-in") as SVGGElement;
    const burnInField = burnInContainer.querySelector(".period") as SVGRectElement;
    const burnInTrend = burnInContainer.querySelector(".trend") as SVGPathElement;
    const activeContainer = this.svg.querySelector(".run") as SVGGElement;
    const activeField = activeContainer.querySelector(".period") as SVGRectElement;
    const activeInTrend = activeContainer.querySelector(".trend") as SVGPathElement;

    let width = this.width;

    let burnInHeight = 0;
    let activeHeight = height;

    let burnInPath = "";
    let activePath = "";

    if (displayCount === 0) {
      burnInHeight = 0;
      activeHeight = height;
    } else if (displayCount === 1) {
      activePath = `M${width * 0.5} 0 ${width * 0.5} 3`;
    } else if (displayCount > 1) {
      const { displayMin, displayMax, isDiscrete } = this.traceData;
      const valRange = displayMax - displayMin;
      let startIndex = 0;
      let left = 0;
      if (isDiscrete && valRange < MAX_COUNT_FOR_DISCRETE) {
        const bucketSize = width / (valRange + 1);
        left = bucketSize * 0.5;
        width -= bucketSize;
      }

      const stepSize = Math.min(MAX_STEP_SIZE, height / displayCount || 1);

      if (hideBurnIn) {
        startIndex = savedKneeIndex;
      } else {
        burnInHeight = savedKneeIndex * stepSize;
        activeHeight = height - burnInHeight;
      }


      if (displayMax === displayMin) {
        activePath = `M${width * 0.5} ${0} L${width * 0.5} ${burnInHeight} `;
        burnInPath = `M${width * 0.5} ${burnInHeight} L${width * 0.5} ${height * 0.5} `;
      } else {

        const dataScale = width / (valRange || 1);
        const bottom = Math.min(height, displayCount * stepSize);
        // console.log(bottom, height, displayCount * stepH);
        let currentPath = "";
        let first = true;
        let n: number,
          x: number = UNSET,
          y: number = UNSET,
          prevX = UNSET,
          prevY = UNSET;
        for (let i = startIndex; i < data.length; i++) {
          if (i === savedKneeIndex) {
            burnInPath = currentPath;
            currentPath = `M${prevX} ${prevY} L `;
          }
          n = data[i];
          y = bottom - (i - startIndex) * stepSize;
          if (isNaN(n) || !isFinite(n)) {
            x = left;
          } else {
            x = left + (n-displayMin) * dataScale;
          }
          if (first) {
            currentPath = `M${x} ${y} L`;
          } else {
            if (isDiscrete) {
              currentPath += `${prevX} ${y} `;
            }
            currentPath += `${x} ${y} `;
          }
          first = false;
          prevX = x;
          prevY = y;
        }
        activePath = currentPath;
      }
    }

    // requestAnimationFrame(()=>{
    burnInField.setAttribute("height", `${burnInHeight}`);
    burnInField.setAttribute("y", `${activeHeight}`);
    activeField.setAttribute("height", `${activeHeight}`);
    burnInTrend.setAttribute("d", burnInPath);
    activeInTrend.setAttribute("d", activePath);
    // });


    // this.drawSeries(data, kneeIndex, mccIndex, sampleIndex);
    // this.drawHistogram(data, kneeIndex);
    // this.drawLabels(data, kneeIndex);
  }


  drawHistogramSVG(highlightValue: number) {
    const { traceData, histoWidth, histoHeight } = this;
    const { bucketConfig, isDiscrete, displayMin, displayMax } = traceData as HistData;
    const { buckets, values, maxBucketValue, positions, step } = bucketConfig;
    let valRange = displayMax - displayMin;
    const left = 0;

    /*
    since burnin might be visible, and the histogram does not include burn-in values,
    we need to calculate how much room the histogram takes.
    */
    const firstValue = values[0];
    const lastValue = values[values.length-1] + step;
    const histoValueRange = lastValue - firstValue;
    const histoSize = histoValueRange / valRange * histoWidth;
    let bucketSize = histoSize / buckets.length;

    if (isDiscrete && histoValueRange < MAX_COUNT_FOR_DISCRETE) {
      valRange += step;
      bucketSize = histoWidth / (valRange);
    }

    this.histoBarParent.innerHTML = '';
    buckets.forEach((n, i)=>{
      const value = values[i];
      let nextValue = values[i + 1];
      if (nextValue === undefined) nextValue = value + step;
      const size = n / maxBucketValue * histoHeight;
      const top = histoHeight - size;
      const bar = BAR_TEMPLATE.cloneNode(true) as SVGRectElement;
      const x = (value - displayMin) / valRange * this.histoWidth;
      bar.setAttribute("x", `${x}`);
      bar.setAttribute("y", `${top}`);
      bar.setAttribute("width", `${bucketSize}`);
      bar.setAttribute("height", `${size}`);
      bar.classList.toggle("highlight", highlightValue >= value && highlightValue < nextValue);
      this.histoBarParent.appendChild(bar);
      positions[i] = x;
    });
  }




  drawLabels(data:number[], kneeIndex:number) {
    // const count:number = data.length;
    // this.traceData.count = count;
    // const {ctx, width, height} = this;


    // /* draw background and borders for the charts */
    // ctx.fillStyle = BG_COLOR;


    // /*
    // as we get more and more data, the time series gets more compact,
    // and the lines acquire a density that is fairly ugly. So we try
    // to counter that by getting a lighter line weight as we get more data.
    // */
    // ctx.beginPath();
    // if (data.length > 1) {
    //   const {displayMin, displayMax} = this.traceData;
    //   // this.readout.innerHTML = `${safeLabel(data[data.length - 1])} ${this.traceData.unit}`;

    //   ctx.strokeStyle = TRACE_COLOR;
    //   if (displayMax === displayMin) {
    //     ctx.strokeStyle = TRACE_COLOR;
    //     ctx.moveTo(0, height * 0.5);
    //     ctx.lineTo(0 + width, height * 0.5);
    //     ctx.stroke();
    //     // this.maxLabel.innerHTML = ``;
    //     // this.minLabel.innerHTML = ``;
    //     // this.avgLabel.innerHTML = `${safeLabel(displayMax)}`;
    //   } else {

    //     ctx.strokeStyle = BORDER_COLOR;
    //     ctx.lineWidth = BORDER_WEIGHT;
    //     ctx.beginPath();
    //     ctx.moveTo(0, 0);
    //     ctx.lineTo(0, 0);

    //     const midVal = (displayMin + displayMax) / 2;
    //     // this.maxLabel.innerHTML = `${safeLabel(displayMax)}`;
    //     // this.minLabel.innerHTML = `${safeLabel(displayMin)}`;
    //     let skipMiddle = false;
    //     if (this.traceData.isDiscrete && displayMax - displayMin < 20 && midVal !== Math.floor(midVal)) {
    //       skipMiddle = true;
    //     } else if (safeLabel(displayMax) === safeLabel(midVal)) skipMiddle = true;
    //     else if (safeLabel(displayMin) === safeLabel(midVal)) skipMiddle = true;
    //     if (skipMiddle) {
    //       // this.avgLabel.innerHTML = '';
    //     } else {
    //       // this.avgLabel.innerHTML = `${safeLabel(midVal)}`;
    //       ctx.moveTo(0, height/2);
    //       ctx.lineTo(0, height/2);
    //     }
    //     ctx.moveTo(0, height - BORDER_WEIGHT * 0.5);
    //     ctx.lineTo(0, height - BORDER_WEIGHT * 0.5);
    //     ctx.stroke();
    //   }
    //   // this.firstStepLabel.innerHTML = '';
    //   // this.midStepLabel.innerHTML = ``;
    //   // this.lastStepLabel.innerHTML = '';
    // } else {
    //   // this.readout.innerHTML = `0 ${this.unit}`;
    // }
    // this.canvas.classList.toggle('kneed', kneeIndex > 0);
    // // ctx.fillStyle = 'black';
    // // const label = `ESS: ${  this.ess.toLocaleString(undefined, {maximumFractionDigits: 2, minimumFractionDigits: 2})}`;
    // // ctx.fillText(label, this.distLeft - 70, height - 2);
  }




}

