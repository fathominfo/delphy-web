import { NodeCallback } from './lineagescommon';
import { DisplayNode, getNodeTypeName, UNSET, getNodeClassName } from '../common';
import { HighlightableTimeDistributionCanvas, HoverCallback } from './highlightabletimedistributioncanvas';
import { NodeComparisonChartData } from './nodecomparisonchartdata';

const nodeComparisonContainer = document.querySelector("#lineages--node-timelines") as HTMLDivElement;
const nodeComparisonTemplate = nodeComparisonContainer.querySelector(".lineages--node-timeline") as HTMLDivElement;

nodeComparisonTemplate.remove();

const ancestorNodeNameSelector = '.lineages--node-timeline--ancestor-node',
  descendantNodeNameSelector = '.lineages--node-timeline--descendant-node',
  nodeTimesCanvasSelector = '.lineages--time-chart canvas';


export class NodeTimelines {
  div: HTMLDivElement;
  node1Span: HTMLSpanElement;
  node2Span: HTMLSpanElement;
  nodeTimesCanvas: HighlightableTimeDistributionCanvas;
  nodeHighlightCallback: NodeCallback;
  data: NodeComparisonChartData;

  constructor(data : NodeComparisonChartData, nodeHighlightCallback: NodeCallback) {
    this.data = data;
    this.div = nodeComparisonTemplate.cloneNode(true) as HTMLDivElement;
    this.nodeHighlightCallback = nodeHighlightCallback;
    const node1Span = this.div.querySelector(ancestorNodeNameSelector) as HTMLSpanElement,
      node2Span = this.div.querySelector(descendantNodeNameSelector) as HTMLSpanElement,
      canvas = this.div.querySelector(nodeTimesCanvasSelector) as HTMLCanvasElement,
      readout = this.div.querySelector(".time-chart--readout") as HTMLElement;
    this.node1Span = node1Span;
    this.node2Span = node2Span;



    if (this.data.descendantType === UNSET) {
      this.div.classList.add('single');
    }
    this.setLabel(this.data.ancestorType, this.data.descendantType);

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

  requestDraw() : void {
    requestAnimationFrame(()=>{
      this.nodeTimesCanvas.draw();
    });
  }


  setDateRange(zoomMinDate: number, zoomMaxDate: number): void {
    this.nodeTimesCanvas.setDateRange(zoomMinDate, zoomMaxDate);
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
  }

}


export function setTimelines(nodeComparisonData: NodeComparisonChartData[],
  nodeHighlightCallback: NodeCallback,
  zoomMinDate: number, zoomMaxDate: number): NodeTimelines[] {
  nodeComparisonContainer.innerHTML = '';
  const comps: NodeTimelines[] = nodeComparisonData.map(chartData=>{
    const nc = new NodeTimelines(chartData, nodeHighlightCallback);
    nc.setDateRange(zoomMinDate, zoomMaxDate);
    nc.requestDraw();
    return nc;
  });
  return comps;
}

