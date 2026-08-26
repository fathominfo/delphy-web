import { MutationDistribution } from '../../pythia/mutationdistribution';
import { NodePair, NodeComparisonData, getAncestorType, getDescendantType, NodeCallback } from './lineagescommon';
import { getMutationName, getMutationNameParts } from '../../constants';
import { DisplayNode, getPercentLabel, getNodeTypeName, getNodeColorDark, UNSET, getNodeClassName } from '../common';
import { DistributionSeries, TimeDistributionCanvas } from '../timedistributioncanvas';
import { Mutation } from '../../pythia/delphy_api';
import { HighlightableTimeDistributionCanvas, HoverCallback } from './highlightabletimedistributioncanvas';

const MAX_MUTATIONS_PER_NODE = 5;
const MUT_BOX_HT = 40;
const MUT_BOX_MARGIN = 7.5;

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
  mutationContainerSelector = '.lineages--node-comparison--mutation-list',
  ancestorNodeNameSelector = '.lineages--node-comparison--ancestor-node',
  descendantNodeNameSelector = '.lineages--node-comparison--descendant-node',
  mutationCountSelector = '.lineages--node-comparison--mutation-count',
  showMutationSelector = '.lineages--node-comparison--mutation-header .lnc-mutation-min',
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

  constructor(mutation: MutationDistribution, minDate: number, maxDate: number, goToMutations: MutationFunctionType, isApobecRun: boolean) {
    this.div = mutationTemplate.cloneNode(true) as HTMLDivElement;
    this.div.classList.toggle('is-apobec', mutation.isApobecCtx && isApobecRun);
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
  shownMutationCountSpan: HTMLSpanElement;
  mutationThresholdSpan: HTMLSpanElement;
  nodePair: NodePair;
  nodeTimesCanvas: HighlightableTimeDistributionCanvas;
  minDate: number;
  maxDate: number;
  mutationData: MutationDistribution[];
  mutationTimelines:MutationTimeline[];
  mutationContainer: HTMLDivElement;
  goToMutations: MutationFunctionType;
  ancestorType: DisplayNode;
  descendantType: DisplayNode;
  nodeHighlightCallback: NodeCallback;
  showAllMutsToggleLabel: HTMLLabelElement;
  showAllMutsToggle: HTMLInputElement;
  isApobecRun: boolean;


  constructor(nodeComparisonData : NodeComparisonData, minDate: number, maxDate: number,
    goToMutations: MutationFunctionType, nodeHighlightCallback: NodeCallback, isApobecRun: boolean) {
    this.div = nodeComparisonTemplate.cloneNode(true) as HTMLDivElement;
    this.nodeHighlightCallback = nodeHighlightCallback;
    const mutationContainer = this.div.querySelector(mutationContainerSelector) as HTMLDivElement,
      node1Span = this.div.querySelector(ancestorNodeNameSelector) as HTMLSpanElement,
      node2Span = this.div.querySelector(descendantNodeNameSelector) as HTMLSpanElement,
      mutationCountSpan = this.div.querySelector(mutationCountSelector) as HTMLSpanElement,
      shownMutationCountSpan = this.div.querySelector(showMutationSelector) as HTMLSpanElement,
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
    this.shownMutationCountSpan = shownMutationCountSpan;
    this.mutationThresholdSpan = mutationThresholdSpan;
    this.mutationContainer = mutationContainer;
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.mutationTimelines = [];
    this.mutationData = [];
    this.goToMutations = goToMutations;
    this.isApobecRun = isApobecRun;

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
    this.showAllMutsToggleLabel = this.div.querySelector(".lineages--node-comparison--show-toggle") as HTMLLabelElement;
    this.showAllMutsToggle = this.showAllMutsToggleLabel.querySelector("input") as HTMLInputElement;
    this.showAllMutsToggle.addEventListener("input", ()=>{
      this.mutationContainer.classList.add("windowshading");
      this.requestDraw();
      setTimeout(() => this.mutationContainer.classList.remove("windowshading"), 150);
    });


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
    this.mutationData = this.nodePair.mutations.filter((md:MutationDistribution)=>md.getConfidence() >= mutationPrevalenceThreshold);
    const count = this.mutationData.length;
    this.mutationCountSpan.innerText = `${count} mutation${count === 1 ? '' : 's'}`;
    const shownCount = this.showAllMutsToggle.checked ? count : Math.min(count, MAX_MUTATIONS_PER_NODE);
    this.shownMutationCountSpan.innerText = `${shownCount}`;
    this.showAllMutsToggleLabel.classList.toggle("hidden", shownCount === count);
    let thresholdLabel = `${getPercentLabel(mutationPrevalenceThreshold)}%`;
    if (mutationPrevalenceThreshold < 1.0) {
      thresholdLabel += ' or more'
    }
    this.mutationThresholdSpan.innerText = thresholdLabel;
  }

  requestDraw() : void {
    const count = this.mutationData.length;
    const shownCount = this.showAllMutsToggle.checked ? count : Math.min(count, MAX_MUTATIONS_PER_NODE);
    const mHeight = shownCount * (MUT_BOX_HT + MUT_BOX_MARGIN) - MUT_BOX_MARGIN;
    const alreadyDrawnCount = this.mutationTimelines.length;
    if (alreadyDrawnCount < shownCount) {
      const { minDate, maxDate, goToMutations, isApobecRun } = this;
      this.mutationData.slice(alreadyDrawnCount, shownCount).forEach(md => {
        const mt = new MutationTimeline(md, minDate, maxDate, goToMutations, isApobecRun);
        this.mutationTimelines.push(mt);
      });
    }
    requestAnimationFrame(()=>{
      this.nodeTimesCanvas.draw();
      this.div.querySelectorAll(".lineages--node-comparison--mutation").forEach(tl=>tl.classList.remove("is-last"));
      this.mutationTimelines.slice(alreadyDrawnCount, shownCount).forEach(mt=>{
        mt.appendTo(this.mutationContainer);
        mt.draw();
      });
      this.mutationContainer.style.height = `${mHeight}px`;
      if (shownCount > 0) {
        const lastEntry = this.mutationTimelines[shownCount - 1];
        if (lastEntry) {
          /*
          if we don't have this, the hover label for the series will be
          below the `hidden` bottom of the div. [mark 260826]
          */
          lastEntry.div.classList.add("is-last");
        } else {
          console.debug("The world is full of the unexpected, like how a mutation that you thought should be here, isn't.");
        }
      }
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
  goToMutations: MutationFunctionType, nodeHighlightCallback: NodeCallback, isApobecRun: boolean,
  zoomMinDate: number, zoomMaxDate: number): NodeComparison[] {
  nodeComparisonContainer.innerHTML = '';
  const comps: NodeComparison[] = nodeComparisonData.map(ncd=>{
    const nc = new NodeComparison(ncd, minDate, maxDate, goToMutations, nodeHighlightCallback, isApobecRun);
    nc.setDateRange(zoomMinDate, zoomMaxDate);
    nc.requestDraw();
    return nc;
  });
  return comps;
}

