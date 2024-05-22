import {Tree, PhyloTree, Mutation, SummaryTree} from '../pythia/delphy_api';
import {TreeCanvas} from './treecanvas';
import {HI_CONFIDENCE_COLOR, LOW_CONFIDENCE_COLOR, DEFAULT_NODE_CONFIDENCE,
  YSpacing, ColorOption, BRANCH_WEIGHT } from './common';
import {MccConfig} from "./mccconfig";
import { isTip } from '../util/treeutils';
import { PdfCanvas } from '../util/pdfcanvas';
import { Context2d } from "jspdf";

const GENETIC_DISTANCE_MIN_DIST = 1;

class TipInfo {
  index: number;
  y: number;

  constructor(i:number, y:number) {
    this.index = i;
    this.y = y;
  }
}


type OptionCount = {[name: string]: number};

const FADE_OPACITY = 0.3;


export class MccTreeCanvas extends TreeCanvas {
  mccConfig : MccConfig | null;
  verticalTips: TipInfo[];
  confidenceThreshold: number;
  nodeColors: string[];
  branchColors: string[];
  colorsUnSet: boolean;
  metadataNodeValues: string[];
  metadataNodeValueOptions: OptionCount[];
  totalTipMutations: number[];

  selectable: boolean;

  constructor(canvas: HTMLCanvasElement | PdfCanvas, ctx: CanvasRenderingContext2D | Context2d) {
    super(canvas, ctx);
    this.mccConfig = null;
    this.verticalTips = [];
    this.confidenceThreshold = DEFAULT_NODE_CONFIDENCE;
    this.nodeColors = [];
    this.branchColors = [];
    this.colorsUnSet = true;
    this.metadataNodeValues = [];
    this.metadataNodeValueOptions = [];
    this.totalTipMutations = [];

    this.selectable = true;
  }

  setConfig(mccConfig : MccConfig) : void {
    this.mccConfig = mccConfig;
    this.confidenceThreshold = mccConfig.confidenceThreshold;
    this.colorsUnSet = true;
  }

  positionTreeNodes(tree:Tree, creds: number[]=[], mccIndex = 0): number[][] {
    this.colorsUnSet = true;
    super.positionTreeNodes(tree, creds);
    this.setColors(tree);
    if (this.mccConfig) {
      if (this.mccConfig.ySpacing === YSpacing.genetic) {
        this.rescaleGeneticDistance(tree as SummaryTree, mccIndex);
      }
      this.confidenceThreshold = this.mccConfig.confidenceThreshold;
    }
    return this.nodeYs.map(y=>[y]);
  }


  sortTips():void {
    /* gather a list of node indexes by y position */
    const nodeYs = this.nodeYs,
      nodeCount = nodeYs.length,
      sortable = [];
    for (let i = 0; i < nodeCount; i++) {
      if (this.nodeChildren[i].length === 0) {
        const y = nodeYs[i];
        sortable.push(new TipInfo(i, y));
      }
    }
    sortable.sort((a, b)=>a.y - b.y);
    this.verticalTips = sortable;
  }



  rescaleGeneticDistance(mcc: SummaryTree, mccIndex: number):void {

    /*
    what is the genetic distance between one tip and another?

    we are only concerned with those that are next to each other
    in the current MCC topology, so we won't compare everything

    choose an abitrary base tree, as tips are the same in each tree.
      we will use the tree on which the MCC topology is based.
    for each tip pair,
        remove any shared mutations (due to multiple introductions)
        add the number of remaining mutations to the total for the pair


    gather total number of all mutation differences
      scale that to the vertical space we have
      traverse the tips in vertical order,
        assigning the scaled vertical space as you go

    */
    this.sortTips();
    const verticalTips = this.verticalTips,
      tipCount = verticalTips.length,
      totalTipMutations: number[] = new Array(tipCount),
      // treeCount = mcc.getNumBaseTrees(),
      n1Muts: Mutation[] = [],
      n2Muts: Mutation[] = [],
      tree: PhyloTree = mcc.getBaseTree(mccIndex),
      rootSequence = tree.getRootSequence(),
      addMut = (m:Mutation, arr:Mutation[])=>{
        /*
        since we are traversing back from the tips,
        if we already have a mutation at the same site as mutation m,
        then m has been overwritten and we can ignore it.
        */
        if (arr.filter(m2=>m2.site === m.site).length === 0) {
          arr.push(m);
        }
      },
      addN1Mut = (m:Mutation)=>addMut(m, n1Muts),
      addN2Mut = (m:Mutation)=>addMut(m, n2Muts),
      sortMuts = (a:Mutation, b:Mutation)=>a.site - b.site,
      tallyDifferences = (muts1: Mutation[], muts2: Mutation[]):number =>{
        muts1.sort(sortMuts);
        muts2.sort(sortMuts);
        /*
        go through the lists looking for differences
        only counts ones that are different from the root
        */
        let i1 = 0,
          i2 = 0,
          m1: Mutation,
          m2: Mutation,
          diffs = 0;
        while (i1 < muts1.length || i2 < muts2.length) {
          m1 = muts1[i1];
          m2 = muts2[i2];
          if (!m2) {
            if (m1.to !== rootSequence[m1.site]) {
              diffs++;
            }
            i1++;
          } else if (!m1) {
            if (m2.to !== rootSequence[m2.site]) {
              diffs++;
            }
            i2++;
          } else if (m1.site < m2.site) {
            if (m1.to !== rootSequence[m1.site]) {
              diffs++;
            }
            i1++;
          } else if (m1.site > m2.site) {
            if (m2.to !== rootSequence[m2.site]) {
              diffs++;
            }
            i2++;
          } else {
            if (m1.to !== m2.to) {
              diffs++;
            }
            i1++;
            i2++;
          }
        }
        return diffs;
      };
    let totalMutations = 0;
    /* the first tip is distance 0 from the non-existant tip before it */
    totalTipMutations[0] = GENETIC_DISTANCE_MIN_DIST;
    for (let i = 1; i < tipCount; i++) {
      totalTipMutations[i] = 0;
      const mccNode1Index = verticalTips[i-1].index,
        mccNode2Index = verticalTips[i].index;
      n1Muts.length = 0;
      n2Muts.length = 0;
      let n1 = mccNode1Index,
        n2 = mccNode2Index,
        t1 = tree.getTimeOf(n1),
        t2 = tree.getTimeOf(n2);
      tree.forEachMutationOf(n1, addN1Mut);
      tree.forEachMutationOf(n2, addN2Mut);
      while (n1 !== n2 && n1 >= 0 && n2 >= 0) {
        if (t1 > t2) {
          n1 = tree.getParentIndexOf(n1);
          t1 = tree.getTimeOf(n1);
          tree.forEachMutationOf(n1, addN1Mut);
        } else {
          n2 = tree.getParentIndexOf(n2);
          t2 = tree.getTimeOf(n2);
          tree.forEachMutationOf(n2, addN2Mut);
        }
      }
      /* sanity check */
      if (n1 < 0 || n2 < 0) {
        throw new Error('our tips never met at an MRCA');
      }
      const mCount = tallyDifferences(n1Muts, n2Muts) + GENETIC_DISTANCE_MIN_DIST;
      totalTipMutations[i] += mCount;
      totalMutations += mCount;
    }

    /* adjust distance based on genetic distance */
    const yRange = this.height - this.timelineSpacing - this.paddingBottom,
      tipDiffDist = totalTipMutations.map(mutCount=>mutCount / totalMutations * yRange);
    /*
    set positions of the tips, accumulating references to the inner nodes as we go
    */
    const innerIndices: number[] = [],
      nodeYs: number[] = new Array(this.nodeYs.length);
    let totalY = 0;
    verticalTips.forEach((tipInfo, vertIndex)=>{
      const nodeIndex = tipInfo.index,
        dist = tipDiffDist[vertIndex],
        parent = mcc.getParentIndexOf(nodeIndex);
      totalY += dist;
      nodeYs[nodeIndex] = totalY;
      if (parent >= 0) {
        innerIndices.push(parent);
      }
    });
    while (innerIndices.length > 0) {
      const index = innerIndices.shift();
      if (index !== undefined) {
        const left = nodeYs[mcc.getLeftChildIndexOf(index)],
          right = nodeYs[mcc.getRightChildIndexOf(index)],
          y = (left + right) / 2,
          parent = mcc.getParentIndexOf(index);
        if (y) {
          nodeYs[index] = y;
          if (parent >= 0) {
            innerIndices.push(parent);
          }
        }
      }
    }
    this.nodeYs = nodeYs;
    this.totalTipMutations = totalTipMutations;
  }


  setColors(tree:Tree): void {
    // console.debug('setColorrs');
    const mccConfig = this.mccConfig,
      size = this.nodeYs.length;
    if (!mccConfig || mccConfig.colorOption === ColorOption.confidence) {
      const confidenceThreshold = this.confidenceThreshold;
      for (let index = 0; index < size; index++) {
        let confidence = this.creds[index];
        if (isTip(tree,index)) {
          confidence = this.creds[this.nodeParents[index]];
          this.nodeColors[index] = confidence >= confidenceThreshold ? HI_CONFIDENCE_COLOR : LOW_CONFIDENCE_COLOR;
          this.branchColors[index] = HI_CONFIDENCE_COLOR;
        } else {
          const hiConf = confidence >= confidenceThreshold,
            color = hiConf ? HI_CONFIDENCE_COLOR : LOW_CONFIDENCE_COLOR;
          this.nodeColors[index] = color;
          this.branchColors[index] = color;
          if (!hiConf) {
            this.branchWeights[index] = BRANCH_WEIGHT;
          }
        }
      }
    } else if (mccConfig.metadataColors) {
      /* tips are the same across all base trees */
      // this.metadataNodeValues = values.map(v=>v as string);
      // this.metadataNodeValueOptions = optionCounts;
      this.metadataNodeValues = mccConfig.getMetadataValues();
      this.metadataNodeValueOptions = mccConfig.getMetadataTipCounts();
      const nodeValues = this.metadataNodeValues;
      for (let index = 0; index < size; index++) {
        const value = nodeValues[index],
          color = mccConfig.getMetadataColor(value);
        this.nodeColors[index] = color;
        this.branchColors[index] = color;
      }
    }
    this.colorsUnSet = false;
  }


  setNodeColor(index:number, ctx:CanvasRenderingContext2D):void {
    // if (this.colorsUnSet) {
    //   this.setColors(tree);
    // }
    (ctx || this.ctx).fillStyle = this.nodeColors[index];
  }

  setBranchColor(index:number, ctx:CanvasRenderingContext2D):void {
    // if (this.colorsUnSet) {
    //   this.setColors(tree);
    // }
    (ctx || this.ctx).strokeStyle = this.branchColors[index];
  }

  setNoding(noding: boolean, isSelectable: boolean) {
    if (this.canvas instanceof PdfCanvas) return;
    this.canvas.classList.toggle("noding", noding);
    this.canvas.classList.toggle("new-node", noding && isSelectable);
  }

  setFade(fade: boolean) {
    this.maxOpacity = fade ? FADE_OPACITY : 1.0;
  }

  // drawMutations(tree:PhyloTree, nodeYs: number[], earliest:number, latest:number): void {
  //   for (const m of node.mutations) {
  //     const mx = this.xFor(m.t(), this.width, earliest, latest), my = nodeYs[node.index || 0];
  //     // this.ctx.beginPath();
  //     this.ctx.moveTo(my + MUTATION_RADIUS, my);
  //     this.ctx.arc(mx, my, MUTATION_RADIUS, 0, 2*Math.PI);
  //     // this.ctx.fill();
  //   }
  // }

}


export const instantiateMccTreeCanvas = (selector: string)=>{
  const maybeCanvas = document.querySelector(selector);
  if (maybeCanvas === null) {
    throw new Error(`UI canvas '${selector}' not found`);
  }
  if (!(maybeCanvas instanceof HTMLCanvasElement)) {
    throw new Error(`UI canvas '${selector}' is not a canvas`);
  }
  const maybeCtx = maybeCanvas.getContext("2d");
  if (maybeCtx === null) {
    throw new Error('This browser does not support 2-dimensional canvas rendering contexts.');
  }
  return new MccTreeCanvas(maybeCanvas, maybeCtx);
}
