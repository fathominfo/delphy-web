import { NodeCallback, NodeDisplay, NodeDistribution, NodeSVGSeriesGroup, NodeTimeDistributionChart } from './lineagescommon';
import { DateScale, DisplayNode, getNiceDateInterval, UNSET } from '../common';
import { SeriesHoverCallback } from '../timedistributionchart';
import { toFullDateString } from '../../pythia/dates';
import { Distribution } from '../distribution';

const nodeComparisonContainer = document.querySelector("#lineages--node-timelines") as HTMLDivElement;

const rootSpan = nodeComparisonContainer.querySelector("#lineages-nt-root-label") as HTMLSpanElement,
  mrcaSpan = nodeComparisonContainer.querySelector("#lineages-nt-mrca-label") as HTMLSpanElement,
  nodeASpan = nodeComparisonContainer.querySelector("#lineages-nt-a-label") as HTMLSpanElement,
  nodeBSpan = nodeComparisonContainer.querySelector("#lineages-nt-b-label") as HTMLSpanElement,
  rootDateSpan = nodeComparisonContainer.querySelector("#lineages-nt-root-date-label") as HTMLSpanElement,
  mrcaDateSpan = nodeComparisonContainer.querySelector("#lineages-nt-mrca-date-label") as HTMLSpanElement,
  nodeADateSpan = nodeComparisonContainer.querySelector("#lineages-nt-a-date-label") as HTMLSpanElement,
  nodeBDateSpan = nodeComparisonContainer.querySelector("#lineages-nt-b-date-label") as HTMLSpanElement,
  svg = nodeComparisonContainer.querySelector("svg.series-group-container") as SVGElement,
  dateMarkerContainer = nodeComparisonContainer.querySelector(".timeline") as HTMLDivElement,
  dateMarkerTemplate = dateMarkerContainer.querySelector(".label.reference") as HTMLDivElement,
  dateHoverDiv = nodeComparisonContainer.querySelector(".tracker") as HTMLDivElement,
  maxProbDiv = nodeComparisonContainer.querySelector(".axis.y .max .val") as HTMLDivElement

dateMarkerTemplate.remove();





export class NodeTimelines {
  nodeTimesCanvas: NodeTimeDistributionChart;
  data: NodeDisplay[] = [];
  minDate: number = UNSET;
  maxDate: number = UNSET;
  highlighedtNode: DisplayNode = UNSET;
  highlightedDate: number = UNSET;

  constructor(nodeHighlightCallback: NodeCallback) {

    const seriesHoverHandler: SeriesHoverCallback = (series: Distribution | null, dateIndex: number)=>{
      let nodeType: DisplayNode =  UNSET;
      if (series) {
        nodeType = (series as NodeDistribution).nodeType;
      }
      nodeHighlightCallback(nodeType, dateIndex, null);
    };

    this.nodeTimesCanvas = new NodeTimeDistributionChart([], this.minDate, this.maxDate, svg, seriesHoverHandler, NodeSVGSeriesGroup);

    [ rootSpan, mrcaSpan, nodeASpan, nodeBSpan,
      rootDateSpan, mrcaDateSpan, nodeADateSpan, nodeBDateSpan].forEach(span=>{
      span.addEventListener("mouseleave", () => nodeHighlightCallback(UNSET, UNSET, null));
    });
    [ rootSpan, rootDateSpan].forEach(span=>{
      span.addEventListener("mouseenter", () => nodeHighlightCallback(DisplayNode.root, UNSET, null));
    });
    [ mrcaSpan, mrcaDateSpan].forEach(span=>{
      span.addEventListener("mouseenter", () => nodeHighlightCallback(DisplayNode.mrca, UNSET, null));
    });
    [ nodeASpan, nodeADateSpan].forEach(span=>{
      span.addEventListener("mouseenter", () => nodeHighlightCallback(DisplayNode.nodeA, UNSET, null));
    });
    [ nodeBSpan, nodeBDateSpan].forEach(span=>{
      span.addEventListener("mouseenter", () => nodeHighlightCallback(DisplayNode.nodeB, UNSET, null));
    });
  }

  setDateRange(minDate:number, maxDate:number): void {
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.nodeTimesCanvas.setDateRange(minDate, maxDate);
    dateMarkerContainer.querySelectorAll(".label.reference").forEach(div=>div.remove());
    const { scale, entries } = getNiceDateInterval(minDate, maxDate);
    let first = true;
    if (scale !== DateScale.year) {
      entries.forEach(labelData=>{
        if (first) first = false;
        else if (labelData.isNewYear) {
          const div = dateMarkerTemplate.cloneNode(true) as HTMLDivElement;
          const yearSpan = div.querySelector(".year") as HTMLSpanElement;
          yearSpan.textContent = labelData.yearLabel;
          const left = 100 * labelData.percent;
          div.style.left = `${left}%`;
          dateMarkerContainer.appendChild(div);
        }
      });
    }
  }



  setData(nodes: NodeDisplay[]) {
    this.data = nodes;
    const currentTypes:NodeDisplay[] = [];
    nodes.forEach((nd:NodeDisplay)=>currentTypes[nd.type] = nd);
    [DisplayNode.root, DisplayNode.mrca, DisplayNode.nodeA, DisplayNode.nodeB].forEach(dn=>{
      let nameSpan: HTMLSpanElement | null = null,
        dateSpan: HTMLSpanElement | null = null;
      switch (dn) {
      case DisplayNode.root:
        nameSpan = rootSpan;
        dateSpan = rootDateSpan;
        break;
      case DisplayNode.mrca:
        nameSpan = mrcaSpan;
        dateSpan = mrcaDateSpan;
        break;
      case DisplayNode.nodeA:
        nameSpan = nodeASpan;
        dateSpan = nodeADateSpan;
        break;
      case DisplayNode.nodeB:
        nameSpan = nodeBSpan;
        dateSpan = nodeBDateSpan;
        break;
      }
      if (!nameSpan || !dateSpan) return;
      const nodeData = currentTypes[dn];
      if (nodeData === undefined) {
        nameSpan.classList.add("hidden");
        dateSpan.classList.add("hidden");
      } else {
        const dist = nodeData.series;
        if (!dist) {
          nameSpan.classList.add("hidden");
          dateSpan.classList.add("hidden");
        } else {
          nameSpan.classList.remove("hidden");
          dateSpan.classList.remove("hidden");
          const x = this.nodeTimesCanvas.xFor(dist.median, this.nodeTimesCanvas.width);
          const dateLabel = toFullDateString(dist.median);
          nameSpan.style.left = `${x}px`;
          dateSpan.style.left = `${x}px`;
          dateSpan.textContent = dateLabel;
        }
      }
    });

    const allSeries = nodes.map(n=>n.series).filter(s => s !== null);
    this.nodeTimesCanvas.setSeries(allSeries as NodeDistribution[]);
    console.log(allSeries)
    this.requestDraw();
  }

  requestDraw() : void {
    requestAnimationFrame(()=>{
      const max = this.nodeTimesCanvas.allSeriesBandMax;
      maxProbDiv.textContent = `${max}%`;
      this.nodeTimesCanvas.requestDraw();
    });
  }


  highlightNode(node: DisplayNode, dateIndex: number) : void {
    if (!this.data) return;

    if (node !== this.highlighedtNode) {
      nodeComparisonContainer.classList.toggle("highlighting", node !== UNSET);

      this.nodeTimesCanvas.setMatching(node);


      rootSpan.classList.remove("highlight");
      rootDateSpan.classList.remove("highlight");
      mrcaSpan.classList.remove("highlight");
      mrcaDateSpan.classList.remove("highlight");
      nodeASpan.classList.remove("highlight");
      nodeADateSpan.classList.remove("highlight");
      nodeBSpan.classList.remove("highlight");
      nodeBDateSpan.classList.remove("highlight");
      nodeComparisonContainer.classList.remove("highlighting");
      switch (node) {
      case DisplayNode.root:
        rootSpan.classList.add("highlight");
        rootDateSpan.classList.add("highlight");
        break;
      case DisplayNode.mrca:
        mrcaSpan.classList.remove("highlight");
        mrcaDateSpan.classList.remove("highlight");
        break;
      case DisplayNode.nodeA:
        nodeASpan.classList.remove("highlight");
        nodeADateSpan.classList.remove("highlight");
        break;
      case DisplayNode.nodeB:
        nodeBSpan.classList.remove("highlight");
        nodeBDateSpan.classList.remove("highlight");
        break;
      }
      this.highlighedtNode = node;
    }

    console.log(`dateIndex ${dateIndex}`)

    if (dateIndex !== this.highlightedDate) {
      this.highlightedDate = dateIndex;
      if (dateIndex === UNSET) {
        dateHoverDiv.classList.remove("active");
      } else {
        const pct = 100 * dateIndex / (this.maxDate - this.minDate);
        dateHoverDiv.style.left = `${pct}%`;
        dateHoverDiv.classList.add("active");
      }
    }



  }

  resize() {
    this.nodeTimesCanvas.resize();
  }

}



