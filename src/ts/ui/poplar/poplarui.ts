import { PhyloTree, kNoNode, kNoBranch } from "../../pythia/delphy_api";
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

    const blobStart = Date.now();
    const blobTree = this.pythia.deriveBlobTree(baseTree);
    const blobElapsed = Date.now() - blobStart;  // Only the derivation, but reported at the very end

    console.debug(`blob tree size: ${blobTree.getSize()} blobs`);

    console.debug(``);
    console.debug(`Base Tree`);
    console.debug(`---------`);
    function goTree(node: number, level: number) {
      if (node == baseTree.getRootIndex()) {
        console.debug(`${"|".repeat(level)} ${node} (in [${blobTree.node2blob(node)}])`);
      } else {
        const branch = node;
        const branchEnd = branch;
        const branchStart = baseTree.getParentIndexOf(branchEnd);
        console.debug(`${"|".repeat(level)} ${node} (in [${blobTree.node2blob(node)}]) from branch ${branchStart}-${branchEnd} (in [${blobTree.branch2blob(branch)}])`);
      }
      if (baseTree.getNumChildrenOf(node) === 2) {
        goTree(baseTree.getLeftChildIndexOf(node), level+1);
        goTree(baseTree.getRightChildIndexOf(node), level+1);
      }
    }
    goTree(baseTree.getRootIndex(), 0);

    console.debug(``);
    console.debug(`Blob Tree`);
    console.debug(`---------`);
    const blobsVisited = new Set<number>();
    function go(node: number, level: number) {
      console.debug(`${"|".repeat(level)} [${node}]`);
      blobsVisited.add(node);
      for (const child of blobTree.getChildrenOf(node)) {
        go(child, level+1);
      }
    }
    go(blobTree.getRootIndex(), 0);
    const blobs = [...blobsVisited].sort((a, b) => a - b);

    function seedOf(node: number): string {
      const seedNode = blobTree.getSeedNodeOf(node);
      const seedBranch = blobTree.getSeedBranchOf(node);
      if (seedNode !== kNoNode) {
        return `n${seedNode}`;
      } else if (seedBranch !== kNoBranch) {
        const branchEndNode = seedBranch;
        const branchStartNode = baseTree.getParentIndexOf(seedBranch);
        return `b${branchStartNode}-${branchEndNode}`;
      } else {
        return `THIS CAN'T HAPPEN!`;
      }
    }
    const rows: Record<number, Record<string, unknown>> = {};
    for (const blob of blobs) {
      rows[blob] = {
        fingerprint: blobTree.getFingerprintOf(blob).toString(16).padStart(16, "0"),
        parent: blobTree.getParentIndexOf(blob),
        children: blobTree.getChildrenOf(blob).join(","),
        seed: seedOf(blob),
        treeNodes: blobTree.getTreeNodesBehind(blob).map(node => `${node}`).join(","),
        treeBranches: blobTree.getTreeBranchesBehind(blob).map(branch => `${baseTree.getParentIndexOf(branch)}-${branch}`).join(","),
        blobSequence: blobTree.queryBlobSequence(blob),
      };
    }
    console.table(rows);

    blobTree.delete();

    console.debug(`blob tree calculations took ${blobElapsed} ms`);
  }

  handleNodeSelect(nodeIndex: number, src: PoplarChart) {
    this.poplarCanvas.setSelectedNode(nodeIndex, src);
    this.baseTreeCanvas.setSelectedNode(nodeIndex);
  }
}
