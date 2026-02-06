import { nfc, nicenum, safeLabel, UNSET } from '../common';
import { chartContainer, TraceCanvas } from "./tracecanvas";
import { hoverListenerType, kneeHoverListenerType } from './runcommon';
import { HistData, MAX_COUNT_FOR_DISCRETE } from "./histdata";


export const TRACE_TEMPLATE = chartContainer.querySelector('.module.trace') as HTMLDivElement;
TRACE_TEMPLATE.remove();
const BAR_TEMPLATE = TRACE_TEMPLATE.querySelector(".chart .histogram .bars .distribution rect") as SVGRectElement;
BAR_TEMPLATE.remove();

const MAX_STEP_SIZE = 3;
const TARGET_LABEL_SPACING = 25; // in px

export class HistCanvas extends TraceCanvas {



  kneeListener: kneeHoverListenerType;
  hoverListener: hoverListenerType;
  histoSVG: SVGElement;
  histoWidth: number;
  histoHeight: number;
  histoBarParent: SVGGElement;
  highlightDiv: HTMLDivElement;
  yAxisDiv: HTMLDivElement;
  yAxisTickTemplate: HTMLDivElement;
  yAxisHoverDiv: HTMLDivElement;
  xAxisDiv: HTMLDivElement;
  xAxisTick: HTMLSpanElement;
  hoverX: number = UNSET;
  hoverY: number = UNSET;
  isDragging = false;


  constructor(label:string, unit='', kneeListener: kneeHoverListenerType, hoverListener: hoverListenerType) {
    super(label, unit, TRACE_TEMPLATE);
    this.traceData = new HistData(label, unit)
    this.kneeListener = kneeListener;
    this.hoverListener = hoverListener;
    this.isVisible = true;

    this.histoSVG = this.container.querySelector(".histogram svg") as SVGElement;
    this.histoBarParent = this.histoSVG.querySelector(".distribution") as SVGGElement;
    this.histoWidth = UNSET;
    this.histoHeight = UNSET;
    this.highlightDiv = this.container.querySelector(".position") as HTMLDivElement;
    this.yAxisDiv = this.container.querySelector(".chart .feature .axis.y .values") as HTMLDivElement;
    this.yAxisTickTemplate = this.yAxisDiv.querySelector(".value:not(.hover)") as HTMLDivElement;
    this.yAxisHoverDiv = this.yAxisDiv.querySelector(".hover") as HTMLDivElement;
    this.xAxisDiv = this.container.querySelector(".chart .support .axis.x") as HTMLDivElement;
    this.xAxisTick = this.xAxisDiv.querySelector(".tick") as HTMLSpanElement;
    this.highlightDiv.addEventListener('pointerdown', event=>{
      this.svg.classList.add('dragging');
      this.isDragging = true;
      this.handlePointerMove(event);
    });
    this.highlightDiv.addEventListener('pointermove', event=>{
      this.handlePointerMove(event);
    });
    this.highlightDiv.addEventListener('pointerup', ()=>{
      this.svg.classList.remove('dragging');
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
    const { height } = this;
    const { count, savedKneeIndex, hideBurnIn, displayCount } = this.traceData as HistData;
    if (y >= 0) {
      pct = 1 - y / height;
      // console.log('knee', x, pct)
      if (count * MAX_STEP_SIZE < height) {
        pct = 1 - y / (count * MAX_STEP_SIZE);
      } else if (hideBurnIn) {
        /*
        rescale the pct from just the visible trees
        to all the trees.

        what would the height be if we included the burnin?
        */
        const heightWithInvisible = count / displayCount * height;
        pct = 1 - y / heightWithInvisible;
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
      console.log('handlePointerMove', treeIndex);
      this.hoverListener(treeIndex);
    }
  }

  handleTreeHighlight(treeIndex: number): void {
    const isMean = treeIndex === UNSET;
    const traceData = this.traceData as HistData;
    const readoutValue = isMean ? traceData.dataMean: traceData.data[treeIndex];
    traceData.highlightIndex = treeIndex;
    this.setReadoutLabel(isMean, readoutValue, traceData.unit);
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
    // requestAnimationFrame(()=>this.canvas.classList.toggle('kneed', kneeIndex > 0));
  }



  setMetadata(count: number, kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    super.setKneeIndex(count, kneeIndex);
    (this.traceData as HistData).setMetadata(count, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
  }

  draw() {
    const traceData = this.traceData as HistData;
    let { data, highlightIndex, dataMean, hideBurnIn, savedKneeIndex, displayCount } = traceData,
      kneeIndex = traceData.currentKneeIndex;
    const isMean = highlightIndex === UNSET;
    const readoutValue = isMean ? dataMean: data[highlightIndex];
    if (hideBurnIn && savedKneeIndex > 0) {
      data = data.slice(savedKneeIndex);
      kneeIndex -= savedKneeIndex;
      highlightIndex -= savedKneeIndex;
    }
    /*
    order matters here, since the location of the hovered
    sample is set in `drawTrace` and read in `drawLabels`
    */
    this.drawTrace(data, kneeIndex, highlightIndex);
    this.drawHistogramSVG(readoutValue);
    this.drawYAxisLabels(hideBurnIn, traceData.highlightIndex);
    this.setReadoutLabel(isMean, readoutValue, traceData.unit);
  }


  drawTrace(data: number[], kneeIndex: number, highlightIndex: number) {
    const { displayCount, hideBurnIn, dataMean, displayMin,
      displayMax, isDiscrete } = this.traceData as HistData;
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
    let left = 0;
    let dataScale = 1;

    if (displayCount === 1) {
      activePath = `M${width * 0.5} 0 ${width * 0.5} ${MAX_STEP_SIZE}`;
    } else if (displayCount > 1) {
      const valRange = displayMax - displayMin;
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
        dataScale = width / (valRange || 1);
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
      /* set the x value for the mean */
      if (displayCount > 1) {
        hoverX = left + (dataMean - displayMin) * dataScale;
      } else {
        hoverX = width / 2;
      }
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
    this.hoverX = hoverX;
    this.hoverY = hoverY;
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




  drawYAxisLabels(hideBurnIn: boolean, highlightIndex: number) {
    const { height, traceData, hoverY } = this;
    const { count, savedKneeIndex, displayCount } = traceData as HistData;
    this.yAxisDiv.querySelectorAll(".value:not(.hover)").forEach( (div)=>(div as HTMLDivElement).remove());
    if (count === 0) return;
    let sampleCount = count;
    let startPoint = 0;
    if (hideBurnIn && savedKneeIndex > 0) {
      if (savedKneeIndex === 20) {
        console.log("qu'est-ce que ce passe?")
      }
      sampleCount = sampleCount - savedKneeIndex + 1;
      startPoint = savedKneeIndex;
    }

    /*
    how much space does the charting take?
    during the early parts of the run, the chart does not
    stretch over the whole height.
    */
    let activeHeight = height;
    if (displayCount <= 1) {
      activeHeight = MAX_STEP_SIZE;
    } else {
      activeHeight = Math.min(height, MAX_STEP_SIZE * displayCount);
    }
    const targetTickCount = Math.ceil(activeHeight / TARGET_LABEL_SPACING);

    const tickInterval = Math.max(10, nicenum(sampleCount / targetTickCount));
    const intervalSize = tickInterval / sampleCount * activeHeight;
    let tickStart = 0;



    let startY = activeHeight;
    if (hideBurnIn && savedKneeIndex > 0) {
      /* what's the first nice num after the start point? */
      tickStart = Math.ceil(savedKneeIndex / tickInterval) * tickInterval - 1;
      startY = (sampleCount - tickStart + savedKneeIndex) / sampleCount * activeHeight;
    }
    let tick = tickStart;
    let y = startY;
    while (tick < sampleCount) {
      /* make sure this doesn't overlap with the hover */
      if (hoverY === UNSET || Math.abs(hoverY - y) >= TARGET_LABEL_SPACING / 2) {
        this.addYTick(y, tick + 1);
      }
      if (tick === 0) tick += tickInterval - 1;
      else tick += tickInterval;
      y -= intervalSize;
    }
    if (highlightIndex === UNSET) {
      this.yAxisHoverDiv.classList.add("hidden");
    } else {
      // console.log('drawLabels', highlightIndex)
      this.yAxisHoverDiv.classList.remove("hidden");
      this.yAxisHoverDiv.style.top = `${ hoverY }px`;
      /* report the tree index starting from 1, not 0 */
      (this.yAxisHoverDiv.querySelector(".val") as HTMLDivElement).textContent = nfc( highlightIndex + 1);
    }
  }


  addYTick(y: number, value: number) : HTMLDivElement {
    const div = this.yAxisTickTemplate.cloneNode(true) as HTMLDivElement;
    (div.querySelector(".val") as HTMLDivElement).textContent = nfc(value);
    div.style.top = `${y}px`;
    this.yAxisDiv.appendChild(div);
    return div;
  }


  setReadoutLabel(isMean: boolean, value: number, unit: string) {
    this.xAxisTick.style.left = `${ this.hoverX }px`;
    if (isMean) {
      this.xAxisDiv.classList.add("meaning");
    } else {
      this.xAxisDiv.classList.remove("meaning");
    }
    (this.xAxisDiv.querySelector(".readout-value") as HTMLSpanElement).textContent = safeLabel(value);
    if (unit) {
      this.xAxisDiv.classList.remove("unitless");
      (this.xAxisDiv.querySelector(".readout-unit") as HTMLSpanElement).innerHTML = unit;
    } else {
      this.xAxisDiv.classList.add("unitless");
    }
  }



}

