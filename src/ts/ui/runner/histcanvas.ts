import { getTimestampString, nfc, nicenum, safeLabel, UNSET } from '../common';
import { chartContainer, TraceCanvas } from "./tracecanvas";
import { HistDataFunction, hoverListenerType, kneeHoverListenerType, PlottableSummaryStats, statHoverListenerType, SummaryStat, SummaryStatLongLabels, SummaryStatLookup, SummaryStatsType } from './runcommon';
import { HistData, MAX_COUNT_FOR_DISCRETE } from "./histdata";
import { getElementsAndStyles } from '../../util/exportutils';


export const TRACE_TEMPLATE = chartContainer.querySelector('.module.trace') as HTMLDivElement;
TRACE_TEMPLATE.remove();
const BAR_TEMPLATE = TRACE_TEMPLATE.querySelector(".histogram .bars .distribution rect") as SVGRectElement;
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
  supportDiv: HTMLDivElement;
  statsList: HTMLDListElement;
  xAxisDiv: HTMLDivElement;
  xAxisTick: HTMLSpanElement;
  hoverX: number = UNSET;
  hoverY: number = UNSET;
  stepSize: number = MAX_STEP_SIZE;
  isDragging = false;
  formatLabel = safeLabel;
  highlightStat: SummaryStat | null = null;
  /*
  only needed for downloads of trace data.
  Feels inelegant to have this here for just that one potential need,
  but other options don't really feel any better:
    pass in a callback from runui to get the steps hist
      which is better, a pointer to a function or a pointer to an array
        at least the function doesn't change, whereas the arry needs updating
        every time we get fresh data. but meh.
    pass in the last step, and calculate backwards from there
      more complicated than just passing an array, and isn't really more
      efficient
    manage the download in runui, and pass in everything that's needed from here
      but really, the bulk of the work and data is here, so that feel needlessly
      complex
  open to other solutions, but for the moment this is the simplest [mark 260316]
  */
  steps: number[] = [];


  constructor(label:string, unit='', className='', getDataFnc: HistDataFunction,
    isDiscrete: boolean, kneeListener: kneeHoverListenerType,
    hoverListener: hoverListenerType, statHoverListener: statHoverListenerType
  ) {
    super(label, unit, className, getDataFnc, TRACE_TEMPLATE);
    this.traceData = new HistData(label, unit, getDataFnc, isDiscrete);
    this.kneeListener = kneeListener;
    this.hoverListener = hoverListener;
    this.isVisible = true;
    const unitDiv = this.container.querySelector(".header .readout-unit") as HTMLParagraphElement;
    unitDiv.innerHTML = unit;
    this.histoSVG = this.container.querySelector(".histogram svg") as SVGElement;
    this.histoBarParent = this.histoSVG.querySelector(".distribution") as SVGGElement;
    this.histoWidth = UNSET;
    this.histoHeight = UNSET;
    this.highlightDiv = this.container.querySelector(".position") as HTMLDivElement;
    this.yAxisDiv = this.container.querySelector(".axis.y .values") as HTMLDivElement;
    this.yAxisTickTemplate = this.yAxisDiv.querySelector(".value:not(.hover)") as HTMLDivElement;
    this.yAxisHoverDiv = this.yAxisDiv.querySelector(".hover") as HTMLDivElement;
    this.supportDiv = this.container.querySelector(".support") as HTMLDivElement;
    this.statsList = this.supportDiv.querySelector(".summary-stats") as HTMLDListElement;
    this.xAxisDiv = this.container.querySelector(".support .axis.x") as HTMLDivElement;
    this.xAxisTick = this.xAxisDiv.querySelector(".tick") as HTMLSpanElement;
    this.highlightDiv.addEventListener('pointerdown', event=>{
      this.svg.classList.add('dragging');
      this.isDragging = true;
      this.highlightDiv.setPointerCapture(event.pointerId);
      this.handlePointerMove(event);
    });
    this.highlightDiv.addEventListener('pointermove', event=>{
      this.handlePointerMove(event);
    });
    this.highlightDiv.addEventListener('pointerup', event=>{
      this.svg.classList.remove('dragging');
      this.isDragging = false;
      this.highlightDiv.releasePointerCapture(event.pointerId);
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
    let prevStat = '';
    const announceStat = (event: PointerEvent) => {
      let ele = event.target as HTMLElement;
      while (ele !== this.statsList && ele.nodeName !== "DT" && ele.nodeName !== "DD") {
        ele = ele.parentNode as HTMLElement;
      }
      let statName = ele.getAttribute("data-stat") || '';
      if (statName === "hpd") {
        if ((event.target as HTMLElement).classList.contains("hpd-max")) {
          statName = "hpdMax";
        } else {
          statName = "hpdMin";
        }
      }
      if (statName !== prevStat) {
        prevStat = statName || '';
        let stat: SummaryStat | null = null;
        if (statName) {
          stat = SummaryStatLookup[statName];
          if (stat === undefined) stat = null;
        }
        statHoverListener(stat);
      }
    };
    this.statsList.addEventListener('pointerenter', event=>{
      announceStat(event);
    });
    this.statsList.addEventListener('pointermove', event=>{
      announceStat(event);
    });
    this.statsList.addEventListener('pointerleave', ()=>{
      prevStat = '';
      statHoverListener(null);
    });

    const copyButton = this.supportDiv.querySelector(".copy-button") as HTMLButtonElement;
    const histoDownloadDataButton = this.container.querySelector(".display-wrapper:has(.histogram) .download-button") as HTMLButtonElement;
    const traceDownloadDataButton = this.container.querySelector(".display-wrapper:has(.graph) .download-button") as HTMLButtonElement;
    const histoDownloadChartButton = this.container.querySelector(".display-wrapper:has(.histogram) .download-button") as HTMLButtonElement;
    const traceDownloadChartButton = this.container.querySelector(".display-wrapper:has(.graph) .download-button") as HTMLButtonElement;
    copyButton.addEventListener('click', ()=>{
      const stats = (this.traceData as HistData).getStats();
      let data = '';
      Object.entries(stats).forEach(([key, value])=>{
        const label = SummaryStatLongLabels[key];
        console.log(key, label)
        data += `${label}\t${value}\n`}
      );
      navigator.clipboard.writeText(data).then(()=>copyButton.classList.add("completed"));
    });
    histoDownloadDataButton.addEventListener('click', ()=>{
      const { bucketConfig, distribution } = this.traceData as HistData;
      const { buckets, values } = bucketConfig;
      const bandwidth = distribution.bandwidth;
      console.log(distribution)
      const label = this.className;
      let text = `bucket min\tbucket max\tprobability\tpdf\n`;
      let totProb = 0;
      buckets.forEach((pdf, i)=>{
        const bucketMin = values[i];
        const bucketMax = values[i+ 1] || (bucketMin + bandwidth);
        const buck = bucketMax - bucketMin
        const prob = pdf * buck;
        totProb += prob;
        text += `${bucketMin}\t${bucketMax}\t${prob}\t${pdf}\n`;
      });
      console.log("total prob", totProb)
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a"),
        title = `delphy-${label.toLowerCase()}-distribution-${getTimestampString()}.tsv`;
      a.href = url;
      a.download = title;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{
        const parent = histoDownloadDataButton.parentElement as HTMLDivElement;
        parent.classList.add("completed");
        a.remove();
      }, 10000);
    });
    histoDownloadChartButton.addEventListener('click', ()=>{
      const result = getElementsAndStyles(this.histoSVG);
      console.log(result);
    });
    traceDownloadDataButton.addEventListener('click', ()=>{
      const traces = (this.traceData as HistData).data,
        steps = this.steps,
        label = this.className;
      let text = `step\t${label}\n`;
      console.assert(traces.length === steps.length);
      traces.forEach((trace, i)=>text += `${steps[i]}\t${trace}\n`);
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a"),
        title = `delphy-${label}-traces-${getTimestampString()}.tsv`;
      a.href = url;
      a.download = title;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{
        const parent = traceDownloadDataButton.parentElement as HTMLDivElement;
        parent.classList.add("completed");
        a.remove();
      }, 10000);

    });
    copyButton.addEventListener('pointerenter', ()=>copyButton.classList.remove("completed"));
    histoDownloadDataButton.addEventListener('pointerenter', ()=>histoDownloadDataButton.classList.remove("completed"));
    traceDownloadDataButton.addEventListener('pointerenter', ()=>traceDownloadDataButton.classList.remove("completed"));
    histoDownloadChartButton.addEventListener('pointerenter', ()=>histoDownloadChartButton.classList.remove("completed"));
    traceDownloadChartButton.addEventListener('pointerenter', ()=>traceDownloadChartButton.classList.remove("completed"));
  }


  getTreePercentAtY(event:PointerEvent) {
    let pct = UNSET;
    const y = event.offsetY;
    const { height } = this;
    const { count, hideBurnIn, displayCount } = this.traceData as HistData;
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
      // console.log('handlePointerMove', treeIndex);
      this.hoverListener(treeIndex);
    }
  }

  handleTreeHighlight(treeIndex: number): void {
    const isMean = treeIndex === UNSET;
    const traceData = this.traceData as HistData;
    const readoutValue = isMean ? traceData.mean: traceData.data[treeIndex];
    traceData.highlightIndex = treeIndex;
    this.setReadoutLabel(isMean, readoutValue);
  }


  sizeCanvas(): void {
    const wrapper = this.histoSVG.parentElement as HTMLDivElement;
    this.histoWidth = wrapper.clientWidth;
    this.histoHeight = wrapper.clientHeight;
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


  setData(kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number, stepsPerSample: number, steps: number[]) {
    const sourceData : number[] = (this.traceData.getDataFnc()) as number[];
    const histData = this.traceData as HistData;
    this.steps = steps;
    histData.setData(sourceData, kneeIndex, mccIndex, hideBurnIn, sampleIndex, stepsPerSample);
  }



  setMetadata(count: number, kneeIndex:number, mccIndex:number, hideBurnIn:boolean, sampleIndex: number) {
    super.setKneeIndex(count, kneeIndex);
    (this.traceData as HistData).setMetadata(count, kneeIndex, mccIndex, hideBurnIn, sampleIndex);
  }

  draw() {
    const traceData = this.traceData as HistData;
    let { data, highlightIndex } = traceData,
      kneeIndex = traceData.currentKneeIndex;
    const { hideBurnIn, savedKneeIndex } = traceData;
    let readoutValue = Number.MAX_VALUE;
    let isHighlight = false;
    if (highlightIndex !== UNSET) {
      readoutValue = data[highlightIndex];
      isHighlight = true;
    } else if (this.highlightStat !== null && PlottableSummaryStats[this.highlightStat]) {
      const attribute = SummaryStat[this.highlightStat] as keyof SummaryStatsType;
      const stats = (this.traceData as HistData).getStats();
      readoutValue = stats[attribute];
    }
    if (hideBurnIn && savedKneeIndex > 0) {
      data = data.slice(savedKneeIndex);
      kneeIndex -= savedKneeIndex;
      highlightIndex -= savedKneeIndex;
    }
    /*
    order matters here, since the location of the hovered
    sample is set in `drawTrace` and read in `drawYAxisLabels`
    */
    this.drawTrace(data, kneeIndex, highlightIndex);
    this.drawHistogramSVG(readoutValue);
    this.drawYAxisLabels(hideBurnIn, traceData.highlightIndex);
    this.setReadoutLabel(isHighlight, readoutValue);
    this.setStatsReadouts();
  }


  drawTrace(data: number[], kneeIndex: number, highlightIndex: number) {
    const { displayCount, hideBurnIn, displayMin,
      displayMax, isDiscrete } = this.traceData as HistData;
    const { height } = this;
    const burnInContainer = this.svg.querySelector(".burn-in") as SVGGElement;
    const burnInField = burnInContainer.querySelector(".period") as SVGRectElement;
    const burnInTrend = burnInContainer.querySelector(".trend") as SVGPathElement;
    const activeContainer = this.svg.querySelector(".run") as SVGGElement;
    // const activeField = activeContainer.querySelector(".period") as SVGRectElement;
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
    let trendWeight = 1;
    let stepSize = MAX_STEP_SIZE;

    if (displayCount === 1) {
      activePath = `M${width * 0.5} 0 ${width * 0.5} ${MAX_STEP_SIZE}`;
    } else if (displayCount > 1) {
      const valRange = displayMax - displayMin;
      if (isDiscrete && valRange < MAX_COUNT_FOR_DISCRETE) {
        const bucketSize = width / (valRange + 1);
        left = bucketSize * 0.5;
        width -= bucketSize;
      }
      /*
      if we span the entire chart with the values we have,
      how big does each step need to be?
      */
      const fullSpanningStepSize = height / (displayCount - 1) || 1;
      /* steps that are too big look pretty goofy, so cap them if needed */
      const forceSmallerSteps = fullSpanningStepSize > MAX_STEP_SIZE;
      stepSize = forceSmallerSteps ? MAX_STEP_SIZE : fullSpanningStepSize;
      /*
      in early stages of the run, there might not be enough samples to cover
      the whole chart. So how much of the chart are we covering?
      */
      const plotSize = Math.min(height, displayCount * stepSize);
      const leftover = height - plotSize;
      burnInHeight = hideBurnIn ? 0 : Math.max(0, kneeIndex * stepSize + leftover);
      if (kneeIndex === 0) {
        burnInHeight = 0;
      }
      activeHeight = Math.max(0, height - burnInHeight);

      trendWeight = Math.min(1, Math.sqrt(height / data.length));

      if (displayMax === displayMin) {
        activePath = `M${width * 0.5} ${0} L${width * 0.5} ${activeHeight} `;
        burnInPath = `M${width * 0.5} ${activeHeight} L${width * 0.5} ${plotSize} `;
        if (highlightIndex >= 0) {
          hoverX = width * 0.5;
          hoverY = plotSize - highlightIndex * stepSize;
        }
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
      /* set the x value for the highlight stat */
      if (this.highlightStat !== null) {
        if (displayCount > 1) {
          const attribute = SummaryStat[this.highlightStat] as keyof SummaryStatsType;
          const stats = (this.traceData as HistData).getStats();
          const value = stats[attribute];
          hoverX = left + (value - displayMin) * dataScale;
        } else {
          hoverX = width / 2;
        }
      } else {
        hoverX = UNSET;
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

    burnInField.classList.toggle("hidden", burnInHeight === 0);
    burnInField.setAttribute("y1", `${activeHeight}`);
    burnInField.setAttribute("y2", `${activeHeight}`);
    burnInTrend.setAttribute("d", burnInPath);
    activeInTrend.setAttribute("d", activePath);
    burnInTrend.style.strokeWidth = `${trendWeight}`;
    activeInTrend.style.strokeWidth = `${trendWeight}`;
    this.hoverX = hoverX;
    this.hoverY = hoverY;
    this.stepSize = stepSize;
  }


  drawHistogramSVG(highlightValue: number) {
    const { traceData, histoWidth, histoHeight } = this;
    const { bucketConfig, isDiscrete, displayMin, displayMax } = traceData as HistData;
    const { buckets, values, maxBucketValue, positions, step } = bucketConfig;
    let valRange = displayMax - displayMin;

    /*
    since burnin might be visible, and the histogram does not include burn-in values,
    we need to calculate how much room the histogram takes.
    */
    const firstValue = values[0];
    const lastValue = values[values.length-1] + step;
    const histoValueRange = lastValue - firstValue;
    const histoSize = histoValueRange / valRange * histoWidth;
    let bucketSize = Math.max(0, histoSize / buckets.length);

    if (isDiscrete && histoValueRange < MAX_COUNT_FOR_DISCRETE) {
      valRange += step;
      bucketSize = histoWidth / (valRange);
    }

    this.histoBarParent.innerHTML = '';
    buckets.forEach((n, i)=>{
      const value = values[i];
      let nextValue = values[i + 1];
      if (nextValue === undefined) nextValue = value + step;
      const size = Math.max(0, n / maxBucketValue * histoHeight);
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
    const { traceData, hoverY, stepSize } = this;
    const { count, savedKneeIndex, displayCount } = traceData as HistData;
    this.yAxisDiv.querySelectorAll(".value:not(.hover)").forEach( (div)=>(div as HTMLDivElement).remove());
    const activeHeight = (displayCount-1) * stepSize;
    const targetTickCount = Math.ceil(activeHeight / TARGET_LABEL_SPACING);
    const tickInterval = Math.max(10, nicenum(displayCount / targetTickCount));
    // const tickInterval = 2; // Math.max(10, nicenum(displayCount / targetTickCount));
    const intervalSize = tickInterval * stepSize;
    let tickStart = 0;



    let startY = activeHeight;
    if (hideBurnIn && savedKneeIndex > 0) {
      /*
      what's the first nice num after the start point?
      the `- 1` is for index spacing, for example the start label should
      be 20, but that's position 19.
      */
      tickStart = Math.ceil(savedKneeIndex / tickInterval) * tickInterval - 1;
      /*
      where does the first tick land?
      the first onscreen sample is at the knee, so how far from the knee is the
      first tick?
      */
      const knee2Tick = tickStart - savedKneeIndex;
      startY = activeHeight - knee2Tick * stepSize;
    }
    let tick = tickStart;
    let y = startY;
    while (tick < count) {
      /* make sure this doesn't overlap with the hover */
      if (hoverY === UNSET || Math.abs(hoverY - y) >= TARGET_LABEL_SPACING / 2) {
        this.addYTick(y, tick + 1);
      }
      if (tick === 0) {
        tick += tickInterval - 1;
        const ratio = (tickInterval - 1) / tickInterval;
        y -= intervalSize * ratio;
      } else {
        tick += tickInterval;
        y -= intervalSize;
      }

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


  setReadoutLabel(isHighlight: boolean, value: number) {
    this.xAxisTick.classList.toggle("hidden", value === Number.MAX_VALUE);
    this.xAxisTick.style.left = `${ this.hoverX }px`;
    if (isHighlight) {
      this.xAxisDiv.classList.remove("meaning");
    } else {
      this.xAxisDiv.classList.add("meaning");
    }
    (this.xAxisDiv.querySelector(".readout-value") as HTMLSpanElement).innerHTML = this.formatLabel(value);
  }

  setStatsReadouts() : void {
    const stats = (this.traceData as HistData).getStats();
    setTextContent(this.statsList, ".mean", stats.mean);
    setTextContent(this.statsList, ".hpd-min", stats.hpdMin);
    setTextContent(this.statsList, ".hpd-max", stats.hpdMax);
    setTextContent(this.statsList, ".median", stats.median);
    setTextContent(this.statsList, ".stddev", stats.stdDev);
    setTextContent(this.statsList, ".stderr", stats.stdErrOnMean);
    setTextContent(this.statsList, ".ess", stats.ess);
    setTextContent(this.statsList, ".act", stats.act);
  }


  handleStatHighlight(statType: SummaryStat | null) : void {
    this.highlightStat = statType;
    requestAnimationFrame(()=>{
      this.highlightStatSpans();
      const traceData = this.traceData as HistData;
      let { data, highlightIndex } = traceData,
        kneeIndex = traceData.currentKneeIndex;
      const { hideBurnIn, savedKneeIndex } = traceData;
      if (hideBurnIn && savedKneeIndex > 0) {
        data = data.slice(savedKneeIndex);
        kneeIndex -= savedKneeIndex;
        highlightIndex -= savedKneeIndex;
      }
      let readoutValue = traceData.displayMin - 1_000_000;
      if (this.highlightStat !== null) {
        const attribute = SummaryStat[this.highlightStat] as keyof SummaryStatsType;
        const stats = (this.traceData as HistData).getStats();
        readoutValue = stats[attribute];
      }
      /*
      order matters here, since the location of the hovered
      sample is set in `drawTrace` and read in `drawLabels`
      */
      this.drawTrace(data, kneeIndex, highlightIndex);
      this.drawHistogramSVG(readoutValue);
    });
  }

  highlightStatSpans() : void {
    const statType = this.highlightStat;
    if (statType === null) {
      this.statsList.querySelectorAll(".back").forEach(dt=>dt.classList.remove("back"));
    } else {
      this.statsList.querySelectorAll("dt, .value").forEach(dt=>dt.classList.add("back"));
      let valueEle: HTMLElement;
      switch (statType) {
      case SummaryStat.mean:
        valueEle = this.statsList.querySelector(".mean") as HTMLElement;
        break;
      case SummaryStat.hpdMin:
        valueEle = this.statsList.querySelector(".hpd-min") as HTMLElement;
        break;
      case SummaryStat.hpdMax:
        valueEle = this.statsList.querySelector(".hpd-max") as HTMLElement;
        break;
      case SummaryStat.median:
        valueEle = this.statsList.querySelector(".median") as HTMLElement;
        break;
      case SummaryStat.stdDev:
        valueEle = this.statsList.querySelector(".stddev") as HTMLElement;
        break;
      case SummaryStat.stdErrOnMean:
        valueEle = this.statsList.querySelector(".stderr") as HTMLElement;
        break;
      case SummaryStat.ess:
        valueEle = this.statsList.querySelector(".ess") as HTMLElement;
        break;
      case SummaryStat.act:
        valueEle = this.statsList.querySelector(".act") as HTMLElement;
        break;
      }
      if (valueEle) {
        valueEle.classList.remove("back");
        /*
        find the corresponding dt element:
        the HTML is something like
          <dt>mean</dt><dd><span class="value mean"></span></dd>
        so find the parent dd element, and then it's prior sibling
        */
        const dd = valueEle.parentNode as HTMLElement;
        const dt = dd.previousElementSibling as HTMLElement;
        dt.classList.remove("back");
      }
    }
  }





}

const setTextContent = (el: HTMLElement, selector: string, value: number) => {
  (el.querySelector(selector) as HTMLSpanElement).textContent = safeLabel(value);
}
