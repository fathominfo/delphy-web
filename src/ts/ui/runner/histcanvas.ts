import { downloadTextFile, getDecimalPrecision, getTimestampString, nf000, nfc, nicenum, safeLabel, UNSET } from '../common';
import { chartContainer, TraceCanvas } from "./tracecanvas";
import { HistDataFunction, hoverListenerType, kneeHoverListenerType, PlottableSummaryStats, statHoverListenerType, SummaryStat, SummaryStatLongLabels, SummaryStatLookup, SummaryStatsType } from './runcommon';
import { HistData } from "./histdata";
import { getElementsAndStyles } from '../../util/exportutils';
// import { PDFDocument, rgb } from 'pdf-lib';
import { jsPDF } from "jspdf";
import { KernelDensityEstimate } from '../../pythia/kde';


export const TRACE_TEMPLATE = chartContainer.querySelector('.module.trace') as HTMLDivElement;
TRACE_TEMPLATE.remove();
const BAR_TEMPLATE = TRACE_TEMPLATE.querySelector(".histogram .bars .distribution rect") as SVGRectElement;
BAR_TEMPLATE.remove();
const DISTRIBUTION_TEMPLATE = TRACE_TEMPLATE.querySelector(".histogram .bars .distribution path") as SVGPathElement;
DISTRIBUTION_TEMPLATE.remove();
const HIGHLIGHT_LINE_TEMPLATE = TRACE_TEMPLATE.querySelector(".histogram .bars .distribution line") as SVGLineElement;
HIGHLIGHT_LINE_TEMPLATE.remove();
const INFO_ICON_TEMPLATE = document.querySelector("#runner .main-content .info:has(.icon)") as HTMLAnchorElement;
// do not remove the INFO_ICON_TEMPLATE
const TICK_BAR_TEMPLATE = TRACE_TEMPLATE.querySelector("svg .tick-bar") as SVGLineElement;
TICK_BAR_TEMPLATE.remove();




const MAX_STEP_SIZE = 3;
const TARGET_LABEL_SPACING = 70; // in px

/*
for use in situations where UNSET (-1) falls
within the valid range of inputs
*/
const NO_VALUE = Number.MIN_SAFE_INTEGER;


export class HistCanvas extends TraceCanvas {



  kneeListener: kneeHoverListenerType;
  hoverListener: hoverListenerType;
  histoSVG: SVGElement;
  histoWidth: number;
  histoHeight: number;
  histoBarParent: SVGGElement;
  yAxisDiv: HTMLDivElement;
  yAxisTickTemplate: HTMLDivElement;
  yAxisHoverDiv: HTMLDivElement;
  supportDiv: HTMLDivElement;
  statsList: HTMLDListElement;
  xAxisDiv: HTMLDivElement;
  xAxisTick: HTMLSpanElement;
  hightlightIndicators: {
    x: SVGLineElement,
    y: SVGLineElement,
    point: SVGEllipseElement
  };
  probabilityReadout: HTMLParagraphElement;
  hoverX: number = UNSET;
  hoverY: number = UNSET;
  stepSize: number = MAX_STEP_SIZE;
  isDragging = false;
  formatLabel: typeof safeLabel | null = null;
  stdErrFormatLabel = safeLabel;
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
    const unitDiv = this.container.querySelector(".readout-unit") as HTMLParagraphElement;
    unitDiv.innerHTML = unit;
    this.histoSVG = this.container.querySelector(".histogram svg") as SVGElement;
    this.histoBarParent = this.histoSVG.querySelector(".distribution") as SVGGElement;
    this.histoWidth = UNSET;
    this.histoHeight = UNSET;
    this.yAxisDiv = this.container.querySelector(".axis.y .values") as HTMLDivElement;
    this.yAxisTickTemplate = this.yAxisDiv.querySelector(".value:not(.hover)") as HTMLDivElement;
    this.yAxisHoverDiv = this.yAxisDiv.querySelector(".hover") as HTMLDivElement;
    this.supportDiv = this.container.querySelector(".support") as HTMLDivElement;
    this.statsList = this.supportDiv.querySelector(".summary-stats") as HTMLDListElement;
    this.xAxisDiv = this.container.querySelector(".axis.x") as HTMLDivElement;
    this.xAxisTick = this.xAxisDiv.querySelector(".tick") as HTMLSpanElement;
    this.hightlightIndicators = {
      x: this.svg.querySelector(".highlight.x") as SVGLineElement,
      y: this.svg.querySelector(".highlight.y") as SVGLineElement,
      point: this.svg.querySelector(".highlight.point") as SVGEllipseElement
    };
    this.probabilityReadout = this.container.querySelector(".prob-readout") as HTMLParagraphElement;
    this.svg.addEventListener('pointerdown', event=>{
      this.svg.classList.add('dragging');
      this.isDragging = true;
      this.svg.setPointerCapture(event.pointerId);
      this.handlePointerMove(event);
    });
    this.svg.addEventListener('pointermove', event=>{
      this.handlePointerMove(event);
    });
    this.svg.addEventListener('pointerup', event=>{
      this.svg.classList.remove('dragging');
      this.isDragging = false;
      this.svg.releasePointerCapture(event.pointerId);
    });
    this.svg.addEventListener('pointerleave', ()=>{
      this.hoverListener(UNSET);
    });
    this.histoSVG.addEventListener('pointermove', (event: PointerEvent)=>this.handleHistogramHover(event));
    this.histoSVG.addEventListener('pointerleave', ()=>{
      this.setProbabilityLabel(NO_VALUE);
      this.setReadoutLabel(false, NO_VALUE);
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
    const histoDownloadsDiv = this.container.querySelector(".chart-container:has(.histogram) .download-button") as HTMLDivElement;
    const traceDownloadsDiv = this.container.querySelector(".chart-container:has(.graph) .download-button") as HTMLDivElement;
    // const histoDownloadDataButton = histoDownloadsDiv.querySelector(".chart-container:has(.histogram) .download-text") as HTMLButtonElement;
    // const traceDownloadDataButton = traceDownloadsDiv.querySelector(".chart-container:has(.graph) .download-text") as HTMLButtonElement;
    // const histoDownloadChartButton = histoDownloadsDiv.querySelector(".chart-container:has(.histogram) .download-chart") as HTMLButtonElement;
    // const traceDownloadChartButton = traceDownloadsDiv.querySelector(".chart-container:has(.graph) .download-chart") as HTMLButtonElement;
    copyButton.addEventListener('click', ()=>{
      const stats = (this.traceData as HistData).getStats();
      let data = `${ this.traceData.label }\n`;
      Object.entries(stats).forEach(([key, value])=>{
        const label = SummaryStatLongLabels[key];
        data += `${label}\t${value}\n`}
      );
      navigator.clipboard.writeText(data).then(()=>copyButton.classList.add("completed"));
    });
    // histoDownloadDataButton.addEventListener('click', ()=>{
    histoDownloadsDiv.addEventListener('click', ()=>{
      const text = this.createHistogramDataExport(),
        title = `delphy-${label.toLowerCase()}-distribution-${getTimestampString()}.tsv`;
      downloadTextFile(title, text).then(()=>{
        histoDownloadsDiv.classList.add("completed");
      })
    });
    // histoDownloadChartButton.addEventListener('click', ()=>{
    //   this.createHistogramChartExport().then((pdfDoc: jsPDF)=>{
    //     const title = `delphy-${label.toLowerCase()}-distribution-chart-${getTimestampString()}.pdf`;
    //     pdfDoc.save(title);
    //     histoDownloadsDiv.classList.add("completed");
    //   });
    // });
    // traceDownloadDataButton.addEventListener('click', ()=>{
    traceDownloadsDiv.addEventListener('click', ()=>{
      const text = this.createTraceDataExport(),
        title = `delphy-${label}-traces-${getTimestampString()}.tsv`;
      downloadTextFile(title, text).then(()=>{
        traceDownloadsDiv.classList.add("completed");
      });
    });
    // traceDownloadChartButton.addEventListener('click', ()=>{
    //   this.createTraceChartExport().then((pdfDoc: jsPDF)=>{
    //     const title = `delphy-${label.toLowerCase()}-traces-chart-${getTimestampString()}.pdf`;
    //     pdfDoc.save(title);
    //     traceDownloadsDiv.classList.add("completed");
    //   });
    // })
    copyButton.addEventListener('pointerenter', ()=>copyButton.classList.remove("completed"));
    histoDownloadsDiv.addEventListener('pointerenter', ()=>histoDownloadsDiv.classList.remove("completed"));
    traceDownloadsDiv.addEventListener('pointerenter', ()=>traceDownloadsDiv.classList.remove("completed"));
  }

  setEssExclusion(reason: string) : void {
    console.log(reason);
    const icon = INFO_ICON_TEMPLATE.cloneNode(true) as HTMLAnchorElement;
    icon.setAttribute("title", reason);
    const essLabel = this.statsList.querySelector(`[data-stat="ess"]`) as HTMLDListElement;
    essLabel.appendChild(icon);
  }


  getTreePercentAtY(event:PointerEvent) {
    let pct = UNSET;
    const y = event.offsetY;
    const { height } = this;
    const { count, hideBurnIn, displayCount } = this.traceData as HistData;
    if (y >= 0) {
      pct = y / height;
      const dataHt = count * MAX_STEP_SIZE;
      if (dataHt < height) {
        const undataHt = height - dataHt;
        pct = (y - undataHt) / dataHt;
      } else if (hideBurnIn) {
        /*
        rescale the pct from just the visible trees
        to all the trees.

        what would the height be if we included the burnin?
        */
        const heightWithInvisible = count / displayCount * height;
        const invisibleHeight = heightWithInvisible - height;
        pct = (y + invisibleHeight) / heightWithInvisible;
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

  handleHistogramHover(event:PointerEvent) : void {
    const width = this.width;
    const pct = event.offsetX / width;
    if (pct >= 0 && pct <= 1) {
      /* find the prob at pct */
      const histData = this.traceData as HistData;
      const { displayMin, displayMax, binConfig } = histData;
      let value: number;
      // let prob: number;
      this.hoverX = event.offsetX;
      if (binConfig.isHistogram) {
        value = displayMin + pct * (displayMax - displayMin + 1);
        // const { counts, edges } = binConfig;
        // const total = counts.reduce((tot: number, n: number)=>(n||0)+tot, 0);
        value = Math.floor(value);
        // const index = edges.indexOf(value);
        // prob = counts[index] / total;
        this.drawHistogramSVG(value);

      } else {
        value = displayMin + pct * (displayMax - displayMin);
        const kde = (this.traceData as HistData).distribution.kde as KernelDensityEstimate;
        if (!kde) return;
        // prob = kde.pdf(value);
        this.drawDistributionSVG(value);
      }
      this.setReadoutLabel(false, value);
      // this.setProbabilityLabel(prob);
    }
  }

  handleTreeHighlight(treeIndex: number): void {
    const traceData = this.traceData as HistData;
    traceData.highlightIndex = treeIndex;
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
    const traceData = this.traceData as HistData,
      binConfig = traceData.binConfig;
    let { data, highlightIndex } = traceData,
      kneeIndex = traceData.currentKneeIndex;
    const { hideBurnIn, savedKneeIndex } = traceData;
    let readoutValue = NO_VALUE;
    let isHighlight = false;
    if (highlightIndex !== UNSET) {
      readoutValue = data[highlightIndex];
      isHighlight = true;
    } else if (this.highlightStat !== null && PlottableSummaryStats[this.highlightStat] !== undefined) {
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
    if (binConfig.isHistogram) {
      this.drawHistogramSVG(readoutValue);
    } else {
      this.drawDistributionSVG(readoutValue);
    }
    this.drawYAxisLabels(hideBurnIn, traceData.highlightIndex);
    this.setReadoutLabel(isHighlight, readoutValue);
    this.setStatsReadouts();
  }


  drawTrace(data: number[], kneeIndex: number, highlightIndex: number) {
    const { displayCount, hideBurnIn, displayMin,
      displayMax, binConfig } = this.traceData as HistData;
    const { height } = this;
    const burnInContainer = this.svg.querySelector(".burn-in") as SVGGElement;
    const burnInMarker = burnInContainer.querySelector(".period") as SVGRectElement;
    const burnInTrend = burnInContainer.querySelector(".trend") as SVGPathElement;
    const activeContainer = this.svg.querySelector(".run") as SVGGElement;
    const activeField = activeContainer.querySelector(".period") as SVGRectElement;
    const activeInTrend = activeContainer.querySelector(".trend") as SVGPathElement;


    let width = this.width;

    let burnInHeight = 0;
    let activeHeight = height;
    let activeTop = 0;

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
      if (binConfig.isHistogram) {
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
      activeTop = height - activeHeight;

      trendWeight = Math.min(1, Math.sqrt(height / data.length));

      if (displayMax === displayMin) {
        activePath = `M${width * 0.5} ${height} L${width * 0.5} ${activeTop} `;
        burnInPath = `M${width * 0.5} ${activeTop} L${width * 0.5} ${plotSize} `;
        if (highlightIndex >= 0) {
          hoverX = width * 0.5;
          hoverY = plotSize - highlightIndex * stepSize;
        }
      } else {
        dataScale = width / (valRange || 1);
        const top = Math.max(0, height - (displayCount - 1) * stepSize);
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
          y = top + i * stepSize;
          if (isNaN(n) || !isFinite(n)) {
            x = left;
          } else {
            x = left + (n-displayMin) * dataScale;
          }
          if (first) {
            currentPath = `M${x} ${y} L`;
          } else {
            if (binConfig.isHistogram) {
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
      this.svg.classList.remove("highlighting");
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
      this.svg.classList.add("highlighting");
      const {x, y, point} = this.hightlightIndicators;
      x.setAttribute("x1", `${hoverX}`);
      x.setAttribute("x2", `${hoverX}`);
      x.setAttribute("y1", `0`);
      x.setAttribute("y2", `${this.height}`);
      point.setAttribute("cx", `${hoverX}`);
      y.setAttribute("x1", `0`);
      y.setAttribute("x2", `${this.width}`);
      y.setAttribute("y1", `${hoverY}`);
      y.setAttribute("y2", `${hoverY}`);
      point.setAttribute("cy", `${hoverY}`);
    }

    activeField.setAttribute("height", `${activeHeight}`);
    activeField.setAttribute("y", `${activeTop}`);
    burnInMarker.classList.toggle("hidden", burnInHeight === 0);
    burnInMarker.setAttribute("y1", `${activeTop}`);
    burnInMarker.setAttribute("y2", `${activeTop}`);
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
    const { binConfig, displayMin, displayMax } = traceData as HistData;
    const { edges, counts, maxBinValue, positions, step, isHistogram } = binConfig;
    let valRange = displayMax - displayMin;

    /*
    since burnin might be visible, and the histogram does not include burn-in values,
    we need to calculate how much room the histogram takes.
    */
    const firstValue = edges[0];
    const lastValue = edges[edges.length-1] + step;
    const histoValueRange = lastValue - firstValue;
    const histoSize = histoValueRange / valRange * histoWidth;
    const total = counts.reduce((tot:number, n:number)=>(n||0)+tot, 0)
    let binSize = Math.max(0, histoSize / counts.length);

    if (isHistogram) {
      valRange += step;
      binSize = histoWidth / (valRange);
    }
    let highlightProb = NO_VALUE;
    this.histoBarParent.innerHTML = '';
    counts.forEach((n, i)=>{
      const value = edges[i];
      let nextValue = edges[i + 1];
      if (nextValue === undefined) nextValue = value + step;
      const size = Math.max(0, n / maxBinValue * histoHeight);
      const top = histoHeight - size;
      const bar = BAR_TEMPLATE.cloneNode(true) as SVGRectElement;
      const x = (value - displayMin) / valRange * this.histoWidth;
      bar.setAttribute("x", `${x}`);
      bar.setAttribute("y", `${top}`);
      bar.setAttribute("width", `${binSize}`);
      bar.setAttribute("height", `${size}`);
      if (highlightValue >= value && highlightValue < nextValue) {
        bar.classList.add("highlight");
        highlightProb = n / total;
      } else {
        bar.classList.remove("highlight");
      }
      this.histoBarParent.appendChild(bar);
      positions[i] = x;
    });
    this.setProbabilityLabel(highlightProb);
  }


  drawDistributionSVG(highlightValue: number) {
    const { traceData, histoWidth, histoHeight } = this;
    const { binConfig, displayMin, displayMax, distribution } = traceData as HistData;
    const { bins, counts, edges, positions, step } = binConfig;
    const valRange = displayMax - displayMin;

    /*
    since burnin might be visible, and the histogram does not include burn-in values,
    we need to calculate how much room the histogram takes.
    */
    const firstValue = edges[0];
    const lastValue = edges[edges.length-1] + step;
    const histoValueRange = lastValue - firstValue;
    const histoSize = histoValueRange / valRange * histoWidth;
    const N = counts.length;
    const binSize = Math.max(0, histoSize / N);
    const maxCounts = Math.max.apply(null, counts);
    const sumCounts = counts.reduce((tot, n)=>tot+n, 0);
    const maxBarProb = maxCounts/sumCounts;
    // console.log('drawDistributionSVG', `maxBinValue: ${maxBinValue}, maxCounts: ${maxCounts}, sumCounts: ${sumCounts}, max bar prob: ${maxBarProb}`, this.traceData.label);

    /*
    bins are `pdf` values, and we want `probability` to align with
    the histograms.
    But drawing the distribution just on the bins is not smooth enough.
    Let's do a point per 3 px.
    */
    const minVal = edges[0];
    const maxVal = edges[edges.length-1] + binSize;
    const distStep = (maxVal - minVal) / this.width * 3;
    const probs: number[] = [];
    const values: number[] = [];
    const kde = (traceData as HistData).distribution.kde as KernelDensityEstimate;
    if (kde) {
      for (let val = minVal; val <= maxVal; val+= distStep) {
        const pdf = kde.pdf(val);
        const prob = step * pdf;
        probs.push(prob);
        values.push(val);
      }
    }
    // const probs =  bins.map((pdf, i)=>{
    //   const value = edges[i];
    //   let nextValue = edges[i + 1];
    //   if (nextValue === undefined) nextValue = value + step;
    //   const probability = (nextValue - value) * pdf;
    //   return probability;
    // });
    const maxDistProb = Math.max.apply(null, probs);
    const maxProb = Math.max(maxDistProb, maxBarProb);
    this.histoBarParent.innerHTML = '';

    counts.forEach((n, i)=>{
      const value = edges[i];
      const barProb = Math.max(0, n / sumCounts);
      const size = barProb / maxProb * histoHeight;
      const top = histoHeight - size;
      const bar = BAR_TEMPLATE.cloneNode(true) as SVGRectElement;
      const x = (value - displayMin) / valRange * this.histoWidth;
      bar.setAttribute("x", `${x}`);
      bar.setAttribute("y", `${top}`);
      bar.setAttribute("width", `${binSize}`);
      bar.setAttribute("height", `${size}`);
      this.histoBarParent.appendChild(bar);
      positions[i] = x;
    });


    let d = '';
    // let btot = 0;
    probs.forEach((probability, i)=>{
      const value = values[i];
      const size = Math.max(0, probability / maxProb * histoHeight);
      const top = histoHeight - size;
      const x = (value - displayMin) / valRange * histoWidth;
      if (d === '') {
        d = `M${x} ${top} L `;
      } else {
        d += `${x} ${top} `;
      }
      positions[i] = x;
      // btot += probability;
    });
    // console.log('drawDistributionSVG', `maxBinValue: ${maxBinValue}, maxBinValue: ${maxDistProb}, maxCounts: ${maxCounts}, sumCounts: ${sumCounts}, max bar prob: ${maxBarProb}`, this.traceData.label, `       ${btot}` );
    const path = DISTRIBUTION_TEMPLATE.cloneNode() as SVGPathElement;
    path.setAttribute('d', d);
    this.histoBarParent.appendChild(path);
    if (highlightValue >= displayMin && highlightValue <= displayMax) {
      if (kde) {
        const pdf = kde.pdf(highlightValue);
        const prob = step * pdf;
        const size = Math.max(0, prob / maxProb * histoHeight);
        const top = histoHeight - size;
        const x = (highlightValue - displayMin) / valRange * histoWidth;
        const line = HIGHLIGHT_LINE_TEMPLATE.cloneNode() as SVGLineElement;
        line.setAttribute("x1", `${x}`);
        line.setAttribute("x2", `${x}`);
        line.setAttribute("y1", `${histoHeight}`);
        line.setAttribute("y2", `${top}`);
        this.histoBarParent.appendChild(line);
        this.setProbabilityLabel(prob);
      } else {
        this.setProbabilityLabel(NO_VALUE);
      }
    } else {
      this.setProbabilityLabel(NO_VALUE);
    }
  }






  drawYAxisLabels(hideBurnIn: boolean, highlightIndex: number) {
    const { traceData, hoverY, stepSize, height } = this;
    const { count, savedKneeIndex, displayCount } = traceData as HistData;
    this.yAxisDiv.querySelectorAll(".value:not(.hover)").forEach( (div)=>(div as HTMLDivElement).remove());



    const activeHeight = Math.min((displayCount) * stepSize, height);
    const activeTop = height - activeHeight;
    let tickInterval = 20;
    let targetTickCount = 1;
    if (displayCount >= 80) {
      targetTickCount = Math.ceil(activeHeight / TARGET_LABEL_SPACING);
      if (displayCount % targetTickCount === 0) {
        tickInterval = Math.max(10, nicenum((displayCount + 1) / targetTickCount));
      } else {
        tickInterval = Math.max(10, nicenum(displayCount / targetTickCount));
      }
    }
    const intervalSize = tickInterval * stepSize;
    let tickStart = 0;



    let startY = activeTop;
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
      startY = activeTop + knee2Tick * stepSize;
    }
    let tick = tickStart;
    let y = startY;
    this.svg.querySelectorAll('.tick-bar').forEach( ele=>(ele as SVGLineElement).remove());
    // let actual = 0;
    while (tick < count) {
      // actual++;
      /* make sure this doesn't overlap with the hover */
      if (hoverY === UNSET || Math.abs(hoverY - y) >= TARGET_LABEL_SPACING / 2) {
        this.addYTick(y, tick + 1);
      }
      if (tick === 0) {
        tick += tickInterval - 1;
        const ratio = (tickInterval - 1) / tickInterval;
        y += intervalSize * ratio;
      } else {
        tick += tickInterval;
        y += intervalSize;
      }
    }

    // console.log(`activeHeight  ${activeHeight}, target ${targetTickCount}, size ${displayCount}, result ${tickInterval},   actual ${actual}`)

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
    const tickBar = TICK_BAR_TEMPLATE.cloneNode() as SVGLineElement;
    tickBar.setAttribute("x2", `${this.width}`);
    tickBar.setAttribute("y1", `${y}`);
    tickBar.setAttribute("y2", `${y}`);
    this.svg.insertBefore(tickBar, this.svg.childNodes[0]);
    return div;
  }


  /*
  @param highlightIsSample: is the highlight from hovering a trace?
  or is it from hovering one of the summary statistics?
  */
  setReadoutLabel(highlightIsSample: boolean, value: number) {
    const noValue = value === NO_VALUE;
    this.xAxisTick.classList.toggle("hidden", noValue);
    this.xAxisTick.style.left = `${ this.hoverX }px`;

    // if (highlightIsSample) {
    //   this.xAxisDiv.classList.remove("statsing");
    // } else {
    //   this.xAxisDiv.classList.add("statsing");
    //   const statLabel = this.xAxisDiv.querySelector(".stat-label") as HTMLSpanElement;
    //   if (noValue || this.highlightStat === null) {
    //     statLabel.textContent = '';
    //   } else {
    //     const key = SummaryStat[this.highlightStat] as keyof SummaryStatsType
    //     const label = SummaryStatLongLabels[key];
    //     statLabel.textContent = label;
    //   }
    // }
    let label = '';
    if (!noValue) {
      const formatLabel = this.getReadoutFormatFnc();
      label = formatLabel(value);
    }
    (this.xAxisDiv.querySelector(".readout-value") as HTMLSpanElement).innerHTML = label;
  }

  setProbabilityLabel(value: number) {
    if (value === NO_VALUE) {
      (this.probabilityReadout.querySelector(".readout-value") as HTMLSpanElement).textContent = '';
      this.probabilityReadout.classList.add("inactive");
    } else {
      (this.probabilityReadout.querySelector(".readout-value") as HTMLSpanElement).textContent = safeLabel(value);
      this.probabilityReadout.classList.remove("inactive");
    }
  }

  getReadoutFormatFnc(): typeof safeLabel {
    let formatLabel = this.formatLabel;
    if (formatLabel === null) {
      const stats = (this.traceData as HistData).getStats();
      const p = getDecimalPrecision(stats.stdErrOnMean);
      formatLabel = (n:number)=>n.toLocaleString(undefined, {minimumFractionDigits: p, maximumFractionDigits: p});
    }
    return formatLabel;
  }

  setStatsReadouts() : void {
    const stats = (this.traceData as HistData).getStats();
    const formatLabel = this.getReadoutFormatFnc();
    setTextContent(this.statsList, ".mean", formatLabel(stats.mean));
    setTextContent(this.statsList, ".hpd-min", formatLabel(stats.hpdMin));
    setTextContent(this.statsList, ".hpd-max", formatLabel(stats.hpdMax));
    setTextContent(this.statsList, ".median", formatLabel(stats.median));
    setTextContent(this.statsList, ".stddev", this.stdErrFormatLabel(stats.stdDev));
    setTextContent(this.statsList, ".stderr", this.stdErrFormatLabel(stats.stdErrOnMean));
    setTextContent(this.statsList, ".ess", safeLabel(stats.ess));
    const magNumber = nf000(stats.act);
    if (magNumber) {
      const {n000, magnitudeLabel} = magNumber;
      setTextContent(this.statsList, ".act", `${n000}<span class="pct">${magnitudeLabel}</span>`);
      // console.log(this.className, stats.act, safeLabel(stats.act), `${n000}${magnitudeLabel}`)
    } else {
      /* shouldn't happen, but just in case */
      setTextContent(this.statsList, ".act", safeLabel(stats.act));
    }
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
      const { binConfig } = traceData as HistData;

      if (binConfig.isHistogram) {
        this.drawHistogramSVG(readoutValue);
      } else {
        this.drawDistributionSVG(readoutValue);
      }
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

  createTraceDataExport() : string {
    const traces = (this.traceData as HistData).data,
      steps = this.steps,
      label = this.className;
    let text = `step\t${label}\n`;
    console.assert(traces.length === steps.length);
    traces.forEach((trace, i)=>text += `${steps[i]}\t${trace}\n`);
    return text;
  }


  createTraceChartExport() : Promise<jsPDF> {
    const result = getElementsAndStyles(this.svg);
    return new Promise((resolve)=>{

      const height = this.height;
      const width = this.width;
      const doc = new jsPDF({ // eslint-disable-line new-cap
        unit: "px",
        orientation: "portrait",
        format: [width, height]
      });
      console.log('        createTraceExport', width, height);
      if (result) {
        const {elements, styles } = result;
        elements.forEach((element, i)=>{
          if (element.nodeName === "rect" || element.nodeName === "path") {
            const style = styles[i];
            const fill = style.fill;
            const stroke = style.stroke;
            let drawInstructions: string | null = null;
            if (fill !== "none") {
              doc.setFillColor(fill);
              drawInstructions = 'F';
            }
            if (stroke !== "none") {
              doc.setDrawColor(stroke);
              const strokeWidth = style.strokeWidth;
              doc.setLineWidth(parseFloat(strokeWidth));
              if (drawInstructions !== null) drawInstructions += 'D';
              else drawInstructions = 'S';
            }
            if (element.nodeName === "rect") {
              if (drawInstructions) {
                const rect = element as SVGRectElement;
                console.log(rect.x.baseVal.value * 2, rect.y.baseVal.value * 2, rect.width.baseVal.value * 2, rect.height.baseVal.value * 2, drawInstructions);
                doc.rect(rect.x.baseVal.value * 2, rect.y.baseVal.value * 2, rect.width.baseVal.value * 2, rect.height.baseVal.value * 2, drawInstructions);
              }
            } else if (element.nodeName === "path") {
              const d = (element as SVGPathElement).getAttribute("d") as string;
              console.log(d)
              const tokens = d.split(' ');
              /*
              would prefer to use the jsPdf path command https://artskydj.github.io/jsPDF/docs/jsPDF.html#path,
              since it uses absolute coordinates, but it does not seem to render.
              Instead using lines.
              */
              let lines: number[][] = [];
              let line: number[];
              let n;
              tokens.forEach(t=>{
                n = parseFloat(t);
                const isNumber = !isNaN(n);
                if (!isNumber) {
                  line = [];
                  lines.push(line);
                  if (t.length > 1) {
                    n = parseFloat(t.substring(1));
                    line.push(n)
                  }
                } else if (line.length < 2) {
                  line.push(n)
                } else {
                  line = [n];
                  lines.push(line);
                }
              });
              // console.log(lines.map(arr=>arr.join()));
              lines = lines.filter(coords=>coords.length === 2);
              /*
              jsPDF lines takes relative coordinates,
              so start at the end of the array,
              and find the delta from the previous coordinate
              */
              for (let i = lines.length - 1; i > 0; i--) {
                const coord = lines[i];
                const prev = lines[i-1];
                coord[0] -= prev[0];
                coord[1] -= prev[1];
              }

              if (lines.length > 0) {
                const [x, y] = lines.shift() as number[];
                const scale = [1.0, 1.0];
                const closed = false;
                // console.log(lines.map(arr=>arr.join()));
                doc.lines(lines, x, y, scale, drawInstructions, closed);
              }
            }
          }

        })
      }
      resolve(doc);
    });
  }


  createHistogramDataExport() : string {
    const { binConfig, distribution, isDiscrete } = this.traceData as HistData;
    const { bins, edges, counts } = binConfig;
    const bandwidth = distribution.bandwidth;
    // console.log(distribution)
    const label = this.className;
    let text = `delphy ${label} `;
    // let totProb = 0;
    // let totPdf = 0;
    if (isDiscrete) {
      text += 'discrete values\n';
      text += `bin\tprobability\tcount\n`;
      const total = bins.reduce((tot, n)=>tot + n, 0);
      bins.forEach((count, i)=>{
        const bin = edges[i];
        const probability = count / total;
        // totProb += probability;
        text += `${bin}\t${probability}\t${count}\n`;
      });
    } else {
      text += 'distribution\n';
      text = `bin min\tbin max\tcount\tpercent of total\tsmoothed probability (KDE)\tsmoothed pdf (KDE)\n`;
      const total = counts.reduce((tot, n)=>tot + n, 0);
      bins.forEach((probability, i)=>{
        const binMin = edges[i];
        const binMax = edges[i+ 1] || (binMin + bandwidth);
        const count = counts[i];
        const pct = 100 * count / total;
        const binRange = binMax - binMin;
        const pdf = probability / binRange;
        // totProb += probability;
        // totPdf += pdf;
        text += `${binMin}\t${binMax}\t${count}\t${pct}\t${probability}\t${pdf}\n`;
      });
    }
    // console.debug("total prob", totProb, totPdf);
    return text;
  }


  createHistogramChartExport() : Promise<jsPDF> {
    const result = getElementsAndStyles(this.histoSVG);
    return new Promise((resolve)=>{

      const width = this.histoWidth * 2;
      const height = this.histoHeight * 2;
      const doc = new jsPDF({ // eslint-disable-line new-cap
        unit: "px",
        orientation: "landscape",
        format: [width, height]
      });

      // console.log(`pdf ${width} ${height}`);
      if (result) {
        const {elements, styles } = result;
        elements.forEach((element, i)=>{
          if (element.nodeName === "rect") {
            const rect = element as SVGRectElement;
            const style = styles[i];
            const fill = style.fill;
            let drawInstructions = '';
            if (fill !== "none") {
              doc.setFillColor(fill);
              drawInstructions = 'F';
            }
            const stroke = style.stroke;
            if (stroke !== "none") {
              doc.setDrawColor(stroke);
              const strokeWidth = style.strokeWidth;
              doc.setLineWidth(parseFloat(strokeWidth));
              drawInstructions += 'D';
            }
            doc.rect(rect.x.baseVal.value * 2, rect.y.baseVal.value * 2, rect.width.baseVal.value * 2, rect.height.baseVal.value * 2, drawInstructions);
            // console.log(element, style);
            // console.log(rect.x.baseVal.value, rect.y.baseVal.value, rect.width.baseVal.value, rect.height.baseVal.value, fill, stroke);
          }
        })
      }
      resolve(doc);
    });
  }

}

const setTextContent = (el: HTMLElement, selector: string, label: string) => {
  (el.querySelector(selector) as HTMLSpanElement).innerHTML = label;
}
