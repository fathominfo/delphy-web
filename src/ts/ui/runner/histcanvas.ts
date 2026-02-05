import { safeLabel, UNSET } from '../common';
import { TraceCanvas, TRACE_TEMPLATE } from "./tracecanvas";
import { hoverListenerType, kneeHoverListenerType } from './runcommon';
import { HistData, MAX_COUNT_FOR_DISCRETE } from "./histdata";


const MAX_STEP_SIZE = 3;

const BAR_TEMPLATE = TRACE_TEMPLATE.querySelector(".chart .histogram .bars .distribution rect") as SVGRectElement;
BAR_TEMPLATE.remove();




export class HistCanvas extends TraceCanvas {



  kneeListener: kneeHoverListenerType;
  hoverListener: hoverListenerType;
  histoSVG: SVGElement;
  histoWidth: number;
  histoHeight: number;
  histoBarParent: SVGGElement;
  highlightDiv: HTMLDivElement;
  isDragging = false;


  constructor(label:string, unit='', kneeListener: kneeHoverListenerType, hoverListener: hoverListenerType) {
    super(label, unit);
    this.traceData = new HistData(label, unit)
    this.kneeListener = kneeListener;
    this.hoverListener = hoverListener;
    this.isVisible = true;

    this.histoSVG = this.container.querySelector(".histogram svg") as SVGElement;
    this.histoBarParent = this.histoSVG.querySelector(".distribution") as SVGGElement;
    this.histoWidth = UNSET;
    this.histoHeight = UNSET;
    this.highlightDiv = this.container.querySelector(".position") as HTMLDivElement;
    this.highlightDiv.addEventListener('pointerdown', event=>{
      this.canvas.classList.add('dragging');
      this.isDragging = true;
      this.handlePointerMove(event);
    });
    this.highlightDiv.addEventListener('pointermove', event=>{
      this.handlePointerMove(event);
    });
    this.highlightDiv.addEventListener('pointerup', ()=>{
      this.canvas.classList.remove('dragging');
      this.isDragging = false;
    });
    // const requestDraw = ()=>requestAnimationFrame(()=>this.draw());
    // this.canvas.addEventListener('pointerover', ()=>{
    //   this.hovering = true;
    //   requestDraw();
    // });
    this.highlightDiv.addEventListener('pointerleave', ()=>{
      // this.hovering = false;
      // requestDraw();
      this.hoverListener(UNSET);
    });


  }


  getTreePercentAtY(event:PointerEvent) {
    let pct = UNSET;
    const y = event.offsetY;
    const { count, savedKneeIndex, hideBurnIn } = this.traceData as HistData;
    if (y >= 0) {
      pct = 1 - y / this.height;
      // console.log('knee', x, pct)
      if (count * MAX_STEP_SIZE < this.height) {
        pct = 1 - y / (count * MAX_STEP_SIZE);
      }
      if (hideBurnIn) {
        /*
        rescale the pct from just the visible trees
        to all the trees.

        the visible trees are what percent of all the trees?
        */
        const totalCount = savedKneeIndex + count,
          totalIndex = savedKneeIndex + Math.round(pct * count);
        pct = totalIndex / totalCount;
      }
    }
    return pct;
  }

  getTreeAtY(event:PointerEvent) {
    const pct = this.getTreePercentAtY(event);
    const data = (this.traceData as HistData).data;
    let index = Math.floor(pct * data.length);
    if (!Number.isFinite(data[index])) {
      index = UNSET;
    }
    return index;
  }


  handlePointerMove(event:PointerEvent) : void {
    if (this.isDragging) {
      const pct = this.getTreePercentAtY(event);
      if (pct <= 1) {
        this.kneeListener(pct);
      }
    } else {
      const treeIndex = this.getTreeAtY(event);
      // if (this.hideBurnIn) treeIndex += this.savedKneeIndex
      this.hoverListener(treeIndex);
    }
  }

  handleTreeHighlight(treeIndex: number): void {
    // const isMean = treeIndex === UNSET;
    const traceData = this.traceData as HistData;
    // const readoutValue = isMean ? traceData.dataMean: traceData.data[treeIndex];
    traceData.highlightIndex = treeIndex;
    // this.setReadoutLabel(isMean, readoutValue, traceData.unit, treeIndex);
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
    const traceData = this.traceData as HistData;
    let { data, highlightIndex, dataMean, hideBurnIn, savedKneeIndex } = traceData,
      kneeIndex = traceData.currentKneeIndex;
    const isMean = highlightIndex === UNSET;
    const readoutValue = isMean ? dataMean: data[highlightIndex];
    if (hideBurnIn && savedKneeIndex > 0) {
      data = data.slice(savedKneeIndex);
      kneeIndex -= savedKneeIndex;
      highlightIndex -= savedKneeIndex;
    }
    this.drawTrace(data, kneeIndex, highlightIndex);
    this.drawHistogramSVG(readoutValue);
  }


  drawTrace(data: number[], kneeIndex: number, highlightIndex: number) {
    const { displayCount, hideBurnIn } = this.traceData as HistData;
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
    let hoverX = UNSET;
    let hoverY = UNSET;

    if (displayCount === 0) {
      burnInHeight = 0;
      activeHeight = height;
    } else if (displayCount === 1) {
      activePath = `M${width * 0.5} 0 ${width * 0.5} 3`;
    } else if (displayCount > 1) {
      const { displayMin, displayMax, isDiscrete } = this.traceData;
      const valRange = displayMax - displayMin;
      let left = 0;
      if (isDiscrete && valRange < MAX_COUNT_FOR_DISCRETE) {
        const bucketSize = width / (valRange + 1);
        left = bucketSize * 0.5;
        width -= bucketSize;
      }

      const stepSize = Math.min(MAX_STEP_SIZE, height / (displayCount - 1) || 1);
      /*
      in early stages of the run, there might not be enough samples to cover
      the whole chart. So how much of the chart are we covering?
      */
      const plotSize = Math.min(height, displayCount * stepSize);
      const leftover = height - plotSize;
      burnInHeight = hideBurnIn ? 0 : kneeIndex * stepSize + leftover;
      activeHeight = height - burnInHeight;

      if (displayMax === displayMin) {
        activePath = `M${width * 0.5} ${0} L${width * 0.5} ${burnInHeight} `;
        burnInPath = `M${width * 0.5} ${burnInHeight} L${width * 0.5} ${height * 0.5} `;
      } else {

        const dataScale = width / (valRange || 1);
        const bottom = Math.min(height, (displayCount - 1) * stepSize);
        // console.log(bottom, height, displayCount * stepH);
        let currentPath = "";
        let first = true;
        let n: number,
          x: number = UNSET,
          y: number = UNSET,
          prevX = UNSET,
          prevY = UNSET;
        for (let i = 0; i < data.length; i++) {
          if (i === kneeIndex) {
            burnInPath = currentPath;
            currentPath = `M${prevX} ${prevY} L `;
          }
          n = data[i];
          y = bottom - i * stepSize;
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
          if (i === highlightIndex) {
            hoverX = x;
            hoverY = y;
          }
          first = false;
          prevX = x;
          prevY = y;
        }
        activePath = currentPath;
      }
    }

    if (hoverX === UNSET) {
      this.highlightDiv.classList.remove("active");
    } else {
      this.highlightDiv.classList.add("active");
      const pointDiv = this.highlightDiv.querySelector(".pos") as HTMLDivElement;
      const xDiv = this.highlightDiv.querySelector(".x.p") as HTMLDivElement;
      const yDiv = this.highlightDiv.querySelector(".y.p") as HTMLDivElement;
      pointDiv.style.left = `${hoverX}px`;
      pointDiv.style.top = `0px`;
      xDiv.style.left = `${hoverX}px`;
      yDiv.style.top = `${hoverY}px`;

    }

    burnInField.setAttribute("height", `${burnInHeight}`);
    burnInField.setAttribute("y", `${activeHeight}`);
    activeField.setAttribute("height", `${activeHeight}`);
    burnInTrend.setAttribute("d", burnInPath);
    activeInTrend.setAttribute("d", activePath);
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

