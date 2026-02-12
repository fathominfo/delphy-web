import { HoverCallback, OpenMutationPageFncType, NodeTimeDistributionChart,
  NodeSVGSeriesGroup, MATCH_CLASS, NO_MATCH_CLASS
} from './lineagescommon';
import { getPercentLabel, UNSET,
  getNiceDateInterval, DateScale,
  sameMutation} from '../common';
// import { mutationPrevalenceThreshold, MutationTimelineData, NodeComparisonChartData } from './nodecomparisonchartdata';
import { MutationTimelineData, NodeMutationsData } from './nodemutationsdata';
import { toFullDateString } from '../../pythia/dates';
import { Mutation } from '../../pythia/delphy_api';
import { SeriesHoverCallback } from '../timedistributionchart';
import { Distribution } from '../distribution';
import { DisplayNode } from './displaynode';



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
    this.timeChart.setSeries([series]);
    this.median = series.median;
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

  checkMutationMatch(mutation: Mutation | null, date: number): boolean {
    let matched = false;
    if (mutation === null && date === UNSET) {
      this.div.classList.remove("matching");
      this.div.classList.remove("unmatching");
    } else if (mutation !== null) {
      if (sameMutation (this.data.mutation.mutation, mutation)) {
        this.div.classList.add("matching");
        this.div.classList.remove("unmatching");
        matched = true;
      } else {
        this.div.classList.remove("matching");
        this.div.classList.add("unmatching");
      }
    } else if (date !== UNSET) {
      const { min, max } = this.data.series
      const matching = date >= min && date <= max;
      this.div.classList.toggle("matching", matching);
      this.div.classList.toggle("unmatching", !matching);
      if (matching) matched = true;
    }
    return matched;
  }

}







export class NodePairMutationList {
  div: HTMLDivElement;
  ancestorSpan: HTMLSpanElement;
  descendantSpan: HTMLSpanElement;
  // mutationCountSpan: HTMLSpanElement;
  // mutationThresholdSpan: HTMLSpanElement;
  schematic: HTMLDivElement;
  mutationContainer: HTMLDivElement;
  dateHoverDiv: HTMLDivElement;
  goToMutations: OpenMutationPageFncType;
  nodeHighlightCallback: HoverCallback;
  mutationTimelines: MutationTimeline[] = [];
  data: NodeMutationsData;
  ancestorType: DisplayNode;
  descendantType: DisplayNode;


  constructor(data : NodeMutationsData, goToMutations: OpenMutationPageFncType, nodeHighlightCallback: HoverCallback) {
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
    this.ancestorSpan = ancestorSpan;
    this.descendantSpan = descendantSpan;
    this.schematic = schematic;

    // this.mutationCountSpan = mutationCountSpan;
    // this.mutationThresholdSpan = mutationThresholdSpan;
    this.mutationContainer = mutationContainer;
    this.goToMutations = goToMutations;

    const fromType = this.data.ancestorType.name.toLowerCase();
    let toType = this.data.descendantType?.name;
    if (toType) toType = toType.toLowerCase();
    this.div.setAttribute("data-from", fromType);
    this.div.setAttribute("data-to", toType || '');

    const trailAlignment = "center";
    // if (this.data.ancestorType === DisplayNodeClass.mrca) {
    //   trailAlignment = this.data.descendantType === DisplayNodeClass.nodeA ? "up" : "down";
    // }
    this.schematic.setAttribute("data-trail-alignment", trailAlignment);



    if (this.data.descendantType === null) {
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
    this.ancestorSpan.innerText = ancestorType.name;
    this.ancestorSpan.classList.add(ancestorType.className);

    // /* set title for the descendant node */
    if (descendantType !== null) {
      this.descendantSpan.innerText = descendantType.name;
      this.descendantSpan.classList.add(descendantType.className);
    }
  }


  /* set the date range based on the median dates for the bordering nodes */
  setDateRange() {
    const { minDate, maxDate, ancestorMedianDate, descendantMedianDate } = this.data;
    const dateContainerDiv = this.div.querySelector(".date-container .dates") as HTMLDivElement;
    const rangeMinPct = (ancestorMedianDate - minDate)/(maxDate - minDate) * 100;
    const rangeMaxPct = (descendantMedianDate - minDate)/(maxDate - minDate) * 100;
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
      const seriesCallback = (_seriesIndex: number, date: number)=>{
        this.nodeHighlightCallback(descendantType, date, md.mutation.mutation);
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


  highlightNode(node: DisplayNode | null, date: number, mutation: Mutation | null) : void {
    const classList = this.div.classList;
    let matched = node === this.data.descendantType;
    this.mutationTimelines.forEach(mt=>{
      matched = mt.checkMutationMatch(mutation, date) || matched;
    });
    if (node === null) {
      classList.remove(MATCH_CLASS);
      classList.remove(NO_MATCH_CLASS);
    } else if (matched) {
      classList.add(MATCH_CLASS);
      classList.remove(NO_MATCH_CLASS);
    } else {
      classList.remove(MATCH_CLASS);
      classList.add(NO_MATCH_CLASS);
    }

    // set the hover
    if (date === UNSET) {
      this.dateHoverDiv.classList.remove("active");
    } else {
      const { minDate, maxDate } = this.data;
      const datePercent = (date - minDate) / (maxDate - minDate) * 100;
      this.dateHoverDiv.style.left = `${datePercent}%`;
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


  setData(nodeComparisonData: NodeMutationsData[]): NodePairMutationList[] {
    nodeComparisonContainer.innerHTML = '';
    const sorted = nodeComparisonData.sort((a, b)=>{
      let diff = a.ancestorType.generationsFromRoot - b.ancestorType.generationsFromRoot;
      if (diff === 0) {
        if (a.descendantType === null) {
          diff = 1;
        } else if (b.descendantType === null) {
          diff = -1;
        } else {
          diff = a.descendantType.generationsFromRoot - b.descendantType.generationsFromRoot;
        }
      }
      return diff;
    });
    this.charts.length = 0;
    sorted.filter(pair=>pair.mutationCount > 0).forEach(chartData=>{
      // console.log('NodePairMutationList', chartData)
      const nc = new NodePairMutationList(chartData, this.goToMutations, this.nodeHighlightCallback);
      nc.requestDraw();
      this.charts.push(nc);
    });
    return this.charts;
  }

  highlightNode(node: DisplayNode | null, date: number, mutation: Mutation|null) {
    // console.log(`highlight ${node} `);
    this.charts.forEach(chart=>{
      chart.highlightNode(node, date, mutation);
    });

  }

}
