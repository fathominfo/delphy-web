import { NodeCallback, HoverCallback, OpenMutationPageFncType, NodeTimeDistributionChart, NodeSVGSeriesGroup, NodeDistributionSeries, MATCH_CLASS, NO_MATCH_CLASS } from './lineagescommon';
import { DisplayNode, getPercentLabel, getNodeTypeName, UNSET, getNodeClassName } from '../common';
// import { mutationPrevalenceThreshold, MutationTimelineData, NodeComparisonChartData } from './nodecomparisonchartdata';
import { MutationTimelineData, NodeComparisonChartData } from './nodecomparisonchartdata';
import { toFullDateString } from '../../pythia/dates';


const nodeComparisonTemplate = document.querySelector(".lineages--track-mutations") as HTMLDivElement;
const nodeComparisonContainer = nodeComparisonTemplate?.parentNode as HTMLDivElement;
const mutationTemplate = nodeComparisonTemplate?.querySelector(".lineages--node-comparison--mutation") as HTMLDivElement;
if (!nodeComparisonTemplate || !nodeComparisonContainer || !mutationTemplate) {
  throw new Error("could not find a div to use as a template for node comparisons on the lineage tab");
}

mutationTemplate.remove();
nodeComparisonTemplate.remove();

const mutationChartSelector = '.series-group-container',
  mutationNameSelector = '.lineages--node-comparison--mutation-name',
  mutationPrevalenceSelector = '.lineages--node-comparison--mutation-prevalence span',
  mutationContainerSelector = '.lineages--mutation-timeline',
  ancestorNodeNameSelector = '.lineages--list-ancestor',
  descendantNodeNameSelector = '.lineages--list-descendant',
  schematicSelector = ".schematic";





class MutationTimeline {
  div: HTMLDivElement;
  timeChart: NodeTimeDistributionChart;
  goToMutations: OpenMutationPageFncType;
  data: MutationTimelineData;
  readout: HTMLDivElement;
  dateReadout: HTMLDivElement;
  median: number;

  constructor(data: MutationTimelineData, minDate: number, maxDate: number, goToMutations: OpenMutationPageFncType) {
    this.data = data;
    const {mutation} = data;
    this.div = mutationTemplate.cloneNode(true) as HTMLDivElement;
    this.div.classList.toggle('is-apobec', data.mutation.isApobecCtx && data.isApobecRun);
    this.readout = this.div.querySelector(".time-chart--readout") as HTMLDivElement;
    this.dateReadout = this.readout.querySelector(".time-chart--date") as HTMLDivElement;
    const svg = this.div.querySelector(mutationChartSelector) as SVGElement,
      nameLabel = this.div.querySelector(mutationNameSelector) as HTMLParagraphElement,
      prevalenceLabel = this.div.querySelector(mutationPrevalenceSelector) as HTMLSpanElement;
    if (!nameLabel || !prevalenceLabel) {
      throw new Error('could not find elements for mutation data for node comparison');
    }

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
    this.timeChart = new NodeTimeDistributionChart([], minDate, maxDate, svg, undefined, NodeSVGSeriesGroup);
    this.timeChart.setSeries([series] as NodeDistributionSeries[]);
    this.median = data.series.distribution.median;
    const dateLabel = toFullDateString(this.median);
    this.dateReadout.textContent = dateLabel;

  }

  appendTo(div:HTMLDivElement):void {
    div.appendChild(this.div);
  }

  setDateRange(minDate: number, maxDate: number): void {
    this.timeChart.setDateRange(minDate, maxDate);
  }


  draw(): void {
    this.resize();
    this.timeChart.requestDraw();
    const x = this.timeChart.xFor(this.median, this.timeChart.width);
    this.readout.style.left = `${x}px`;
  }

  resize() {
    this.timeChart.resize();
  }
}





export class NodePairMutationList {
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
    const classList = this.div.classList;
    if (node === UNSET) {
      classList.remove(MATCH_CLASS);
      classList.remove(NO_MATCH_CLASS);
    } else if (node === this.data.ancestorType || node === this.data.descendantType) {
      classList.add(MATCH_CLASS);
      classList.remove(NO_MATCH_CLASS);
    } else {
      classList.remove(MATCH_CLASS);
      classList.add(NO_MATCH_CLASS);
    }
  }

  resize() {
    this.mutationTimelines.forEach(mt => mt.resize());
  }


}






export class NodeMutations {

  goToMutations: OpenMutationPageFncType;
  nodeHighlightCallback: NodeCallback;
  charts: NodePairMutationList[];

  constructor(goToMutations: OpenMutationPageFncType, nodeHighlightCallback: NodeCallback) {
    this.goToMutations = goToMutations;
    this.nodeHighlightCallback = nodeHighlightCallback;
    this.charts = [];
  }


  resize() {
    this.charts.forEach(nc => nc.resize());
  }


  setData(nodeComparisonData: NodeComparisonChartData[]): NodePairMutationList[] {
    nodeComparisonContainer.innerHTML = '';
    const sorted = nodeComparisonData.sort((a, b)=>{
    /* node A goes at the start of the list */
      if (a.descendantType === DisplayNode.nodeA) {
        return -1;
      }
      if (b.descendantType === DisplayNode.nodeA) {
        return 1;
      }
      /* node B comes next */
      if (a.descendantType === DisplayNode.nodeB) {
        return -1;
      }
      if (b.descendantType === DisplayNode.nodeB) {
        return 1;
      }
      /* then the MRCA */
      if (a.descendantType === DisplayNode.mrca) {
        return -1;
      }
      if (b.descendantType === DisplayNode.mrca) {
        return 1;
      }
      /*
    if we have gotten this far, then the only path
    is the one where root is the ancestor and there
    is no descendant.
    */
      return 0;
    });
    this.charts.length = 0;
    sorted.filter(pair=>pair.mutationCount > 0).forEach(chartData=>{
      const nc = new NodePairMutationList(chartData, this.goToMutations, this.nodeHighlightCallback);
      nc.requestDraw();
      this.charts.push(nc);
    });
    return this.charts;
  }

  highlightNode(node: DisplayNode) {
    // console.log(`highlight ${node} `);
    this.charts.forEach(chart=>{
      chart.highlightNode(node);
      chart.highlightNode(node);
    });

  }

}
