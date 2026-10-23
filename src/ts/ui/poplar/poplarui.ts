import { PhyloTree } from "../../pythia/delphy_api";
import { SharedState } from "../../sharedstate";
import { getTimelineIndices, UNSET } from "../common";
import { DateLabel } from "../datelabel";
import { UIScreen } from "../uiscreen";
import { BaseTreeCanvas } from "./basetreecanvas";
import { BaseTreeScrubber } from "./basetreescrubber";
import { PoplarCanvas } from "./poplarcanvas";
import { PoplarChart, SelectNodeCallback, SelectTreeCallback } from "./poplarcommon";
import { PoplarData } from "./poplardata";

export class PoplarUI extends UIScreen {
  scrubber: BaseTreeScrubber;
  baseTreeCanvas: BaseTreeCanvas;
  poplarCanvas: PoplarCanvas;
  poplarData: PoplarData;
  selectedTree = 0;
  earliestRootDate = UNSET;
  prevalenceLabel: HTMLLabelElement;

  constructor(sharedState: SharedState, divSelector: string) {
    super(sharedState, divSelector);
    const treeSelectCallback: SelectTreeCallback = (index: number)=>this.handleTreeSelect(index);
    const nodeSelectCallback: SelectNodeCallback = (index: number, src: PoplarChart) => this.handleNodeSelect(index, src);
    this.scrubber = new BaseTreeScrubber(treeSelectCallback);
    let canvas: HTMLCanvasElement = this.div.querySelector("#poplar--basetree-container canvas.poplar--main") as HTMLCanvasElement;
    this.baseTreeCanvas = new BaseTreeCanvas(canvas, nodeSelectCallback);
    canvas = this.div.querySelector("#poplar--container canvas.poplar--main") as HTMLCanvasElement;
    this.poplarData = new PoplarData();
    this.poplarCanvas = new PoplarCanvas(canvas, this.poplarData, nodeSelectCallback);


    const prevalenceThreshold = this.poplarData.threshold * 100;
    this.prevalenceLabel = this.div.querySelector("#poplar--minlinpct") as HTMLLabelElement;
    const prevInput = this.prevalenceLabel.querySelector("input") as HTMLInputElement;
    prevInput.setAttribute("value", `${prevalenceThreshold}`);
    const prevReadout = this.prevalenceLabel.querySelector(".poplar-value") as HTMLSpanElement;
    prevReadout.textContent = `${prevalenceThreshold}%`;
    prevInput.addEventListener("input", ()=>{
      const value = parseInt(prevInput.value);
      this.poplarData.setPrevalenceThreshold(value/100);
      this.poplarCanvas.resetColors();
      requestAnimationFrame(()=>{
        prevReadout.textContent = `${value}%`;
        this.poplarCanvas.draw();
      });
    });
    const populationInput = this.div.querySelector("#poplar--population input") as HTMLInputElement;
    populationInput.addEventListener("change", ()=>{
      const scaleIt = populationInput.checked;
      this.poplarData.setPopscaled(scaleIt);
      this.poplarCanvas.startPopScaleAnimation();

    });
  }





  activate() {
    super.activate();
    if (!this.pythia) return;
    const mccRef = this.pythia.getMcc();
    const mcc = mccRef.getMcc();
    const numBaseTrees = mcc.getNumBaseTrees();
    this.earliestRootDate = Number.MAX_VALUE;
    let tree: PhyloTree;
    let rootIndex: number;
    for (let i = 0; i < numBaseTrees; i++) {
      tree = mcc.getBaseTree(i);
      rootIndex = tree.getRootIndex();
      this.earliestRootDate = Math.min(this.earliestRootDate, tree.getTimeOf(rootIndex));
    }
    mccRef.release();
    this.scrubber.setData(numBaseTrees);
    this.poplarData.setPythia(this.pythia, this.sharedState.filename);
    requestAnimationFrame(()=>{
      this.resize();
    });
  }


  resize() {
    if (this.pythia) {
      this.baseTreeCanvas.sizeCanvas();
      this.poplarCanvas.sizeCanvas();
      const dateLabels: DateLabel[] = getTimelineIndices(this.earliestRootDate, this.pythia.maxDate);
      requestAnimationFrame(()=>{
        /*
        Hack alert: we use flexbox and other responsive techniques to layout
        the page, but we want the canvas size to match it in order to accurately
        read mouse positions. Sadly, this seems to require a couple iterations
        for the layout to stabilize: the page gets laid out, we try to set the
        size of the canvas to match the computed style, but that update to the
        dom triggers another layout reflow. Setting the canvas size twice _seems_
        to be enough, but there has to be a better way [mark 261023].
        */
        this.poplarCanvas.sizeCanvas();
        /*
        we use the number of pixels in the canvas to drive the number of date
        samples in the chart, so retrigger the data collection step here
        */
        this.handleTreeSelect(this.selectedTree);
        requestAnimationFrame(() => {
          if (this.pythia) {
            this.baseTreeCanvas.draw(this.earliestRootDate, this.pythia.maxDate, dateLabels);
            this.poplarCanvas.draw();
          }
        });
      });
    }
  }



  handleTreeSelect(index: number) {
    if (!this.pythia) return;
    console.debug(`\n      handleTreeSelect\n`);
    const start = Date.now();
    this.scrubber.setSelectedTree(index);
    const mccRef = this.pythia.getMcc();
    const mcc = mccRef.getMcc();
    const baseTree = mcc.getBaseTree(index);
    mccRef.release();
    this.baseTreeCanvas.positionTreeNodes(baseTree);
    /*
    get the y position of nodes in the tree so that the poplar
    canvas can follow it
    */
    const nodeYs = this.baseTreeCanvas.getNodeYs();
    const dateLabels: DateLabel[] = getTimelineIndices(this.earliestRootDate, this.pythia.maxDate);
    this.poplarData.setSelectedTree(index, this.poplarCanvas.xSpan, nodeYs, this.earliestRootDate, this.pythia.maxDate, dateLabels);
    // console.debug(`threshold: ${this.poplarData.threshold}, ${this.poplarData.topNodes.length} nodes`);
    this.poplarCanvas.resetColors();
    // const threshold = Math.round(this.poplarData.threshold * 100);
    // (this.prevalenceLabel.querySelector("input") as HTMLInputElement).value = `${threshold}`;
    // (this.prevalenceLabel.querySelector(".poplar-value") as HTMLSpanElement).textContent = `${threshold}%`;

    this.baseTreeCanvas.topNodes = this.poplarData.topNodes;
    requestAnimationFrame(() => {
      if (this.pythia) {
        const start = Date.now();
        this.baseTreeCanvas.draw(this.earliestRootDate, this.pythia.maxDate, dateLabels);
        this.poplarCanvas.draw();
        console.debug(`poplar draw took ${Date.now() - start} ms`);
      }
    });
    console.debug(`handleTreeSelect took ${Date.now() - start} ms`);
  }

  handleNodeSelect(nodeIndex: number, src: PoplarChart) {
    this.poplarCanvas.setSelectedNode(nodeIndex, src);
    this.baseTreeCanvas.setSelectedNode(nodeIndex);
  }
}