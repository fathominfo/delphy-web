import { HoverCallback, NodeDisplay, NodeDistribution, NodeSVGSeriesGroup, NodeTimeDistributionChart } from './lineagescommon';
import { DateScale, getNiceDateInterval, UNSET } from '../common';
import { SeriesHoverCallback } from '../timedistributionchart';
import { toFullDateString } from '../../pythia/dates';
import { Distribution } from '../distribution';
import { DisplayNode } from '../displaynode';

const nodeComparisonContainer = document.querySelector("#lineages--node-timelines") as HTMLDivElement;

const svg = nodeComparisonContainer.querySelector("svg.series-group-container") as SVGElement,
  dateMarkerContainer = nodeComparisonContainer.querySelector(".timeline") as HTMLDivElement,
  dateMarkerTemplate = dateMarkerContainer.querySelector(".label.reference") as HTMLDivElement,
  dateHoverDiv = nodeComparisonContainer.querySelector(".tracker") as HTMLDivElement,
  maxProbDiv = nodeComparisonContainer.querySelector(".axis.y .max .val") as HTMLDivElement;


const nameSpanTemplate = nodeComparisonContainer.querySelector(".support .tag") as HTMLSpanElement;
const dateSpanTemplate = nodeComparisonContainer.querySelector(".label.date") as HTMLSpanElement;
nameSpanTemplate.classList.remove("root");
dateSpanTemplate.classList.remove("root");
const nameLabelContainer = nameSpanTemplate.parentNode as HTMLDivElement;
const dateLabelContainer = dateSpanTemplate.parentNode as HTMLDivElement;
nameSpanTemplate.remove();
dateSpanTemplate.remove();


dateMarkerTemplate.remove();


class NodeLabels {
  nameSpan: HTMLSpanElement;
  dateSpan: HTMLSpanElement;
  className: string;
  index: number;

  constructor(dn: DisplayNode, hoverCallback: HoverCallback) {
    this.index = dn.index;
    this.className = dn.className;
    this.nameSpan = nameSpanTemplate.cloneNode(true) as HTMLSpanElement;
    this.dateSpan = dateSpanTemplate.cloneNode(true) as HTMLSpanElement;
    nameLabelContainer?.appendChild(this.nameSpan);
    dateLabelContainer?.appendChild(this.dateSpan);
    [this.nameSpan, this.dateSpan].forEach(span=>{
      span.classList.add(this.className);
      span.setAttribute("data-index", `${this.index}`);
      span.addEventListener("pointerenter", () => hoverCallback(dn, UNSET, null))
      span.addEventListener("mouseleave", () => hoverCallback(null, UNSET, null));
    });
    this.nameSpan.textContent = dn.name;
  }

  hide() {
    this.nameSpan.style.display = "none";
    this.dateSpan.style.display = "none";
  }

  show() {
    this.nameSpan.style.display = "";
    this.dateSpan.style.display = "";
  }

  unhighlight() {
    this.nameSpan.classList.remove("highlight");
    this.dateSpan.classList.remove("highlight");
  }

  highlight() {
    this.nameSpan.classList.add("highlight");
    this.dateSpan.classList.add("highlight");
  }

  setLabel(x: number, dateLabel: string) {
    this.nameSpan.style.left = `${x}px`;
    this.dateSpan.style.left = `${x}px`;
    this.dateSpan.textContent = dateLabel;
  }
}


export class NodeTimelines {
  nodeTimesCanvas: NodeTimeDistributionChart;
  data: NodeDisplay[] = [];
  minDate: number = UNSET;
  maxDate: number = UNSET;
  highlighedtNode: DisplayNode | null = null;
  highlightedDate: number = UNSET;
  nodeLabels: {[className: string]: NodeLabels} = {};
  hoverCallback: HoverCallback;

  constructor(nodeHighlightCallback: HoverCallback) {

    const seriesHoverHandler: SeriesHoverCallback = (series: Distribution | null, date: number)=>{
      let nodeType: DisplayNode | null = null;
      if (series) {
        nodeType = (series as NodeDistribution).nodeClass;
      }
      nodeHighlightCallback(nodeType, date, null);
    };

    this.nodeTimesCanvas = new NodeTimeDistributionChart([], this.minDate, this.maxDate, svg, seriesHoverHandler, NodeSVGSeriesGroup);
    this.hoverCallback = nodeHighlightCallback;
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
    const allSeries = nodes.map(n=>n.series).filter(s => s !== null);
    this.nodeTimesCanvas.setSeries(allSeries as NodeDistribution[]);
  }

  requestDraw() : void {
    requestAnimationFrame(()=>{
      const displaying: {[_: string]: boolean} = {};
      this.data.forEach((nd) => {
        const dn = nd.type;
        const dist = nd.series;
        if (dn !== null && dist) {
          const className = dn.className;
          displaying[className] = true;
          let labels = this.nodeLabels[className];
          if (labels === undefined) {
            labels = new NodeLabels(dn, this.hoverCallback);
            this.nodeLabels[className] = labels;
          } else {
            labels.show();
          }
          const x = this.nodeTimesCanvas.xFor(dist.median, this.nodeTimesCanvas.width);
          const dateLabel = toFullDateString(dist.median);
          labels.setLabel(x, dateLabel);
        }
      });
      Object.values(this.nodeLabels).forEach(labels=>{
        if (displaying[labels.className] === undefined) {
          labels.hide();
        }
      })
      const max = this.nodeTimesCanvas.allSeriesBandMax;
      maxProbDiv.textContent = `${max}%`;
      this.nodeTimesCanvas.requestDraw();
    });
  }


  highlightNode(node: DisplayNode | null, date: number) : void {
    if (!this.data) return;

    if (node !== this.highlighedtNode) {
      nodeComparisonContainer.classList.toggle("highlighting", node !== null);

      this.nodeTimesCanvas.setMatching(node);
      Object.values(this.nodeLabels).forEach(nl=>nl.unhighlight());

      nodeComparisonContainer.classList.remove("highlighting");
      if (node !== null) {
        const labels = this.nodeLabels[node.className];
        if (labels !== undefined) {
          labels.highlight();
        }
      }
      this.highlighedtNode = node;
    }
    if (date !== this.highlightedDate) {
      this.highlightedDate = date;
      if (date === UNSET) {
        dateHoverDiv.classList.remove("active");
      } else {
        const pct = 100 * (date - this.minDate) / (this.maxDate - this.minDate);
        dateHoverDiv.style.left = `${pct}%`;
        dateHoverDiv.classList.add("active");
      }
    }



  }

  resize() {
    this.nodeTimesCanvas.resize();
  }

}



