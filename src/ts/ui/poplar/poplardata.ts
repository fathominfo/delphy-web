import { PhyloTree } from "../../pythia/delphy_api";
import { Pythia } from "../../pythia/pythia";
import { getHash, UNSET } from "../common";
import { DateLabel } from "../datelabel";

const DEFAULT_PREVALENCE = 0.1;
const DEFAULT_HIGHLIGHT_NODE_COUNT = 8;


const ix_center = 0;         // vertical center of the branch
const ix_top = 1;            // top of the branch area
const ix_bottom = 2;         // bottom of the branch area
const ix_splitTop = 3;       // top of the lower branch area (if it is split)
const ix_splitBottom = 4;    // bottom of the lower branch area (if it is split)
const ix_childTop = 5;       // start y-position for the current child, used and updated during layout
const NUM_POPLAR_COORDS = 6;

/*
for use with peakPrevalence and topAreas:
  those are both 2d arrays, where each
  entry is a pair of a nodeIndex, and the data
  for that node. They are sorted by the data
  values descending.
*/
const DATA_INDEX = 0;
const NODE_INDEX = 1;


export class PoplarData {
  pythia: Pythia | null = null;
  baseTree: PhyloTree | null = null;
  baseTreeNodeYs: number[] = [];
  minDateAcrossTrees: number = UNSET;
  maxDateAcrossTrees: number = UNSET;
  minDate: number = UNSET;
  maxDate: number = UNSET;
  branchPrevalence: number[][] = [];
  branchIndices: number[] = [];
  threshold: number = DEFAULT_PREVALENCE;
  drawOrder: number[] = [];
  nodePos: number[][] = [];
  nodeCount: number = UNSET;
  binCount: number = UNSET;
  allottedAreaHeap: number[] = [];
  poplarCoordHeap: number[] = [];
  dateLabels: DateLabel[] = [];
  fileHash: number = UNSET;
  topAreas: number[][] = [];
  peakPrevalences: number[][] = [];
  peakAllottedPrevalences: number[][] = [];
  topNodes: number[] = [];

  setPythia(pythia: Pythia, filename: string) {
    this.fileHash = getHash(filename);
    this.pythia = pythia;
  }


  setSelectedTree(treeIndex: number, resolution: number, nodeYs: number[],
    minDateAcrossTrees: number, maxDateAcrossTrees: number, dateLabels: DateLabel[]
  ) {
    if (!this.pythia) return;
    // console.log(`setting selected tree... index: ${treeIndex}`)
    this.baseTreeNodeYs = nodeYs;
    this.nodeCount = nodeYs.length;
    this.minDateAcrossTrees = minDateAcrossTrees;
    this.maxDateAcrossTrees = maxDateAcrossTrees;
    this.dateLabels = dateLabels;
    /*
    treeIndex is taken from the MCC, but getPoplarPrevalenceData
    takes the absolute index (including burn-in)
    */
    const absoluteIndex = treeIndex + this.pythia.kneeIndex;
    const { minDate, maxDate, tree, branchPrevalence } = this.pythia.getPoplarPrevalenceData(absoluteIndex, resolution);
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.baseTree = tree;
    this.branchPrevalence = branchPrevalence;
    if (branchPrevalence[0].length > this.binCount) {
      this.initializeStorage();
    }
    this.binCount = branchPrevalence[0].length;
    this.setDrawOrderAndAllotted();
    this.prepareLayout();
    this.setNodePositions();
    this.setTopNodes();
    this.findBranchesExceedPrevalenceThreshold();

  }


  initializeStorage() {
    const nodeCount = this.baseTreeNodeYs.length;
    const numBins = this.branchPrevalence[0].length;
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
    const { peakPrevalences, peakAllottedPrevalences, threshold, branchIndices } = this;
    branchIndices.length = 0;
    const rootIndex = this.baseTree.getRootIndex();
    let nodeIndex: number;
    for (let i = 0; i < peakAllottedPrevalences.length; i++) {
      nodeIndex = peakAllottedPrevalences[i][NODE_INDEX];
      if (nodeIndex !== rootIndex && peakAllottedPrevalences[i][DATA_INDEX] >= threshold) {
        branchIndices.push(nodeIndex);
      }
    }
  }

  setTopNodes() {
    if (!this.baseTree) return;
    this.sumAreasAndGetPeaks();
    // const theSource = this.peakAllottedPrevalences;
    const theSource = this.peakPrevalences;
    const topThreshold = theSource[DEFAULT_HIGHLIGHT_NODE_COUNT][DATA_INDEX];
    this.topNodes.length = 0;
    const rootIndex = this.baseTree.getRootIndex();
    let nodeIndex: number;
    for (let i = 0; i < theSource.length; i++) {
      if (theSource[i][DATA_INDEX] >= topThreshold) {
        nodeIndex = theSource[i][NODE_INDEX];
        if (nodeIndex !== rootIndex) {
          this.topNodes.push(nodeIndex);
          // const prev = theSource[i][DATA_INDEX];
          // const srcAllotted = this.allottedAreaHeap.slice(nodeIndex * this.binCount, (nodeIndex +1) * this.binCount);
          // const at = srcAllotted.indexOf(prev);
          // const leftIndex = this.baseTree.getLeftChildIndexOf(nodeIndex);
          // const rightIndex = this.baseTree.getRightChildIndexOf(nodeIndex);
          // console.debug(`${nodeIndex} added with prev ${prev} at index ${at}:
          //     ${this.allottedAreaHeap[nodeIndex * this.binCount + at]}
          //     ${this.branchPrevalence[nodeIndex][at]}
          //     ${leftIndex === UNSET ? '' : this.branchPrevalence[nodeIndex][at] - this.branchPrevalence[leftIndex][at] - this.branchPrevalence[rightIndex][at]}
          //     `)
        }
      } else {
        break;
      }
    }
    console.debug(`set colors with threshold ${topThreshold}, ${this.topNodes.length} nodes found`)
  }




  setNodePositions() {
    const { baseTree, minDate, maxDate, binCount, nodeCount } = this;
    if (!baseTree) return;
    const lastBin = binCount - 1;
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
      y1 = this.getPoplarCoordCenter(nodeIndex, column1);
      y2 = column1 === lastBin ? y1 : this.getPoplarCoordCenter(nodeIndex, column1 + 1);
      nodeY = UNSET;
      if (y1 === UNSET) {
        nodeY = y2;
      } else {
        if (y2 === UNSET) {
          nodeY = y1;
        } else {
          fraction = column - column1;
          nodeY = y1 + fraction * (y2 - y1);
        }
      }
      this.nodePos[nodeIndex][0] = column;
      this.nodePos[nodeIndex][1] = nodeY;
    }
  }


  prepareLayout() {
    const { baseTree, branchPrevalence, allottedAreaHeap, drawOrder, binCount, nodeCount } = this;
    if (!baseTree) return;
    if (branchPrevalence.length === 0 || branchPrevalence[0].length === 0) return;
    const start = Date.now();

    let index: number;
    let parent: number;
    let total: number;
    let allotted: number;
    let center: number = UNSET;
    let top: number = UNSET;
    let bottom: number = UNSET;
    let splitTop: number = UNSET;
    let splitBottom: number = UNSET;
    let childTop: number = UNSET;
    let i: number;
    for (i = 0; i < nodeCount; i++) {
      index = drawOrder[i];
      parent = baseTree.getParentIndexOf(index);
      if (parent === UNSET) { /* root */
        for (let c = 0; c < binCount; c++) {
          center = 0.5;
          top = 0;
          bottom = 1.0;
          total = branchPrevalence[index][c];
          allotted = allottedAreaHeap[index * binCount + c];
          if (total > allotted ) { // total > 0 is implied
            splitTop = top + allotted / 2;
            splitBottom = bottom - allotted / 2;
            childTop = splitTop;
          }
          this.setPoplarCoords(index, c, center, top, bottom, splitTop, splitBottom, childTop);
        }
      } else {
        for (let c = 0; c < binCount; c++) {
          total = branchPrevalence[index][c];
          allotted = allottedAreaHeap[index * binCount + c];
          center = UNSET;
          top = UNSET;
          bottom = UNSET;
          splitTop = UNSET;
          splitBottom = UNSET;
          childTop = UNSET;
          if (total > 0) {
            top = this.getPoplarCoordChildTop(parent, c);
            bottom = top + total;
            center = (top + bottom) / 2;
            this.setPoplarCoordChildTop(parent, c, bottom);
            if (allotted < total) {
              splitTop = top + allotted / 2;
              splitBottom = bottom - allotted / 2;
              childTop = splitTop;
            }
          }
          this.setPoplarCoords(index, c, center, top, bottom, splitTop, splitBottom, childTop);
        }
      }
    }
    console.debug(`prepareLayout took ${Date.now() - start} ms`);
  }

  setDrawOrderAndAllotted() {
    const { drawOrder, baseTree, allottedAreaHeap, branchPrevalence, baseTreeNodeYs, binCount } = this;
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
      aaBase = index * binCount;
      leftIndex = baseTree.getLeftChildIndexOf(index);
      if (leftIndex !== UNSET) {
        rightIndex = baseTree.getRightChildIndexOf(index);
        leftRow = branchPrevalence[leftIndex];
        rightRow = branchPrevalence[rightIndex];
        for (col = 0; col < binCount; col++) {
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
        for (col = 0; col < binCount; col++) {
          allottedAreaHeap[aaBase + col] = src[col];
        }
      }
      i++;
    }
  }


  getCoordBaseIndex(nodeIndex: number, bin: number): number {
    return (nodeIndex * this.binCount + bin) * NUM_POPLAR_COORDS;
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


  sumAreasAndGetPeaks() {
    const { branchPrevalence, allottedAreaHeap, binCount } = this
    const areas: number[] = new Array(branchPrevalence.length);
    const peaks: number[] = new Array(branchPrevalence.length);
    const exclusivePeaks: number[] = new Array(branchPrevalence.length);
    let row: number[];
    let tot: number;
    let max: number;
    let xMax: number;
    let xPrev: number;
    let j: number;
    for (let i = 0; i < branchPrevalence.length; i++) {
      row = branchPrevalence[i];
      tot = 0;
      max = 0;
      xMax = 0;
      for (j = 0; j < row.length; j++) {
        tot += row[j];
        max = Math.max(max, row[j]);
        xPrev = allottedAreaHeap[i * binCount + j];
        xMax = Math.max(xMax, xPrev);
      }
      areas[i] = tot;
      peaks[i] = max;
      exclusivePeaks[i] = xMax;
    }
    this.topAreas = getSortedTops(areas);
    this.peakPrevalences = getSortedTops(peaks);
    this.peakAllottedPrevalences = getSortedTops(exclusivePeaks);
  }
}



const getSortedTops = (data: number[]) : number[][] => {
  const sortable = data.map((datum, nodeIndex) => [datum, nodeIndex]);
  sortable.sort((a, b) => b[DATA_INDEX] - a[DATA_INDEX]);
  return sortable;
}


