import { MutationDistribution } from '../../pythia/mutationdistribution';
import { NodePair, NodeComparisonData, getAncestorType, getDescendantType, NodeCallback } from './lineagescommon';
import { getMutationName, getMutationNameParts } from '../../constants';
import { DisplayNode, getPercentLabel, getNodeTypeName, getNodeColorDark, UNSET, getNodeClassName } from '../common';
import { DistributionSeries, TimeDistributionCanvas } from '../timedistributioncanvas';
import { Mutation } from '../../pythia/delphy_api';
import { HighlightableTimeDistributionCanvas, HoverCallback } from './highlightabletimedistributioncanvas';


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

/* should we provide an interface to this ? [mark 230524]*/
/* adding it for now! [katherine 230608] */
export const mutationPrevalenceThreshold = 0.5;

export type MutationFunctionType = (mutation?: Mutation) => void;


class MutationTimeline {
  div: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mutation: MutationDistribution;
  timeCanvas: TimeDistributionCanvas;
  goToMutations: MutationFunctionType;

  constructor(mutation: MutationDistribution, minDate: number, maxDate: number, goToMutations: MutationFunctionType) {
    this.div = mutationTemplate.cloneNode(true) as HTMLDivElement;
    const canvas = this.div.querySelector(mutationCanvasSelector) as HTMLCanvasElement,
      ctx = canvas?.getContext('2d'),
      nameLabel = this.div.querySelector(mutationNameSelector) as HTMLParagraphElement,
      prevalenceLabel = this.div.querySelector(mutationPrevalenceSelector) as HTMLSpanElement;
    if (!canvas || !ctx || !nameLabel || !prevalenceLabel) {
      throw new Error('could not find elements for mutation data for node comparison');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.mutation = mutation;

    const nameParts = getMutationNameParts(mutation.mutation);
    (nameLabel.querySelector(".allele-from") as HTMLElement).innerText = nameParts[0];
    (nameLabel.querySelector(".site") as HTMLElement).innerText = nameParts[1];
    (nameLabel.querySelector(".allele-to") as HTMLElement).innerText = nameParts[2];
    this.goToMutations = goToMutations;
    nameLabel.addEventListener("click", e => {
      e.preventDefault();
      goToMutations(mutation.mutation);
    });

    prevalenceLabel.innerText = `${ getPercentLabel(mutation.getConfidence()) }%`;
    const name = getMutationName(mutation.mutation),
      className = "mutation",
      series = new DistributionSeries(name, mutation.times, className);
    // this.timeCanvas = new TimeDistributionCanvas([series], minDate, maxDate, canvas);

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
  nodePair: NodePair;
  nodeTimesCanvas: HighlightableTimeDistributionCanvas;
  minDate: number;
  maxDate: number;
  mutationTimelines:MutationTimeline[];
  mutationContainer: HTMLDivElement;
  goToMutations: MutationFunctionType;
  ancestorType: DisplayNode;
  descendantType: DisplayNode;
  nodeHighlightCallback: NodeCallback;

  constructor(nodeComparisonData : NodeComparisonData, minDate: number, maxDate: number,
    goToMutations: MutationFunctionType, nodeHighlightCallback: NodeCallback) {
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
    this.nodePair = nodeComparisonData.nodePair;
    this.node1Span = node1Span;
    this.node2Span = node2Span;
    this.mutationCountSpan = mutationCountSpan;
    this.mutationThresholdSpan = mutationThresholdSpan;
    this.mutationContainer = mutationContainer;
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.mutationTimelines = [];
    this.goToMutations = goToMutations;

    this.ancestorType = getAncestorType(this.nodePair.pairType);
    this.descendantType = getDescendantType(this.nodePair.pairType);

    if (this.descendantType === UNSET) {
      this.div.classList.add('single');
    }
    this.setLabel(this.ancestorType, this.descendantType);
    const overlapCount = nodeComparisonData.overlapCount;
    if (overlapCount > 0) {
      const treeCount = nodeComparisonData.node1Times.length;
      overlapSpan.classList.remove('hidden');
      (overlapSpan.querySelector(".lnoi-pct") as HTMLSpanElement).innerText = getPercentLabel(overlapCount / treeCount);
      overlapSpan.classList.toggle("is-root", this.ancestorType === DisplayNode.root);
      overlapSpan.querySelectorAll(".lnoi-1").forEach(item=>{
        (item as HTMLSpanElement).innerText = this.node1Span.innerText;
      });
      overlapSpan.querySelectorAll(".lnoi-2").forEach(item=>{
        (item as HTMLSpanElement).innerText = this.node2Span.innerText;
      });
    } else {
      overlapSpan.classList.add('hidden');
    }


    this.setMutations();

    const createSeries = (dn: DisplayNode, i: number) => {
      const typeName = getNodeTypeName(dn);
      const times = (i === 0) ? nodeComparisonData.node1Times : nodeComparisonData.node2Times;
      const className = getNodeClassName(dn);
      const color = getNodeColorDark(dn);
      const ds = new DistributionSeries(typeName, times, className, color);
      return ds;
    }
    let series: [DistributionSeries, DistributionSeries?];
    if (this.descendantType === UNSET) {
      series = [this.ancestorType].map(createSeries) as [DistributionSeries];
    } else {
      series = [this.ancestorType, this.descendantType].map(createSeries) as [DistributionSeries, DistributionSeries];
    }

    const seriesHoverHandler: HoverCallback = (n: number)=>{
      if (n === 0) {
        nodeHighlightCallback(this.ancestorType);
      } else if (n === 1) {
        nodeHighlightCallback(this.descendantType);
      } else {
        nodeHighlightCallback(UNSET);
      }
    };
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

  setMutations():void {
    const shownMutations = this.nodePair.mutations.filter((md:MutationDistribution)=>md.getConfidence() >= mutationPrevalenceThreshold),
      count = shownMutations.length,
      minDate = this.minDate,
      maxDate = this.maxDate;
    this.mutationTimelines = shownMutations.map((md:MutationDistribution)=>{
      const mt = new MutationTimeline(md, minDate, maxDate, this.goToMutations);
      mt.appendTo(this.mutationContainer);
      return mt;
    });
    this.mutationCountSpan.innerText = `${count} mutation${count === 1 ? '' : 's'}`;
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

    if (node === this.ancestorType) {
      this.nodeTimesCanvas.highlightAncestor();
      this.node1Span.classList.add("highlight");
      this.node2Span.classList.remove("highlight");
      return;
    }

    if (node === this.descendantType) {
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


export function setComparisons(nodeComparisonData: NodeComparisonData[], minDate: number, maxDate: number,
  goToMutations: MutationFunctionType, nodeHighlightCallback: NodeCallback,
  zoomMinDate: number, zoomMaxDate: number): NodeComparison[] {
  nodeComparisonContainer.innerHTML = '';
  const comps: NodeComparison[] = nodeComparisonData.map(ncd=>{
    const nc = new NodeComparison(ncd, minDate, maxDate, goToMutations, nodeHighlightCallback);
    nc.setDateRange(zoomMinDate, zoomMaxDate);
    nc.requestDraw();
    return nc;
  });
  return comps;
}

