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


export enum topNodeSources {
  AREA,
  AREA_SCALED,
  AREA_SCALED_ALLOTED,
  PEAK,
  ALLOTTED,
  POP_SCALED,
  POP_SCALED_ALLOTTED
}

const TOP_NODE_SOURCE: topNodeSources = topNodeSources.AREA_SCALED;




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
  allottedPrevalenceHeap: Float32Array = new Float32Array();
  poplarCoordHeap: Float32Array = new Float32Array();
  populationScale: number[] = [];
  dateLabels: DateLabel[] = [];
  fileHash: number = UNSET;
  topAreas: number[][] = [];
  scaledAreas: number[][] = [];
  peakPrevalences: number[][] = [];
  peakAllottedPrevalences: number[][] = [];
  peakScaledPrevalences: number[][] = [];
  peakScaledAllottedPrevalences: number[][] = [];
  scaledAllottedAreas: number[][] = [];
  topNodes: number[] = [];
  mutCounts: Int16Array = new Int16Array();

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
    const { minDate, maxDate, tree, branchPrevalence, population } = this.pythia.getPoplarPrevalenceData(absoluteIndex, resolution);
    let maxPop = 0;
    for (let i = 0; i < population.length; i++) {
      maxPop = Math.max(maxPop, population[i]);
    }
    this.populationScale.length = population.length;
    for (let i = 0; i < population.length; i++) {
      this.populationScale[i] = population[i] / maxPop;
    }
    this.minDate = minDate;
    this.maxDate = maxDate;
    this.baseTree = tree;
    this.branchPrevalence = branchPrevalence;
    if (branchPrevalence[0].length > this.binCount) {
      this.initializeStorage();
    }
    this.binCount = branchPrevalence[0].length;
    this.mutCounts = new Int16Array(this.nodeCount);
    for (let i = 0; i < this.nodeCount; i++) {
      this.mutCounts[i] = this.baseTree.getMutationsOf(i).length;
    }
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
    if (allottedHeapSize > this.allottedPrevalenceHeap.length) {
      this.allottedPrevalenceHeap = new Float32Array(allottedHeapSize).fill(UNSET);
      this.poplarCoordHeap = new Float32Array(allottedHeapSize * NUM_POPLAR_COORDS).fill(UNSET);
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




  sumAreasAndGetPeaks() {
    if (!this.baseTree) return;
    const { branchPrevalence, allottedPrevalenceHeap, binCount, populationScale } = this
    const areas: number[] = new Array(branchPrevalence.length);
    const peaks: number[] = new Array(branchPrevalence.length);
    const exclusivePeaks: number[] = new Array(branchPrevalence.length);
    const scaledAreas: number[] = new Array(branchPrevalence.length);
    const scaledPeaks: number[] = new Array(branchPrevalence.length);
    const scaledExclusivePeaks: number[] = new Array(branchPrevalence.length);
    const scaledAllottedAreas: number[] = new Array(branchPrevalence.length);
    let row: number[];
    let tot: number;
    let totScaled: number;
    let totScaledAllot: number;
    let max: number;
    let allottedMax: number;
    let scaledMax: number;
    let scaledAllottedMax: number;
    let j: number;

    let val: number;
    let scaled: number;
    let allot: number;
    let pop: number;

    const root = this.baseTree.getRootIndex();

    for (let i = 0; i < branchPrevalence.length; i++) {
      row = branchPrevalence[i];
      tot = 0;
      totScaled = 0;
      totScaledAllot = 0;
      max = 0;
      allottedMax = 0;
      scaledMax = 0;
      scaledAllottedMax = 0;
      for (j = 0; j < row.length; j++) {
        /*
        the `|| 0` here is probably papering over a small discrepancy
        [mark 261021]
        */
        pop = populationScale[j] || 0;
        val = row[j];
        allot = allottedPrevalenceHeap[i * binCount + j];
        scaled = val * pop;
        //
        tot += val;
        max = Math.max(max, val);
        allottedMax = Math.max(allottedMax, allot);
        totScaled += scaled;
        scaledMax = Math.max(scaledMax, scaled);
        scaledAllottedMax = Math.max(scaledAllottedMax, allot * pop);
        totScaledAllot += allot * pop;
      }
      areas[i] = tot;
      peaks[i] = max;
      exclusivePeaks[i] = allottedMax;
      scaledAreas[i] = totScaled;
      scaledPeaks[i] = scaledMax;
      scaledExclusivePeaks[i] = scaledAllottedMax;
      scaledAllottedAreas[i] = totScaledAllot;

    }
    const totalArea = areas[root];
    const totalScaled = scaledAreas[root];

    /* set areas so they reflect the % of total */
    for (let i = 0; i < areas.length; i++) {
      areas[i] /= totalArea;
      scaledAreas[i] /= totalScaled;
      scaledAllottedAreas[i] /= totalScaled;
    }
    this.topAreas = getSortedTops(areas);
    this.scaledAreas = getSortedTops(scaledAreas);
    this.peakPrevalences = getSortedTops(peaks);
    this.peakAllottedPrevalences = getSortedTops(exclusivePeaks);
    this.peakScaledPrevalences = getSortedTops(scaledPeaks);
    this.peakScaledAllottedPrevalences = getSortedTops(scaledExclusivePeaks);
    this.scaledAllottedAreas = getSortedTops(scaledAllottedAreas);
  }


  getTopNodeSource() : number[][] {
    let source = this.peakPrevalences;
    switch (TOP_NODE_SOURCE) {
    case topNodeSources.AREA: source = this.topAreas; break;
    case topNodeSources.AREA_SCALED: source = this.scaledAreas; break;
    case topNodeSources.PEAK: source = this.peakPrevalences; break;
    case topNodeSources.POP_SCALED: source = this.peakScaledPrevalences; break;
    case topNodeSources.ALLOTTED: source = this.peakAllottedPrevalences; break;
    case topNodeSources.POP_SCALED_ALLOTTED: source = this.peakScaledAllottedPrevalences; break;
    case topNodeSources.AREA_SCALED_ALLOTED: source = this.scaledAllottedAreas; break;
    }
    return source;
  }


  setTopNodes() {
    if (!this.baseTree) return;
    this.sumAreasAndGetPeaks();
    const { topNodes, baseTree, mutCounts } = this;
    const theSource = this.getTopNodeSource();
    const topThreshold = theSource[DEFAULT_HIGHLIGHT_NODE_COUNT][DATA_INDEX];
    if (isNaN(topThreshold)) {
      console.log(theSource)
    }
    topNodes.length = 0;
    const rootIndex = baseTree.getRootIndex();
    let nodeIndex: number;
    for (let i = 0; i < theSource.length; i++) {
      if (theSource[i][DATA_INDEX] >= topThreshold) {
        nodeIndex = theSource[i][NODE_INDEX];
        if (nodeIndex !== rootIndex && mutCounts[nodeIndex] > 0) {
          topNodes.push(nodeIndex);
          // const prev = prevalenceSource[i][DATA_INDEX];
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


  findBranchesExceedPrevalenceThreshold() {
    if (!this.baseTree) return;
    const { threshold, branchIndices } = this;
    const theSource = this.getTopNodeSource();
    // const theSource = this.peakPrevalences;
    branchIndices.length = 0;
    const rootIndex = this.baseTree.getRootIndex();
    let nodeIndex: number;
    for (let i = 0; i < theSource.length; i++) {
      nodeIndex = theSource[i][NODE_INDEX];
      if (nodeIndex !== rootIndex && theSource[i][DATA_INDEX] >= threshold) {
        branchIndices.push(nodeIndex);
      }
    }
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
    const { baseTree, branchPrevalence, allottedPrevalenceHeap, drawOrder, binCount, nodeCount } = this;
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
          allotted = allottedPrevalenceHeap[index * binCount + c];
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
          allotted = allottedPrevalenceHeap[index * binCount + c];
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
    const { drawOrder, baseTree, allottedPrevalenceHeap, branchPrevalence,
      baseTreeNodeYs, binCount } = this;
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
          allottedPrevalenceHeap[aaBase + col] = src[col] - leftRow[col] - rightRow[col];
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
          allottedPrevalenceHeap[aaBase + col] = src[col];
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


  getReadoutData(nodeIndex: number) : number[] {
    const areaPct = findData(nodeIndex, this.topAreas);
    const peakPct = findData(nodeIndex, this.peakPrevalences);
    const exclusivePeakPct = findData(nodeIndex, this.peakAllottedPrevalences);
    const areaScaled = findData(nodeIndex, this.scaledAreas);
    const peakScaled = findData(nodeIndex, this.peakScaledPrevalences);
    const peakScaledAllotted = findData(nodeIndex, this.peakScaledAllottedPrevalences);
    const areaScaledAllotted = findData(nodeIndex, this.scaledAllottedAreas);
    return [areaPct, peakPct, exclusivePeakPct, areaScaled, peakScaled, peakScaledAllotted, areaScaledAllotted, TOP_NODE_SOURCE];
  }

}


const findData = (nodeIndex: number, data: number[][]) : number => {
  const record = data.filter((pair)=>pair[NODE_INDEX] === nodeIndex)[0];
  return record[DATA_INDEX];
}


const getSortedTops = (data: number[]) : number[][] => {
  const sortable = data.map((datum, nodeIndex) => [datum, nodeIndex]);
  sortable.sort((a, b) => b[DATA_INDEX] - a[DATA_INDEX]);
  return sortable;
}


