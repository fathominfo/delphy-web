import { PhyloTree } from "../../pythia/delphy_api";
import { Pythia } from "../../pythia/pythia";
import { UNSET } from "../common";

const DEFAULT_PREVALENCE = 0.1;


// export type PoplarCoord = {
//   center: number,        // vertical center of the branch
//   top: number,           // top of the branch area
//   bottom: number,        // bottom of the branch area
//   splitTop: number,      // top of the lower branch area (if it is split)
//   splitBottom: number,   // bottom of the lower branch area (if it is split)
//   childTop: number,      // start y-position for the current child, used and updated during layout
// };

// export type PoplarCoord = [number, number, number, number, number, number];
const ix_center  = 0; // vertical center of the branch
const ix_top = 1;            // top of the branch area
const ix_bottom = 2;         // bottom of the branch area
const ix_splitTop = 3;       // top of the lower branch area (if it is split)
const ix_splitBottom = 4;    // bottom of the lower branch area (if it is split)
const ix_childTop = 5;       // start y-position for the current child, used and updated during layout
const NUM_POPLAR_COORDS = 6;



export class PoplarData {
  pythia: Pythia | null = null;
  baseTree: PhyloTree | null = null;
  baseTreeNodeYs: number[] = [];
  minDate: number = UNSET;
  maxDate: number = UNSET;
  branchPrevalence: number[][] = [];
  numBins: number = UNSET;
  drawOrder: number[] = [];
  nodePos: number[][] = [];
  branchIndices: number[] = [];
  threshold: number = DEFAULT_PREVALENCE;
  allottedAreaHeap: number[] = [];
  poplarCoordHeap: number[] = [];


  setPythia(pythia: Pythia) {
    this.pythia = pythia;
  }


  setSelectedTree(treeIndex: number, resolution: number, nodeYs: number[]) {
    if (!this.pythia) return;
    // console.log(`setting selected tree... index: ${treeIndex}`)
    this.baseTreeNodeYs = nodeYs;
    /*
    treeIndex is taken from the MCC, but getPoplarPrevalenceData
    takes the absolute index (including burn-in)
    */
    const absoluteIndex = treeIndex + this.pythia.kneeIndex;
    // const start = Date.now();
    const { minDate, maxDate, tree, branchPrevalence } = this.pythia.getPoplarPrevalenceData(absoluteIndex, resolution);
    // console.debug(`getPoplarPrevalenceData took ${Date.now() - start} ms`);
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.baseTree = tree;
    this.branchPrevalence = branchPrevalence;
    if (branchPrevalence[0].length > this.numBins) {
      this.numBins = branchPrevalence[0].length;
      this.initializeStorage();
    }
    this.setDrawOrderAndAllotted();
    this.prepareLayout();
    this.setNodePositions();
    this.findBranchesExceedPrevalenceThreshold();
  }

  initializeStorage() {
    const nodeCount = this.baseTreeNodeYs.length;
    const numBins = this.numBins;
    const allottedHeapSize = nodeCount * numBins;
    if (allottedHeapSize > this.allottedAreaHeap.length) {
      const diff = allottedHeapSize - this.allottedAreaHeap.length;
      let toAdd = new Array(diff).fill(UNSET);
      this.allottedAreaHeap = this.allottedAreaHeap.concat(toAdd);
      toAdd = new Array(diff * NUM_POPLAR_COORDS).fill(UNSET);
      this.poplarCoordHeap = this.poplarCoordHeap.concat(toAdd);
    }
    if (this.nodePos.length === 0) {
      this.nodePos = new Array(nodeCount);
      for (let i = 0; i < nodeCount; i++) {
        this.nodePos[i] = [UNSET, UNSET];
      }
    }
  }

  setPrevalenceThreshold(threshold: number) {
    this.threshold = threshold;
    this.findBranchesExceedPrevalenceThreshold();
  }

  findBranchesExceedPrevalenceThreshold() {
    if (!this.baseTree) return;
    const { branchPrevalence, threshold, branchIndices } = this;
    branchIndices.length = 0;
    const rootIndex = this.baseTree.getRootIndex();
    let row: number[];
    let j: number;
    for (let i = 0; i < branchPrevalence.length; i++) {
      row = branchPrevalence[i];
      if (i === rootIndex) return;
      for (j = 0; j < row.length; j++) {
        if (row[j] >= threshold) {
          branchIndices.push(i);
          break;
        }
      }
    }
  }

  setNodePositions() {
    const { baseTree, minDate, maxDate, numBins } = this;
    if (!baseTree) return;
    const lastBin = numBins - 1;
    const nodeCount = baseTree.getSize();
    let nodeTime: number;
    let timePercent: number;
    let column: number;
    let column1: number;
    let fraction: number;
    let y1: number;
    let y2: number;
    let nodeY: number;

    for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
      nodeTime = baseTree.getTimeOf(nodeIndex);
      timePercent = (nodeTime - minDate) / (maxDate - minDate);
      column = timePercent * lastBin;
      column1 = Math.floor(column);
      fraction = column - column1;
      y1 = this.getPoplarCoordCenter(nodeIndex, column1); // row[column1].center;
      y2 = column1 === lastBin ? y1 : this.getPoplarCoordCenter(nodeIndex, column1 + 1); //row[column1 + 1].center;
      nodeY = UNSET;
      if (y1 === UNSET) {
        nodeY = y2;
      } else {
        if (y2 === UNSET) {
          nodeY = y1;
        } else {
          nodeY = y1 + fraction * (y2 - y1);
        }
      }
      this.nodePos[nodeIndex][0] = column;
      this.nodePos[nodeIndex][1] = nodeY;
    }
  }


  prepareLayout() {
    const { baseTree, branchPrevalence, baseTreeNodeYs, drawOrder, numBins, allottedAreaHeap } = this;
    if (!baseTree) return;
    if (branchPrevalence.length === 0 || branchPrevalence[0].length === 0) return;

    const rowCount = baseTreeNodeYs.length;
    const colCount = numBins;
    // console.debug(`prepareLayout draw order took ${Date.now() - start} ms`);
    const start = Date.now();

    let index: number;
    let parent: number;
    let total: number;
    let allotted: number;
    let isSplit: boolean;
    let center: number = UNSET;
    let top: number = UNSET;
    let bottom: number = UNSET;
    let splitTop: number = UNSET;
    let splitBottom: number = UNSET;
    let childTop: number = UNSET;
    let i: number;
    for (let c = 0; c < colCount; c++) {
      for (i = 0; i < rowCount; i++) {
        index = drawOrder[i];
        parent = baseTree.getParentIndexOf(index);
        total = branchPrevalence[index][c];
        allotted = allottedAreaHeap[index * numBins + c];
        isSplit = allotted < total;
        center = UNSET;
        top = UNSET;
        bottom = UNSET;
        splitTop = UNSET;
        splitBottom = UNSET;
        childTop = UNSET;
        if (parent === UNSET) { /* root */
          center = 0.5;
          top = 0;
          bottom = 1.0;
        } else if (total > 0) {
          top = this.getPoplarCoordChildTop(parent, c);
          bottom = top + total;
          center = (top + bottom) / 2;
          this.setPoplarCoordChildTop(parent, c, bottom);
        }
        if (total > 0 && isSplit) {
          splitTop = top + allotted / 2;
          splitBottom = bottom - allotted / 2;
          childTop = splitTop;
        }
        this.setPoplarCoords(index, c, center, top, bottom, splitTop, splitBottom, childTop);
      }
    }
    console.debug(`prepareLayout took ${Date.now() - start} ms`);
  }

  setDrawOrderAndAllotted() {
    const { drawOrder, baseTree, allottedAreaHeap, branchPrevalence, baseTreeNodeYs, numBins } = this;
    if (!baseTree) return;
    if (branchPrevalence.length === 0 || branchPrevalence[0].length === 0) return;

    /*
    how much area is allotted to each branch, minus
    the space allotted to its children?
    */
    const rootIndex = baseTree.getRootIndex();

    drawOrder.length = 0;
    drawOrder.push(rootIndex);
    let index: number;
    let src: number[];
    let aaBase: number;
    let leftIndex: number;
    let rightIndex: number;
    let leftRow: number[];
    let rightRow: number[];
    let i = 0;
    let col = 0;
    while (i < drawOrder.length) {
      index = drawOrder[i] as number;
      src = branchPrevalence[index];
      aaBase = index * numBins;
      leftIndex = baseTree.getLeftChildIndexOf(index);
      if (leftIndex !== UNSET) {
        rightIndex = baseTree.getRightChildIndexOf(index);
        leftRow = branchPrevalence[leftIndex];
        rightRow = branchPrevalence[rightIndex];
        for (col = 0; col < numBins; col++) {
          allottedAreaHeap[aaBase + col] = src[col] - leftRow[col] - rightRow[col];
        }
        if (baseTreeNodeYs[leftIndex] < baseTreeNodeYs[rightIndex]) {
          drawOrder.push(leftIndex);
          drawOrder.push(rightIndex);
        } else {
          drawOrder.push(rightIndex);
          drawOrder.push(leftIndex);
        }
      } else {
        for (col = 0; col < numBins; col++) {
          allottedAreaHeap[aaBase + col] = src[col];
        }
      }
      i++;
    }

  }

  getCoordBaseIndex(nodeIndex: number, bin: number) : number {
    return (nodeIndex * this.numBins + bin) * NUM_POPLAR_COORDS;
  }

  setPoplarCoords(nodeIndex: number, bin: number, center: number,
    top: number, bottom: number, splitTop: number, splitBottom: number,
    childTop: number
  ) {
    const baseIndex = this.getCoordBaseIndex(nodeIndex, bin);
    this.poplarCoordHeap[baseIndex + ix_center] = center;
    this.poplarCoordHeap[baseIndex + ix_top] = top;
    this.poplarCoordHeap[baseIndex + ix_bottom] = bottom;
    this.poplarCoordHeap[baseIndex + ix_splitTop] = splitTop;
    this.poplarCoordHeap[baseIndex + ix_splitBottom] = splitBottom;
    this.poplarCoordHeap[baseIndex + ix_childTop] = childTop;
  }

  getPoplarCoordCenter(nodeIndex: number, bin: number) {
    return this.poplarCoordHeap[this.getCoordBaseIndex(nodeIndex, bin) + ix_center];
  }
  getPoplarCoordTop(nodeIndex: number, bin: number) {
    return this.poplarCoordHeap[this.getCoordBaseIndex(nodeIndex, bin) + ix_top];
  }
  getPoplarCoordBottom(nodeIndex: number, bin: number) {
    return this.poplarCoordHeap[this.getCoordBaseIndex(nodeIndex, bin) + ix_bottom];
  }
  getPoplarCoordSplitTop(nodeIndex: number, bin: number) {
    return this.poplarCoordHeap[this.getCoordBaseIndex(nodeIndex, bin) + ix_splitTop];
  }
  getPoplarCoordSplitBottom(nodeIndex: number, bin: number) {
    return this.poplarCoordHeap[this.getCoordBaseIndex(nodeIndex, bin) + ix_splitBottom];
  }
  getPoplarCoordChildTop(nodeIndex: number, bin: number) {
    return this.poplarCoordHeap[this.getCoordBaseIndex(nodeIndex, bin) + ix_childTop];
  }
  setPoplarCoordChildTop(nodeIndex: number, bin: number, childTop: number) {
    this.poplarCoordHeap[this.getCoordBaseIndex(nodeIndex, bin) + ix_childTop] = childTop;
  }


}