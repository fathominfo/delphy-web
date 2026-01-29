import { HoverCallback, OpenMutationPageFncType, NodeTimeDistributionChart,
  NodeSVGSeriesGroup, NodeDistribution, MATCH_CLASS, NO_MATCH_CLASS
} from './lineagescommon';
import { DisplayNode, getPercentLabel, getNodeTypeName, UNSET, getNodeClassName,
  numericSort, getNiceDateInterval, DateScale } from '../common';
// import { mutationPrevalenceThreshold, MutationTimelineData, NodeComparisonChartData } from './nodecomparisonchartdata';
import { MutationTimelineData, NodeComparisonChartData } from './nodecomparisonchartdata';
import { toFullDateString } from '../../pythia/dates';
import { Mutation } from '../../pythia/delphy_api';
import { SeriesHoverCallback } from '../timedistributionchart';
import { Distribution } from '../distribution';
import { getMutationName } from '../../constants';


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

  constructor(data: MutationTimelineData, minDate: number, maxDate: number,
    goToMutations: OpenMutationPageFncType, hoverCallback: SeriesHoverCallback) {
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
    this.timeChart = new NodeTimeDistributionChart([], minDate, maxDate, svg, hoverCallback, NodeSVGSeriesGroup);
    this.timeChart.setSeries([series] as NodeDistribution[]);
    this.median = data.series.median;
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
  dateHoverDiv: HTMLDivElement;
  goToMutations: OpenMutationPageFncType;
  nodeHighlightCallback: HoverCallback;
  mutationTimelines: MutationTimeline[] = [];
  data: NodeComparisonChartData;
  ancestorType: DisplayNode;
  descendantType: DisplayNode;


  constructor(data : NodeComparisonChartData, goToMutations: OpenMutationPageFncType, nodeHighlightCallback: HoverCallback) {
    this.data = data;
    this.ancestorType = data.ancestorType;
    this.descendantType = data.descendantType;
    this.div = nodeComparisonTemplate.cloneNode(true) as HTMLDivElement;
    this.dateHoverDiv = this.div.querySelector(".dates .reference") as HTMLDivElement;
    this.nodeHighlightCallback = nodeHighlightCallback;
    const mutationContainer = this.div.querySelector(mutationContainerSelector) as HTMLDivElement,
      ancestorSpan = this.div.querySelector(ancestorNodeNameSelector) as HTMLSpanElement,
      descendantSpan = this.div.querySelector(descendantNodeNameSelector) as HTMLSpanElement,
      schematic = this.div.querySelector(schematicSelector) as HTMLDivElement;
      // mutationCountSpan = this.div.querySelector(mutationCountSelector) as HTMLSpanElement,
      // mutationThresholdSpan = this.div.querySelector(mutationThresholdSelector) as HTMLSpanElement;
      // overlapSpan = this.div.querySelector(".lineages--node-overlap-item") as HTMLSpanElement;
    if (!mutationContainer || !ancestorSpan || !descendantSpan || !schematic) {
      throw new Error("html is missing elements needed for mutation list");
    }
    this.nodeASpan = ancestorSpan;
    this.nodeBSpan = descendantSpan;
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
    this.setDateRange();
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



    // ancestorSpan.addEventListener("mouseenter", () => nodeHighlightCallback(this.data.ancestorType, UNSET, null));
    // ancestorSpan.addEventListener("mouseleave", () => nodeHighlightCallback(UNSET, UNSET, null));
    // descendantSpan.addEventListener("mouseenter", () => nodeHighlightCallback(this.data.descendantType, UNSET, null));
    // descendantSpan.addEventListener("mouseleave", () => nodeHighlightCallback(UNSET, UNSET, null));

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


  /* set the date range based on the median dates for the bordering nodes */
  setDateRange() {
    const { minDate, maxDate, series } = this.data;
    const dateContainerDiv = this.div.querySelector(".date-container .dates") as HTMLDivElement;
    const rangeSpan = series.filter(ser=>!!ser).map(ser=>ser.median);
    rangeSpan.sort(numericSort);
    const rangeMin = rangeSpan[0];
    const rangeMax = rangeSpan[rangeSpan.length - 1] as number;
    const rangeMinPct = (rangeMin - minDate)/(maxDate - minDate) * 100;
    const rangeMaxPct = (rangeMax - minDate)/(maxDate - minDate) * 100;
    const rangeWidthPct = rangeMaxPct - rangeMinPct;
    const rangeDiv = dateContainerDiv.querySelector(".range") as HTMLDivElement;
    rangeDiv.style.left = `${rangeMinPct}%`;
    rangeDiv.style.width = `${rangeWidthPct}%`;

    const template = this.dateHoverDiv.cloneNode(true) as HTMLDivElement;
    template.classList.remove("hover");

    const { scale, entries } = getNiceDateInterval(minDate, maxDate);
    let first = true;
    if (scale !== DateScale.year) {
      entries.forEach(labelData=>{
        if (first) first = false;
        else if (labelData.isNewYear) {
          const div = template.cloneNode(true) as HTMLDivElement;
          const left = 100 * labelData.percent;
          div.style.left = `${left}%`;
          dateContainerDiv.appendChild(div);
        }
      });
    }
  }


  setMutations():void {
    // const {mutationTimelineData, mutationCount, minDate, maxDate} = this.data;
    const {descendantType, mutationTimelineData, minDate, maxDate} = this.data;
    this.mutationTimelines = mutationTimelineData.map((md:MutationTimelineData)=>{
      const seriesCallback = (_series: Distribution | null, dateIndex: number)=>{
        this.nodeHighlightCallback(descendantType, dateIndex, md.mutation.mutation);
      };
      const mt = new MutationTimeline(md, minDate, maxDate, this.goToMutations, seriesCallback);
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


  highlightNode(node: DisplayNode, dateIndex: number, mutation: Mutation | null) : void {
    const classList = this.div.classList;
    if (node === UNSET) {
      classList.remove(MATCH_CLASS);
      classList.remove(NO_MATCH_CLASS);
    } else if (node === this.data.descendantType) {
      classList.add(MATCH_CLASS);
      classList.remove(NO_MATCH_CLASS);
      this.mutationTimelines.forEach(mt=>{
        if (mt.data.mutation.mutation === mutation) {
          console.log(`
            match found ${getMutationName(mutation)} ${dateIndex}            
            `)
        }
      });
    } else {
      classList.remove(MATCH_CLASS);
      classList.add(NO_MATCH_CLASS);
    }


    if (dateIndex === UNSET) {
      this.dateHoverDiv.classList.remove("active");
    } else {

      const { minDate, maxDate } = this.data;
      // const datePercent = (dateIndex - minDate) / (maxDate - minDate) * 100;
      const datePercent = dateIndex / (maxDate - minDate) * 100;
      this.dateHoverDiv.style.left = `${datePercent}`;
      this.dateHoverDiv.classList.add("active");
    }
  }

  resize() {
    this.mutationTimelines.forEach(mt => mt.resize());
  }


}






export class NodeMutations {

  goToMutations: OpenMutationPageFncType;
  nodeHighlightCallback: HoverCallback;
  charts: NodePairMutationList[];

  constructor(goToMutations: OpenMutationPageFncType, nodeHighlightCallback: HoverCallback) {
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

  highlightNode(node: DisplayNode, dateIndex: number, mutation: Mutation|null) {
    // console.log(`highlight ${node} `);
    this.charts.forEach(chart=>{
      chart.highlightNode(node, dateIndex, mutation);
    });

  }

}
