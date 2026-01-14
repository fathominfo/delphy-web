import { NodeCallback, NodeDisplay } from './lineagescommon';
import { DisplayNode, UNSET } from '../common';
import { HighlightableTimeDistributionCanvas, HoverCallback } from './highlightabletimedistributioncanvas';
import { DistributionSeries } from '../timedistributioncanvas';

const nodeComparisonContainer = document.querySelector("#lineages--node-timelines") as HTMLDivElement;

const rootSpan = nodeComparisonContainer.querySelector("#lineages-nt-root-label") as HTMLSpanElement,
  mrcaSpan = nodeComparisonContainer.querySelector("#lineages-nt-mrca-label") as HTMLSpanElement,
  nodeASpan = nodeComparisonContainer.querySelector("#lineages-nt-a-label") as HTMLSpanElement,
  nodeBSpan = nodeComparisonContainer.querySelector("#lineages-nt-b-label") as HTMLSpanElement,
  rootDateSpan = nodeComparisonContainer.querySelector("#lineages-nt-root-date-label") as HTMLSpanElement,
  mrcaDateSpan = nodeComparisonContainer.querySelector("#lineages-nt-mrca-date-label") as HTMLSpanElement,
  nodeADateSpan = nodeComparisonContainer.querySelector("#lineages-nt-a-date-label") as HTMLSpanElement,
  nodeBDateSpan = nodeComparisonContainer.querySelector("#lineages-nt-b-date-label") as HTMLSpanElement,
  canvas = nodeComparisonContainer.querySelector("canvas") as HTMLCanvasElement,
  readout = nodeComparisonContainer.querySelector(".time-chart--readout") as HTMLElement;




export class NodeTimelines {
  nodeTimesCanvas: HighlightableTimeDistributionCanvas;
  data: NodeDisplay[] = [];
  minDate: number = UNSET;
  maxDate: number = UNSET;

  constructor(nodeHighlightCallback: NodeCallback) {
    // const {series, minDate, maxDate} = this.data;

    const seriesHoverHandler: HoverCallback = (n: DisplayNode)=>{
      if (this.data === null) return;
      console.log(`seriesHoverHandler -> ${n}`)
      // if (n === 0) {
      //   nodeHighlightCallback(this.data.ancestorType);
      // } else if (n === 1) {
      //   nodeHighlightCallback(this.data.descendantType);
      // } else {
      //   nodeHighlightCallback(UNSET);
      // }
      nodeHighlightCallback(UNSET);
    };


    this.nodeTimesCanvas = new HighlightableTimeDistributionCanvas([], this.minDate, this.maxDate, canvas, readout, seriesHoverHandler);

    [ rootSpan, mrcaSpan, nodeASpan, nodeBSpan,
      rootDateSpan, mrcaDateSpan, nodeADateSpan, nodeBDateSpan].forEach(span=>{
      span.addEventListener("mouseleave", () => nodeHighlightCallback(UNSET));
    });
    [ rootSpan, rootDateSpan].forEach(span=>{
      span.addEventListener("mouseenter", () => nodeHighlightCallback(DisplayNode.root));
    });
    [ mrcaSpan, mrcaDateSpan].forEach(span=>{
      span.addEventListener("mouseenter", () => nodeHighlightCallback(DisplayNode.mrca));
    });
    [ nodeASpan, nodeADateSpan].forEach(span=>{
      span.addEventListener("mouseenter", () => nodeHighlightCallback(DisplayNode.node1));
    });
    [ nodeBSpan, nodeBDateSpan].forEach(span=>{
      span.addEventListener("mouseenter", () => nodeHighlightCallback(DisplayNode.node2));
    });
  }

  setDateRange(minDate:number, maxDate:number): void {
    this.minDate = minDate;
    this.maxDate = maxDate
  }

  setData(nodes: NodeDisplay[]) {
    this.data = nodes;
    const currentTypes = nodes.map((nd:NodeDisplay)=>nd.type);
    rootSpan.classList.toggle("hidden", !currentTypes.includes(DisplayNode.root));
    rootDateSpan.classList.toggle("hidden", !currentTypes.includes(DisplayNode.root));
    mrcaSpan.classList.toggle("hidden", !currentTypes.includes(DisplayNode.mrca));
    mrcaDateSpan.classList.toggle("hidden", !currentTypes.includes(DisplayNode.mrca));
    nodeASpan.classList.toggle("hidden", !currentTypes.includes(DisplayNode.node1));
    nodeADateSpan.classList.toggle("hidden", !currentTypes.includes(DisplayNode.node1));
    nodeBSpan.classList.toggle("hidden", !currentTypes.includes(DisplayNode.node2));
    nodeBDateSpan.classList.toggle("hidden", !currentTypes.includes(DisplayNode.node2));
    const allSeries = nodes.map(n=>n.series).filter(s => s !== null);
    this.nodeTimesCanvas.setSeries(allSeries as DistributionSeries[]);
    this.requestDraw();
  }

  requestDraw() : void {
    requestAnimationFrame(()=>{
      this.nodeTimesCanvas.draw();
    });
  }


  highlightNode(node: DisplayNode | typeof UNSET) : void {
    if (!this.data) return;
    nodeComparisonContainer.classList.toggle("highlighting", node !== UNSET);

    if (node === UNSET) {
      // this.nodeTimesCanvas.resetHighlight();
      nodeASpan.classList.remove("highlight");
      nodeBSpan.classList.remove("highlight");
      return;
    }

    // if (node === this.data.ancestorType) {
    //   // this.nodeTimesCanvas.highlightAncestor();
    //   nodeASpan.classList.add("highlight");
    //   nodeBSpan.classList.remove("highlight");
    //   return;
    // }

    // if (node === this.data.descendantType) {
    //   // this.nodeTimesCanvas.highlightDescendant();
    //   nodeASpan.classList.remove("highlight");
    //   nodeBSpan.classList.add("highlight");
    //   return;
    // }

    /* else, don't have this node */
    // this.nodeTimesCanvas.lowlight();
    nodeASpan.classList.remove("highlight");
    nodeBSpan.classList.remove("highlight");
  }

  resize() {
    this.nodeTimesCanvas.resize();
  }

}



