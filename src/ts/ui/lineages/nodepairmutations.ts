import { NodeCallback, HoverCallback, OpenMutationPageFncType } from './lineagescommon';
import { DisplayNode, getPercentLabel, getNodeTypeName, UNSET, getNodeClassName } from '../common';
import { TimeDistributionCanvas } from '../timedistributioncanvas';
import { Mutation } from '../../pythia/delphy_api';
import { mutationPrevalenceThreshold, MutationTimelineData, NodeComparisonChartData } from './nodecomparisonchartdata';


const nodeComparisonTemplate = document.querySelector(".lineages--track-mutations") as HTMLDivElement;
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
  mutationContainerSelector = '.lineages--mutation-timeline',
  ancestorNodeNameSelector = '.lineages--list-ancestor',
  descendantNodeNameSelector = '.lineages--list-descendant',
  schematicSelector = ".schematic",
  // mutationCountSelector = '.lineages--node-comparison--mutation-count',
  // mutationThresholdSelector = '.lineages--node-comparison--mutation-threshold',
  nodeTimesCanvasSelector = '.lineages--node-comparison--time-chart canvas';





class MutationTimeline {
  div: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  timeCanvas: TimeDistributionCanvas;
  goToMutations: OpenMutationPageFncType;
  data: MutationTimelineData;

  constructor(data: MutationTimelineData, minDate: number, maxDate: number, goToMutations: OpenMutationPageFncType) {
    this.data = data;
    const {mutation} = data;
    this.div = mutationTemplate.cloneNode(true) as HTMLDivElement;
    this.div.classList.toggle('is-apobec', data.mutation.isApobecCtx && data.isApobecRun);
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
    // const readout = this.div.querySelector(".time-chart--readout") as HTMLElement;
    // this.timeCanvas = new TimeDistributionCanvas([series], minDate, maxDate, canvas, readout);
    this.timeCanvas = new TimeDistributionCanvas([series], minDate, maxDate, canvas);
  }

  appendTo(div:HTMLDivElement):void {
    div.appendChild(this.div);
  }

  setDateRange(zoomMinDate: number, zoomMaxDate: number): void {
    this.timeCanvas.setDateRange(zoomMinDate, zoomMaxDate);
  }


  draw(): void {
    this.timeCanvas.resize();
    this.timeCanvas.requestDraw();
  }

  resize() {
    this.timeCanvas.resize();
  }
}





export class NodePairMutations {
  div: HTMLDivElement;
  nodeASpan: HTMLSpanElement;
  nodeBSpan: HTMLSpanElement;
  // mutationCountSpan: HTMLSpanElement;
  // mutationThresholdSpan: HTMLSpanElement;
  schematic: HTMLDivElement;
  mutationContainer: HTMLDivElement;
  goToMutations: OpenMutationPageFncType;
  nodeHighlightCallback: NodeCallback;
  mutationTimelines: MutationTimeline[] = [];
  data: NodeComparisonChartData;
  ancestorType: DisplayNode;
  descendantType: DisplayNode;


  constructor(data : NodeComparisonChartData, goToMutations: OpenMutationPageFncType, nodeHighlightCallback: NodeCallback) {
    this.data = data;
    this.ancestorType = data.ancestorType;
    this.descendantType = data.descendantType;
    this.div = nodeComparisonTemplate.cloneNode(true) as HTMLDivElement;
    this.nodeHighlightCallback = nodeHighlightCallback;
    const mutationContainer = this.div.querySelector(mutationContainerSelector) as HTMLDivElement,
      nodeASpan = this.div.querySelector(ancestorNodeNameSelector) as HTMLSpanElement,
      nodeBSpan = this.div.querySelector(descendantNodeNameSelector) as HTMLSpanElement,
      schematic = this.div.querySelector(schematicSelector) as HTMLDivElement;
      // mutationCountSpan = this.div.querySelector(mutationCountSelector) as HTMLSpanElement,
      // mutationThresholdSpan = this.div.querySelector(mutationThresholdSelector) as HTMLSpanElement;
      // overlapSpan = this.div.querySelector(".lineages--node-overlap-item") as HTMLSpanElement;
    if (!mutationContainer || !nodeASpan || !nodeBSpan || !schematic) {
      throw new Error("html is missing elements needed for mutation list");
    }
    this.nodeASpan = nodeASpan;
    this.nodeBSpan = nodeBSpan;
    this.schematic = schematic;
    // this.mutationCountSpan = mutationCountSpan;
    // this.mutationThresholdSpan = mutationThresholdSpan;
    this.mutationContainer = mutationContainer;
    this.goToMutations = goToMutations;

    const fromType = getNodeTypeName(this.data.ancestorType).toLowerCase();
    let toType = getNodeTypeName(this.data.descendantType);
    if (toType) toType = toType.toLowerCase();
    this.div.setAttribute("data-from", fromType);
    this.div.setAttribute("data-to", toType);

    let trailAlignment = "center";
    if (this.data.ancestorType === DisplayNode.mrca) {
      trailAlignment = this.data.descendantType === DisplayNode.nodeA ? "up" : "down";
    }
    this.schematic.setAttribute("data-trail-alignment", trailAlignment);



    if (this.data.descendantType === UNSET) {
      this.div.classList.add('single');
    }
    this.setLabel(this.data.ancestorType, this.data.descendantType);
    // const overlapCount = this.data.overlapCount;
    // if (overlapCount > 0) {
    //   const treeCount = this.data.treeCount;
    //   overlapSpan.classList.remove('hidden');
    //   (overlapSpan.querySelector(".lnoi-pct") as HTMLSpanElement).innerText = getPercentLabel(overlapCount / treeCount);
    //   overlapSpan.classList.toggle("is-root", this.data.ancestorType === DisplayNode.root);
    //   overlapSpan.querySelectorAll(".lnoi-1").forEach(item=>{
    //     (item as HTMLSpanElement).innerText = this.nodeASpan.innerText;
    //   });
    //   overlapSpan.querySelectorAll(".lnoi-2").forEach(item=>{
    //     (item as HTMLSpanElement).innerText = this.nodeBSpan.innerText;
    //   });
    // } else {
    //   overlapSpan.classList.add('hidden');
    // }


    const seriesHoverHandler: HoverCallback = (n: number)=>{
      if (n === 0) {
        nodeHighlightCallback(this.data.ancestorType);
      } else if (n === 1) {
        nodeHighlightCallback(this.data.descendantType);
      } else {
        nodeHighlightCallback(UNSET);
      }
    };


    nodeASpan.addEventListener("mouseenter", () => seriesHoverHandler(0));
    nodeASpan.addEventListener("mouseleave", () => seriesHoverHandler(UNSET));
    nodeBSpan.addEventListener("mouseenter", () => seriesHoverHandler(1));
    nodeBSpan.addEventListener("mouseleave", () => seriesHoverHandler(UNSET));

    nodeComparisonContainer.appendChild(this.div);
    this.setMutations();
  }

  setLabel(ancestorType: DisplayNode, descendantType: DisplayNode): void {
    /* set title for the ancestor node */
    this.nodeASpan.innerText = getNodeTypeName(ancestorType);
    this.nodeASpan.classList.add(getNodeClassName(ancestorType));

    /* set title for the descendant node */
    this.nodeBSpan.innerText = getNodeTypeName(descendantType);
    this.nodeBSpan.classList.add(getNodeClassName(descendantType));
  }

  setMutations():void {
    const {mutationTimelineData, mutationCount, minDate, maxDate} = this.data;
    this.mutationTimelines = mutationTimelineData.map((md:MutationTimelineData)=>{
      const mt = new MutationTimeline(md, minDate, maxDate, this.goToMutations);
      mt.appendTo(this.mutationContainer);
      return mt;
    });
    // this.mutationCountSpan.innerText = `${mutationCount} mutation${mutationCount === 1 ? '' : 's'}`;
    // let thresholdLabel = `${getPercentLabel(mutationPrevalenceThreshold)}%`;
    // if (mutationPrevalenceThreshold < 1.0) {
    //   thresholdLabel += ' or more'
    // }
    // this.mutationThresholdSpan.innerText = thresholdLabel;
  }

  requestDraw() : void {
    requestAnimationFrame(()=>{
      this.mutationTimelines.forEach(mt=>mt.draw());
    });
  }


  highlightNode(node: DisplayNode | typeof UNSET) : void {
    this.div.classList.toggle("highlighting", node !== UNSET);

    if (node === UNSET) {
      this.nodeASpan.classList.remove("highlight");
      this.nodeBSpan.classList.remove("highlight");
      return;
    }

    if (node === this.data.ancestorType) {
      this.nodeASpan.classList.add("highlight");
      this.nodeBSpan.classList.remove("highlight");
      return;
    }

    if (node === this.data.descendantType) {
      this.nodeASpan.classList.remove("highlight");
      this.nodeBSpan.classList.add("highlight");
      return;
    }

    /* else, don't have this node */
    this.nodeASpan.classList.remove("highlight");
    this.nodeBSpan.classList.remove("highlight");
  }

  resize() {
    this.mutationTimelines.forEach(mt => mt.resize());
  }

}


export function setMutationLists(nodeComparisonData: NodeComparisonChartData[],
  goToMutations: OpenMutationPageFncType, nodeHighlightCallback: NodeCallback,
  zoomMinDate: number, zoomMaxDate: number): NodePairMutations[] {
  nodeComparisonContainer.innerHTML = '';
  const comps: NodePairMutations[] = nodeComparisonData.map(chartData=>{
    const nc = new NodePairMutations(chartData, goToMutations, nodeHighlightCallback);
    nc.requestDraw();
    return nc;
  });
  return comps;
}

