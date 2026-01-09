import { NodeComparisonData, NodeCallback } from './lineagescommon';
import { DisplayNode, getPercentLabel, getNodeTypeName, getNodeColorDark, UNSET, getNodeClassName } from '../common';
import { TimeDistributionCanvas } from '../timedistributioncanvas';
import { Mutation } from '../../pythia/delphy_api';
import { HighlightableTimeDistributionCanvas, HoverCallback } from './highlightabletimedistributioncanvas';
import { mutationPrevalenceThreshold, MutationTimelineData, NodeComparisonChartData } from './nodecomparisonchartdata';


const nodeComparisonTemplate = document.querySelector(".lineages--node-comparison") as HTMLDivElement;
const nodeComparisonContainer = nodeComparisonTemplate?.parentNode as HTMLDivElement;
const mutationTemplate = nodeComparisonTemplate?.querySelector(".lineages--node-comparison--mutation") as HTMLDivElement;
if (!nodeComparisonTemplate || !nodeComparisonContainer || !mutationTemplate) {
  throw new Error("could not find a div to use as a template for node comparisons on the lineage tab");
}

mutationTemplate.remove();
nodeComparisonTemplate.remove();

const mutationCanvasSelector = '.lineages--mutation-time-chart',
  mutationNameSelector = '.lineages--node-comparison--mutation-name',
  mutationPrevalenceSelector = '.lineages--node-comparison--mutation-prevalence span',
  mutationContainerSelector = '.lineages--node-comparison--time-chart-container',
  ancestorNodeNameSelector = '.lineages--node-comparison--ancestor-node',
  descendantNodeNameSelector = '.lineages--node-comparison--descendant-node',
  mutationCountSelector = '.lineages--node-comparison--mutation-count',
  mutationThresholdSelector = '.lineages--node-comparison--mutation-threshold',
  nodeTimesCanvasSelector = '.lineages--node-comparison--time-chart canvas';


export type MutationFunctionType = (mutation?: Mutation) => void;


class MutationTimeline {
  div: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  timeCanvas: TimeDistributionCanvas;
  goToMutations: MutationFunctionType;
  data: MutationTimelineData;

  constructor(data: MutationTimelineData, minDate: number, maxDate: number, goToMutations: MutationFunctionType, isApobecRun: boolean) {
    this.data = data;
    const {mutation} = data;
    this.div = mutationTemplate.cloneNode(true) as HTMLDivElement;
    this.div.classList.toggle('is-apobec', data.mutation.isApobecCtx && isApobecRun);
    const canvas = this.div.querySelector(mutationCanvasSelector) as HTMLCanvasElement,
      ctx = canvas?.getContext('2d'),
      nameLabel = this.div.querySelector(mutationNameSelector) as HTMLParagraphElement,
      prevalenceLabel = this.div.querySelector(mutationPrevalenceSelector) as HTMLSpanElement;
    if (!canvas || !ctx || !nameLabel || !prevalenceLabel) {
      throw new Error('could not find elements for mutation data for node comparison');
    }
    this.canvas = canvas;
    this.ctx = ctx;


    const {nameParts, series} = this.data;

    (nameLabel.querySelector(".allele-from") as HTMLElement).innerText = nameParts[0];
    (nameLabel.querySelector(".site") as HTMLElement).innerText = nameParts[1];
    (nameLabel.querySelector(".allele-to") as HTMLElement).innerText = nameParts[2];
    this.goToMutations = goToMutations;
    nameLabel.addEventListener("click", e => {
      e.preventDefault();
      goToMutations(mutation.mutation);
    });

    prevalenceLabel.innerText = `${ getPercentLabel(mutation.getConfidence()) }%`;
    const readout = this.div.querySelector(".time-chart--readout") as HTMLElement;
    this.timeCanvas = new TimeDistributionCanvas([series], minDate, maxDate, canvas, readout);
  }

  appendTo(div:HTMLDivElement):void {
    div.appendChild(this.div);
  }

  setDateRange(zoomMinDate: number, zoomMaxDate: number): void {
    this.timeCanvas.setDateRange(zoomMinDate, zoomMaxDate);
  }


  draw(): void {
    this.timeCanvas.resize();
    this.timeCanvas.draw();
  }

  resize() {
    this.timeCanvas.resize();
  }
}





export class NodeComparison {
  div: HTMLDivElement;
  node1Span: HTMLSpanElement;
  node2Span: HTMLSpanElement;
  mutationCountSpan: HTMLSpanElement;
  mutationThresholdSpan: HTMLSpanElement;
  nodeTimesCanvas: HighlightableTimeDistributionCanvas;
  mutationContainer: HTMLDivElement;
  goToMutations: MutationFunctionType;
  nodeHighlightCallback: NodeCallback;
  mutationTimelines: MutationTimeline[] = [];
  data: NodeComparisonChartData;

  constructor(data : NodeComparisonChartData, goToMutations: MutationFunctionType, nodeHighlightCallback: NodeCallback) {
    this.data = data;
    this.div = nodeComparisonTemplate.cloneNode(true) as HTMLDivElement;
    this.nodeHighlightCallback = nodeHighlightCallback;
    const mutationContainer = this.div.querySelector(mutationContainerSelector) as HTMLDivElement,
      node1Span = this.div.querySelector(ancestorNodeNameSelector) as HTMLSpanElement,
      node2Span = this.div.querySelector(descendantNodeNameSelector) as HTMLSpanElement,
      mutationCountSpan = this.div.querySelector(mutationCountSelector) as HTMLSpanElement,
      mutationThresholdSpan = this.div.querySelector(mutationThresholdSelector) as HTMLSpanElement,
      canvas = this.div.querySelector(nodeTimesCanvasSelector) as HTMLCanvasElement,
      overlapSpan = this.div.querySelector(".lineages--node-overlap-item") as HTMLSpanElement,
      readout = this.div.querySelector(".time-chart--readout") as HTMLElement;
    if (!mutationContainer || !node1Span || !node2Span || !mutationCountSpan || !mutationThresholdSpan || !canvas) {
      throw new Error("html is missing elements needed for node comparison");
    }
    this.node1Span = node1Span;
    this.node2Span = node2Span;
    this.mutationCountSpan = mutationCountSpan;
    this.mutationThresholdSpan = mutationThresholdSpan;
    this.mutationContainer = mutationContainer;
    this.goToMutations = goToMutations;


    if (this.data.descendantType === UNSET) {
      this.div.classList.add('single');
    }
    this.setLabel(this.data.ancestorType, this.data.descendantType);
    const overlapCount = this.data.overlapCount;
    if (overlapCount > 0) {
      const treeCount = this.data.treeCount;
      overlapSpan.classList.remove('hidden');
      (overlapSpan.querySelector(".lnoi-pct") as HTMLSpanElement).innerText = getPercentLabel(overlapCount / treeCount);
      overlapSpan.classList.toggle("is-root", this.data.ancestorType === DisplayNode.root);
      overlapSpan.querySelectorAll(".lnoi-1").forEach(item=>{
        (item as HTMLSpanElement).innerText = this.node1Span.innerText;
      });
      overlapSpan.querySelectorAll(".lnoi-2").forEach(item=>{
        (item as HTMLSpanElement).innerText = this.node2Span.innerText;
      });
    } else {
      overlapSpan.classList.add('hidden');
    }


    const seriesHoverHandler: HoverCallback = (n: number)=>{
      if (n === 0) {
        nodeHighlightCallback(this.data.ancestorType);
      } else if (n === 1) {
        nodeHighlightCallback(this.data.descendantType);
      } else {
        nodeHighlightCallback(UNSET);
      }
    };
    const {series, minDate, maxDate} = this.data;
    // this.nodeTimesCanvas = new HighlightableTimeDistributionCanvas(series, minDate, maxDate, canvas, seriesHoverHandler);
    this.nodeTimesCanvas = new HighlightableTimeDistributionCanvas(series, minDate, maxDate, canvas, readout, seriesHoverHandler);

    node1Span.addEventListener("mouseenter", () => seriesHoverHandler(0));
    node1Span.addEventListener("mouseleave", () => seriesHoverHandler(UNSET));
    node2Span.addEventListener("mouseenter", () => seriesHoverHandler(1));
    node2Span.addEventListener("mouseleave", () => seriesHoverHandler(UNSET));

    nodeComparisonContainer.appendChild(this.div);
    this.nodeTimesCanvas.resize();
  }

  setLabel(ancestorType: DisplayNode, descendantType: DisplayNode): void {
    /* set title for the ancestor node */
    this.node1Span.innerText = getNodeTypeName(ancestorType);
    this.node1Span.classList.add(getNodeClassName(ancestorType));

    /* set title for the descendant node */
    this.node2Span.innerText = getNodeTypeName(descendantType);
    this.node2Span.classList.add(getNodeClassName(descendantType));
  }

  setMutations(isApobecRun: boolean):void {
    const {mutationTimelineData, mutationCount, minDate, maxDate} = this.data;
    this.mutationTimelines = mutationTimelineData.map((md:MutationTimelineData)=>{
      const mt = new MutationTimeline(md, minDate, maxDate, this.goToMutations, isApobecRun);
      mt.appendTo(this.mutationContainer);
      return mt;
    });
    this.mutationCountSpan.innerText = `${mutationCount} mutation${mutationCount === 1 ? '' : 's'}`;
    let thresholdLabel = `${getPercentLabel(mutationPrevalenceThreshold)}%`;
    if (mutationPrevalenceThreshold < 1.0) {
      thresholdLabel += ' or more'
    }
    this.mutationThresholdSpan.innerText = thresholdLabel;
  }

  requestDraw() : void {
    requestAnimationFrame(()=>{
      this.nodeTimesCanvas.draw();
      this.mutationTimelines.forEach(mt=>mt.draw());
    });
  }


  setDateRange(zoomMinDate: number, zoomMaxDate: number): void {
    this.nodeTimesCanvas.setDateRange(zoomMinDate, zoomMaxDate);
    this.mutationTimelines.forEach(mt=>mt.setDateRange(zoomMinDate, zoomMaxDate));
  }

  highlightNode(node: DisplayNode | typeof UNSET) : void {
    this.div.classList.toggle("highlighting", node !== UNSET);

    if (node === UNSET) {
      this.nodeTimesCanvas.resetHighlight();
      this.node1Span.classList.remove("highlight");
      this.node2Span.classList.remove("highlight");
      return;
    }

    if (node === this.data.ancestorType) {
      this.nodeTimesCanvas.highlightAncestor();
      this.node1Span.classList.add("highlight");
      this.node2Span.classList.remove("highlight");
      return;
    }

    if (node === this.data.descendantType) {
      this.nodeTimesCanvas.highlightDescendant();
      this.node1Span.classList.remove("highlight");
      this.node2Span.classList.add("highlight");
      return;
    }

    /* else, don't have this node */
    this.nodeTimesCanvas.lowlight();
    this.node1Span.classList.remove("highlight");
    this.node2Span.classList.remove("highlight");
  }

  resize() {
    this.nodeTimesCanvas.resize();
    this.mutationTimelines.forEach(mt => mt.resize());
  }

}


export function setComparisons(nodeComparisonData: NodeComparisonChartData[],
  goToMutations: MutationFunctionType, nodeHighlightCallback: NodeCallback,
  zoomMinDate: number, zoomMaxDate: number): NodeComparison[] {
  nodeComparisonContainer.innerHTML = '';
  const comps: NodeComparison[] = nodeComparisonData.map(chartData=>{
    const nc = new NodeComparison(chartData, goToMutations, nodeHighlightCallback);
    nc.setDateRange(zoomMinDate, zoomMaxDate);
    nc.requestDraw();
    return nc;
  });
  return comps;
}

