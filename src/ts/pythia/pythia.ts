import {Delphy, Run, Tree, PhyloTree, MccTree, SummaryTree, Mutation} from './delphy_api';
import {MccRef, MccRefManager} from './mccref';
import {MutationDistribution} from './mutationdistribution';
import {getMutationName, TipsByNodeIndex, MutationDistInfo, BaseTreeSeriesType, mutationEquals, RunParamConfig, NodeDistributionType, OverlapTally, CoreVersionInfo} from '../constants';
import {getMccMutationsOfInterest, MutationOfInterestSet} from './mutationsofinterest';
import {MostCommonSplitTree} from './mostcommonsplittree';
import {BackLink, MccNodeBackLinks} from './pythiacommon';
import {MccUmbrella} from './mccumbrella';
import { isTip } from '../util/treeutils';
import { ConfigExport } from '../ui/mccconfig';
import { UNSET } from '../ui/common';

type returnless = ()=>void;

type emptyResolveType = (m:undefined)=>void;

const SAVE_FORMAT_VERSION = 3;

const CORE_VERSIONING_SAVE_VERSION = 3;

const NO_MORE_TREES = 0;
const BIGINT_SIZE = 2;

const stringToBytes = (s:string)=>{
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    bytes[i] = s.charCodeAt(i);
  }
  return bytes;
}


const APP_MAGIC_NUMBER = "DPHY",
  APP_MAGIC_NUMBER_BYTES = stringToBytes(APP_MAGIC_NUMBER),
  APP_MAGIC_NUMBER_SIZE = APP_MAGIC_NUMBER_BYTES.byteLength;

export class Pythia {

  private mccRefManager: MccRefManager | null;
  private currentMccRef: MccRef | null;
  private delphy: Delphy;
  private run: Run | null;
  private mcs: MostCommonSplitTree | null;

  sourceTree: PhyloTree | null;
  stepsPerSample: number;
  isRunning: boolean;
  muHist : number[];
  muStarHist: number[];
  totalBranchLengthHist : number[];
  logPosteriorHist : number[];
  logGHist : number[];
  numMutationsHist : number[];
  popT0Hist: number[];
  popN0Hist: number[];
  popGHist: number[];
  stepsHist : number[];
  paramsHist: ArrayBuffer[];
  treeHist: PhyloTree[];
  kneeIndex: number;
  runReadyCallback: ()=>void;
  fb: ArrayBuffer;
  maxDate: number;
  tipCounts: TipsByNodeIndex;
  /*
  for each node in each base tree in the mcc,
  what is the corresponding node in the mcc?
  */
  mccNodeBackLinks: MccNodeBackLinks;


  coreVersion: CoreVersionInfo;
  saveVersion: CoreVersionInfo | null;


  constructor() {
    if (!globalDelphy) {
      throw "can't wrap the delphy code before it's ready";
    }
    this.delphy = globalDelphy;
    this.run = null;
    this.stepsPerSample = 100_000;
    this.sourceTree = null;
    this.isRunning = false;
    this.muHist = [];
    this.muStarHist = [];
    this.totalBranchLengthHist = [];
    this.logPosteriorHist = [];
    this.logGHist = [];
    this.numMutationsHist = [];
    this.popT0Hist = [];
    this.popN0Hist = [];
    this.popGHist = [];
    this.stepsHist = [];
    this.paramsHist = [];
    this.treeHist = [];
    this.kneeIndex = 0;
    this.mccRefManager = null;
    this.currentMccRef = null;
    this.fb = new ArrayBuffer(0);
    this.maxDate = -1;
    this.tipCounts = [];
    this.mccNodeBackLinks = [];
    this.mcs = null;
    this.coreVersion = {
      "version" : this.delphy.getVersionString(),
      "build" : this.delphy.getBuildNumber(),
      "commit" : this.delphy.getCommitString()
    };
    this.saveVersion = null;
    this.runReadyCallback = ()=>{return;};
  }

  initRunFromFasta(fastaBytesJs:ArrayBuffer, runReadyCallback:()=>void):void {
    console.log("Loading FASTA file...");
    const startTime = Date.now();
    this.runReadyCallback = runReadyCallback;
    this.fb = fastaBytesJs.slice(0);
    this.delphy.parseFastaIntoInitialTreeAsync(fastaBytesJs)
      .then(phyloTree => {
        console.log("Creating run", phyloTree);
        this.sourceTree = phyloTree;
        console.log(`fasta parsed and initial tree generated in ${Date.now() - startTime}ms`);
        this.instantiateRun().then(()=>this.runReadyCallback());
      });
  }

  async instantiateRun() : Promise<void>{
    const prom = new Promise((resolve: emptyResolveType, reject: emptyResolveType)=>{
      if (this.sourceTree) {
        /*
          Assuming the max date will always be on a tip,
          and the times of the tips don't change,
          we can get the max date now.
          */
        const count = this.sourceTree.getSize(),
          startTime = Date.now();
        let t = this.sourceTree.getTimeOf(0);
        for (let i = 0; i < count; i++) {
          if (isTip(this.sourceTree, i)) {
            t = Math.max(t, this.sourceTree.getTimeOf(i));
          }
        }
        this.maxDate = t;
        this.run = this.delphy.createRun(this.sourceTree);
        const tipCount = (count + 1) / 2,
          targetStepSize = Math.pow(10, Math.ceil(Math.log(tipCount * 1000)/ Math.log(10)));
        this.stepsPerSample = targetStepSize;
        console.log(`Setting parallelism to ${navigator.hardwareConcurrency}`);
        this.run.setNumParts(navigator.hardwareConcurrency);
        this.sampleCurrentTree();
        this.delphy.deriveMccTreeAsync(this.treeHist.slice(this.kneeIndex))
          .then((mccTree:MccTree) => {
            this.updateMcc(mccTree);
            console.debug(`run instantiated and mcc updated in ${Date.now() - startTime}ms`);
            resolve(undefined);
          })
          .catch(err=>{
            console.debug(err);
            reject(undefined);
          })
      } else {
        reject(undefined);
      }

    });
    return prom;
  }



  getTipIds() : string[] {
    const tree: PhyloTree = this.treeHist[0],
      count = tree.getSize(),
      tipIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const tipId = tree.getNameOf(i).split('|')[0];
      tipIds[i] = tipId;
    }
    return tipIds;
  }




  // ███    ███  ██████  ██████
  // ████  ████ ██      ██
  // ██ ████ ██ ██      ██
  // ██  ██  ██ ██      ██
  // ██      ██  ██████  ██████




  recalcMccTree(): Promise<MccTree> {
    return this.delphy.deriveMccTreeAsync(this.treeHist.slice(this.kneeIndex))
      .then((mccTree:MccTree) => {
        this.updateMcc(mccTree);
        return mccTree;
      });
  }


  getMcc():MccRef {
    if (!this.mccRefManager) {
      throw new Error('no mcc available yet');
    }
    this.mccNodeBackLinks.length = 0;
    return this.mccRefManager.getRef();
  }

  getMccIndex(): number {
    let index = -1;
    if (this.mccRefManager) {
      index = this.kneeIndex + this.mccRefManager.mccIndex;
    }
    return index;
  }


  updateMcc(mccTree:MccTree):void {
    if (!this.mccRefManager || mccTree !== this.mccRefManager.mcc) {
      const oldRef = this.currentMccRef;
      this.mccRefManager = new MccRefManager(mccTree);
      this.currentMccRef = this.mccRefManager.getRef();
      if (oldRef) {
        oldRef.release();
      }
      this.tipCounts.length = 0;
      this.mccNodeBackLinks.length = 0;
      this.mcs = null;
    }
  }

  setMccBackLinks():void {
    if (this.mccNodeBackLinks.length === 0 && this.mccRefManager) {
      const ref = this.mccRefManager.getRef(),
        mcc = ref.getMcc();
      this.setBackLinks(mcc);
      ref.release();
    }
  }


  setBackLinks(mcc: SummaryTree):void {
    if (this.mccNodeBackLinks.length === 0) {
      this.mccNodeBackLinks = this.getBackLinks(mcc);
    }
  }

  /*
  for each base tree, create a listing for each node
  to which mcc node is the MRCA of the tips in that node
  */
  getBackLinks(mcc: SummaryTree) : BackLink[][] {
    const treeCount = mcc.getNumBaseTrees(),
      nodeCount = mcc.getSize(),
      tipCount = (nodeCount+1)/2,
      mccNodeBackLinks:BackLink[][] = [];
    for (let t = 0; t < treeCount; t++) {
      const treeLinks = Array(nodeCount),
        tree = mcc.getBaseTree(t);
      /*
      for each node in the mcc, find the corresponding node in the base tree.
      for tips, they will always be in the same position, and are
      an exact match.
      */
      for (let nodeIndex = 0; nodeIndex < tipCount; nodeIndex++) {
        const backLink: BackLink = {nodeIndex: nodeIndex, isExactMatch: true};
        treeLinks[nodeIndex] = backLink;
      }
      /*
      for inner nodes, we query the MCC interface to find the corresponding
      base tree node, and whether it is monophyletic to the MCC node.
      */
      for (let mccNodeIndex = tipCount; mccNodeIndex < nodeCount; mccNodeIndex++) {
        const baseTreeNodeIndex = mcc.getCorrespondingNodeInBaseTree(mccNodeIndex, t),
          isMonophyletic = !!mcc.isExactMatchInBaseTree(mccNodeIndex, t),
          backLink: BackLink = {nodeIndex: mccNodeIndex, isExactMatch: isMonophyletic};
        /*
        multiple mcc nodes can map to the same base tree node, so how to choose the best one?
        take the one that is an exact match, or the most recent
        */
        if (!treeLinks[baseTreeNodeIndex]) treeLinks[baseTreeNodeIndex] = backLink;
        else if (isMonophyletic) treeLinks[baseTreeNodeIndex] = backLink;
        else if (!treeLinks[baseTreeNodeIndex].isExactMatch) {
          const t1 = mcc.getMrcaTimeOf(treeLinks[baseTreeNodeIndex].nodeIndex),
            t2 = mcc.getMrcaTimeOf(mccNodeIndex);
          if (t2 > t1) {
            treeLinks[baseTreeNodeIndex] = backLink;
          }
        }
      }
      /*
      the base tree may have nodes that were not mapped from the MCC, so find
      those and fill them in (tips will always be filled in, so we can skip those)
      */
      for (let n = tipCount; n < nodeCount; n++) {
        let p = n;
        while (!treeLinks[p]) {
          while (!treeLinks[p] && p !== -1) {
            p = tree.getParentIndexOf(p);
          }
          const mccNodeIndex: number = treeLinks[p].nodeIndex;
          treeLinks[n] = {nodeIndex: mccNodeIndex, isExactMatch: false};
        }
      }
      mccNodeBackLinks[t] = treeLinks;
    }
    return mccNodeBackLinks;
  }



  getMostCommonSplitTree() : Tree | null {
    let bestOf = null;
    if (this.mcs) {
      bestOf = this.mcs;
    } else if (this.mccRefManager) {
      const ref = this.mccRefManager.getRef(),
        mcc = ref.getMcc();
      bestOf = new MostCommonSplitTree(mcc);
      ref.release();
      this.mcs = bestOf;
    }
    this.mccNodeBackLinks.length = 0;
    return bestOf;
  }

  /*
  TODO:
    this assumes that the umbrella tree is getting
    built from the MCC, not a most common split tree
  */
  getUmbrellaTree(mcc: SummaryTree) : MccUmbrella {
    this.setBackLinks(mcc);
    const umbrella = new MccUmbrella(mcc, this.mccNodeBackLinks);
    return umbrella;
  }




  // ██████  ██    ██ ███    ██     ██    ██ ██
  // ██   ██ ██    ██ ████   ██     ██    ██ ██
  // ██████  ██    ██ ██ ██  ██     ██    ██ ██
  // ██   ██ ██    ██ ██  ██ ██     ██    ██ ██
  // ██   ██  ██████  ██   ████      ██████  ██







  setSteps(steps:number):void {
    this.stepsPerSample = steps;
    console.debug(`steps: ${steps}`)
  }

  runSteps(callBack:()=>void):void {
    const run = this.run;
    if (run){
      run.runStepsAsync(this.stepsPerSample)
        .then(callBack);
    }
  }

  startRun(callback:(null|returnless)):void {
    if (this.run) {
      this.isRunning = true;
      const runCallback = ()=>{
        this.sampleCurrentTree();
        this.delphy.deriveMccTreeAsync(this.treeHist.slice(this.kneeIndex))
          .then((mccTree:MccTree) => {
            this.updateMcc(mccTree);
            if (callback) callback();
            if (this.isRunning) {
              this.runSteps(runCallback);
            }
          });
      };
      this.runSteps(runCallback);
    }
  }


  sampleCurrentTree():void {
    if (this.run) {
      this.muHist.push(this.run.getMu());
      this.totalBranchLengthHist.push(this.run.getTotalBranchLength());
      this.logPosteriorHist.push(this.run.getLogPosterior());
      this.logGHist.push(this.run.getLogG());
      this.numMutationsHist.push(this.run.getNumMutations());
      this.popT0Hist.push(this.run.getPopT0());
      this.popN0Hist.push(this.run.getPopN0());
      this.popGHist.push(this.run.getPopG());
      this.stepsHist.push(this.run.getStep())
      this.paramsHist.push(this.run.getParamsToFlatbuffer());
      // copy() is crucial: the underlying tree keeps changing!
      this.treeHist.push(this.run.getTree().copy());
    }
  }


  pauseRun():void {
    this.isRunning = false;
  }


  async reset(runParams: RunParamConfig): Promise<void> {
    const prom = new Promise((resolve: emptyResolveType)=>{
      if (this.stepsHist.length > 1) {
        const rereadingFasta = this.fb.byteLength > 0;
        let firstTree: PhyloTree | null = null;
        if (this.run) {
          this.run.delete();
          this.run = null;
        }
        if (!rereadingFasta) {
          firstTree = this.treeHist[0].copy();
        }
        this.isRunning = false;
        this.treeHist.forEach((tree:PhyloTree)=>tree.delete());
        this.treeHist.length = 0;
        this.muHist.length = 0;
        this.muStarHist.length = 0;
        this.totalBranchLengthHist.length = 0;
        this.logPosteriorHist.length = 0;
        this.logGHist.length = 0;
        this.numMutationsHist.length = 0;
        this.popT0Hist.length = 0;
        this.popN0Hist.length = 0;
        this.popGHist.length = 0;
        this.stepsHist.length = 0;
        this.paramsHist.length = 0;
        this.kneeIndex = 0;
        const fastaBytesJs = this.fb;
        this.fb = fastaBytesJs.slice(0);
        this.mcs = null;
        if (rereadingFasta) {
          this.delphy.parseFastaIntoInitialTreeAsync(this.fb)
            .then(phyloTree => {
              this.sourceTree = phyloTree;
              this.instantiateRun().then(()=>{
                this.setParams(runParams);
                this.runReadyCallback();
                resolve(undefined);
              });
            });
        } else if (firstTree) {
          this.sourceTree = firstTree;
          this.instantiateRun().then(()=>{
            this.setParams(runParams);
            this.runReadyCallback();
            resolve(undefined);
          });
        }
      }
    });
    return prom;
  }

  setParams(runParams: RunParamConfig) : void {
    const run = this.run;
    if (!run) {
      throw new Error('failed to create new run after reset');
    }
    // console.debug('setting params', runParams)
    this.stepsPerSample = runParams.stepsPerSample;
    run.setAlphaMoveEnabled(runParams.siteRateHeterogeneityEnabled);
    run.setMuMoveEnabled(!runParams.mutationRateIsFixed);
    this.setSiteRateHeterogeneityEnabled(runParams.siteRateHeterogeneityEnabled);
    if (runParams.mutationRate > 0) {
      run.setMu(runParams.mutationRate);
    }
  }


  setKneeIndexByPct(percent:number):void {
    this.kneeIndex = Math.round(percent * this.stepsHist.length);
    this.mcs = null;
  }

  getBaseTreeCount() : number {
    return this.treeHist.length;
  }

  setMutationRateMovesEnabled(theyAre: boolean) : void {
    if (!this.run) {
      throw new Error( 'no run on which to set mu move enabled');
    }
    this.run.setMuMoveEnabled(theyAre);
  }

  setMutationRate(rate: number) : void {
    if (!this.run) {
      throw new Error( 'no run on which to set mutation rate');
    }
    this.run.setMu(rate);
  }

  getdMutationRateMovesEnabled() : boolean {
    if (!this.run) {
      throw new Error( 'no run from which to get mu move enabled');
    }
    /* run.isMuMoveEnabled() returns a truthy integer 1, so convert that to an actual boolean */
    return !!this.run.isMuMoveEnabled();
  }

  setSiteRateHeterogeneityEnabled(itIs: boolean) : void {
    if (!this.run) {
      throw new Error( 'no run on which to set alpha moves enabled');
    }
    this.run.setAlphaMoveEnabled(itIs);
  }

  getSiteRateHeterogeneityEnabled() : boolean {
    return !!(this.run?.isAlphaMoveEnabled());
  }

  getCurrentMu() : number {
    if (!this.run) {
      throw new Error( 'no run from which to get mu');
    }
    return this.run.getMu();
  }





  // ███    ███  ██████  ██████     ██    ██ ██
  // ████  ████ ██      ██          ██    ██ ██
  // ██ ████ ██ ██      ██          ██    ██ ██
  // ██  ██  ██ ██      ██          ██    ██ ██
  // ██      ██  ██████  ██████      ██████  ██



  getBaseTreeMinDate():number {
    let minDate = 0;
    this.treeHist.slice(this.kneeIndex).forEach((tree:PhyloTree)=>{
      const d = tree.getTimeOf(tree.getRootIndex());
      minDate = Math.min(minDate, d);
    })
    return minDate;
  }





  // ███    ██  ██████  ██████  ███████ ███████
  // ████   ██ ██    ██ ██   ██ ██      ██
  // ██ ██  ██ ██    ██ ██   ██ █████   ███████
  // ██  ██ ██ ██    ██ ██   ██ ██           ██
  // ██   ████  ██████  ██████  ███████ ███████


  getNodeTimeDistribution(nodeIndex: number, summaryTree: SummaryTree): number[] {
    const times = [];
    for (let treeIndex = 0; treeIndex < summaryTree.getNumBaseTrees(); treeIndex++) {
      const localNodeIndex = summaryTree.getCorrespondingNodeInBaseTree(nodeIndex, treeIndex),
        tree = summaryTree.getBaseTree(treeIndex),
        time = tree.getTimeOf(localNodeIndex);
      times.push(time);
    }
    return times;
  }


  getMccMutationsBetween(upstreamMccNodeIndex: number,
    downstreamMccNodeIndex: number, tree: SummaryTree): MutationDistribution[] {
    let muts: MutationDistribution[] = [];
    if (downstreamMccNodeIndex !== UNSET) {
      const treeCount = tree.getNumBaseTrees(),
        mutationLookup: { [name: string]: MutationDistribution } = {},
        tallyMutation = (mut:Mutation)=>{
          const name:string = getMutationName(mut);
          if (mutationLookup[name] === undefined) {
            mutationLookup[name] = new MutationDistribution(mut, treeCount);
          }
          mutationLookup[name].addTime(mut.time);
        },
        /*
          first we find the set of trees in the mcc that contain both nodes
          */
        upstreamTrees: number[] = [];
      for (let treeIndex = 0; treeIndex < tree.getNumBaseTrees(); treeIndex++) {
        const nodeIndex = tree.getCorrespondingNodeInBaseTree(upstreamMccNodeIndex, treeIndex);
        upstreamTrees[treeIndex] = nodeIndex;
      }
      for (let treeIndex = 0; treeIndex < tree.getNumBaseTrees(); treeIndex++) {
        try {
          const upstreamIndex = upstreamTrees[treeIndex];
          if (upstreamIndex !== undefined) {
            const baseTree = tree.getBaseTree(treeIndex);
            let index = tree.getCorrespondingNodeInBaseTree(downstreamMccNodeIndex, treeIndex);
            while (index >= 0 && index !== upstreamIndex) {
              baseTree.forEachMutationOf(index, tallyMutation);
              index = baseTree.getParentIndexOf(index);
            }
          }
        } catch (error) {
          console.warn(`mcc upstream node ${upstreamMccNodeIndex}, mcc downstream node ${downstreamMccNodeIndex}, tree ${treeIndex} of ${tree.getNumBaseTrees()}`);
          throw error;
        }
      }
      muts = Object.values(mutationLookup);
    }
    return muts;
  }



  getMccNodeTipCount(nodeIndex: number) : number {
    if (this.tipCounts.length === 0 && this.mccRefManager) {
      const ref = this.mccRefManager.getRef(),
        mcc = ref.getMcc();
      this.tipCounts = this.gatherNodeTips(mcc);
      ref.release();
    }
    return this.tipCounts[nodeIndex].length;
  }

  getMccNodeTips(nodeIndex: number) : number[] {
    if (this.tipCounts.length === 0 && this.mccRefManager) {
      const ref = this.mccRefManager.getRef(),
        mcc = ref.getMcc();
      this.tipCounts = this.gatherNodeTips(mcc);
      ref.release();
    }
    return this.tipCounts[nodeIndex];
  }


  /*
  returns a 2d array,
  where the first dimension is indexed by node index.
  The second dimension is the list of node indexes
  of the tips under that node; if that list has only
  one entry, it's a tip. Otherwise, the list
  corresponds to an inner node.
  */
  gatherNodeTips(tree: Tree): TipsByNodeIndex {
    const tipsByNodeIndex: TipsByNodeIndex = [],
      size = tree.getSize();
    for (let i = 0; i < size; i++) {
      tipsByNodeIndex[i] = [];
    }
    for (let i = 0; i < size; i++) {
      if (isTip(tree, i)) {
        let j = i;
        while (j >= 0) {
          tipsByNodeIndex[j].push(i);
          j = tree.getParentIndexOf(j);
        }
      }
    }
    return tipsByNodeIndex;
  }

  getPopulationNodeDistribution(nodeIndices: number[], minDate: number, maxDate: number, summaryTree: SummaryTree): NodeDistributionType {
    const baseSeries: BaseTreeSeriesType = [],
      overlap: OverlapTally[] = [],
      nodeDist: NodeDistributionType = {series: baseSeries, overlap: overlap},
      treeCount = summaryTree.getNumBaseTrees(),
      startDate = Math.floor(minDate-1),
      range = maxDate - startDate + 1;
    if (treeCount > 0) {
      for (let t = 0; t < treeCount; t++) {
        const tree = summaryTree.getBaseTree(t),
          baseTreeIndex = t + this.kneeIndex,
          popT0 = this.popT0Hist[baseTreeIndex],
          popN0 = this.popN0Hist[baseTreeIndex],
          popG = this.popGHist[baseTreeIndex],
          // baseTreeIndices = nodeIndices.map(mccNodeIndex=>{
          //   /* only plot population for exact matches */
          //   const baseTreeNodeIndex = summaryTree.getCorrespondingNodeInBaseTree(mccNodeIndex, t),
          //     isMonophyletic = summaryTree.isNodeMonophyleticInBaseTree(mccNodeIndex, t);
          //   return isMonophyletic ? baseTreeNodeIndex : UNSET;
          // }),
          baseTreeIndices = nodeIndices.map(mccNodeIndex=>summaryTree.getCorrespondingNodeInBaseTree(mccNodeIndex, t)),
          deduped = baseTreeIndices.map((n, i)=>i === baseTreeIndices.lastIndexOf(n) ? n : UNSET),
          treeDist = this.delphy.popModelProbeAncestorsOnTree(
            tree, popT0, popN0, popG, deduped, startDate - 1, maxDate, range);
        baseTreeIndices.forEach((nodeIndex, i)=>{
          const d = deduped[i];
          if (d !== nodeIndex) {
            const j = deduped.indexOf(nodeIndex);
            let found = false;
            overlap.forEach(item=>{
              if (item.index1 === i && item.index2 === j) {
                item.count++;
                found = true;
              }
            });
            if (!found) {
              overlap.push({index1: i, index2: j, count: 1});
            }
          }
        });
        baseSeries.push(treeDist);
      }
    }
    return nodeDist;
  }








  // ███    ███ ██    ██ ████████  █████  ████████ ██  ██████  ███    ██ ███████
  // ████  ████ ██    ██    ██    ██   ██    ██    ██ ██    ██ ████   ██ ██
  // ██ ████ ██ ██    ██    ██    ███████    ██    ██ ██    ██ ██ ██  ██ ███████
  // ██  ██  ██ ██    ██    ██    ██   ██    ██    ██ ██    ██ ██  ██ ██      ██
  // ██      ██  ██████     ██    ██   ██    ██    ██  ██████  ██   ████ ███████


  /*
  mutations of interest
  */
  getMutationsOfInterest(): MutationOfInterestSet | null {
    let moi : MutationOfInterestSet | null = null;
    if (this.mccRefManager) {
      // const start = Date.now();
      const ref = this.mccRefManager.getRef(),
        mcc = ref.getMcc();
      moi = getMccMutationsOfInterest(mcc);
      // console.degub(`getMutationsOfInterest() elapsed ${Date.now() -  start}`, moi);
      ref.release();
    }
    return moi;
  }


  getMutationDistributionInfo(mutation: Mutation, summaryTree: SummaryTree): MutationDistInfo {
    this.setBackLinks(summaryTree);
    const times: number[] = [],
      nodeIndices: number[] = [],
      treeCount = summaryTree.getNumBaseTrees(),
      nodeCount = summaryTree.getSize();
    let tree: PhyloTree,
      t: number,
      n: number;
    for (t = 0; t < treeCount; t++) {
      tree = summaryTree.getBaseTree(t);
      for (n = 0; n < nodeCount; n++) {
        tree.forEachMutationOf(n, (m: Mutation)=>{
          if (mutationEquals(m, mutation)) {
            times.push(m.time);
            nodeIndices.push(this.mccNodeBackLinks[t][n].nodeIndex);
          }
        });
      }
    }
    return {times, nodeIndices};
  }



  getPopulationAlleleDistribution(site:number, minDate: number, maxDate: number,
    summaryTree: SummaryTree): BaseTreeSeriesType {
    const alleleDist: BaseTreeSeriesType = [],
      treeCount = summaryTree.getNumBaseTrees(),
      startDate = Math.floor(minDate-1),
      range = maxDate - startDate + 1;
    if (treeCount > 0) {
      for (let t = 0; t < treeCount; t++) {
        const tree = summaryTree.getBaseTree(t),
          baseTreeIndex = t + this.kneeIndex,
          popT0 = this.popT0Hist[baseTreeIndex],
          popN0 = this.popN0Hist[baseTreeIndex],
          popG = this.popGHist[baseTreeIndex],
          treeDist = this.delphy.popModelProbeSiteStatesOnTree(
            tree, popT0, popN0, popG, site, startDate - 1, maxDate, range);
        //   maxTValue = Math.max(...treeDist[RealSeqLetter_T]);
        // if (maxTValue === 0) {
        //   console.log("???", treeDist);
        // }
        alleleDist.push(treeDist);
      }
    }
    return alleleDist;
  }





  // ███████  █████  ██    ██ ███████
  // ██      ██   ██ ██    ██ ██
  // ███████ ███████ ██    ██ █████
  //      ██ ██   ██  ██  ██  ██
  // ███████ ██   ██   ████   ███████


  getSaveBuffer(config: ConfigExport):Uint8Array {
    if (this.paramsHist.length !== this.treeHist.length) {
      throw new Error(`The run data is corrupted: different counts of params (${this.paramsHist.length}) and trees (${this.treeHist.length})`);
    }
    const uint32Size = 4,
      treeBuffers = this.treeHist.map(baseTree=>baseTree.toFlatbuffer()),
      infoBuffer: ArrayBuffer = this.treeHist[0].infoToFlatbuffer(),
      paramsHist = this.paramsHist,
      treeCount = paramsHist.length,
      getSize = (buffer: ArrayBuffer)=>buffer.byteLength,
      getArrBuffArrSize = (arr: ArrayBuffer[])=>arr.reduce((tot, buff)=>tot + getSize(buff), 0),
      coreVersion = stringToBytes(this.coreVersion.version),
      coreCommit = stringToBytes(this.coreVersion.commit);
    /*
    other than the trees and metadana, what variables do we need to store?
      SAVE_FORMAT_VERSION
      size of the delphy core version string
      size of the delphy core commit string
      delphy core build number
      knee
      step size
      siteRateHeterogeneityEnabled

      mutationRateIsFixed
      mutationRate
      size of the tree info
      2 for each tree (one for the size of the tree and one for the size of the params)
      flag marking the end of the tree loading: NO_MORE_TREES
      size of the config / metadata
      and a 64 bit int at the end to indicate where the trees stop (per @pvarilly request)
    */

    const exp: string = JSON.stringify(config),
      metadata = new TextEncoder().encode(exp),
      metadataSize = metadata.byteLength,
      versioningSize = coreVersion.length + coreCommit.length;
    const configParamCount = 13,
      extraParamCount = configParamCount + treeCount * 2 + BIGINT_SIZE,
      requiredSize = APP_MAGIC_NUMBER_SIZE
        + extraParamCount * uint32Size
        + versioningSize
        + getSize(infoBuffer)
        + getArrBuffArrSize(treeBuffers)
        + getArrBuffArrSize(paramsHist)
        + metadataSize;
    let pos = 0,
      treeEndPosition = BigInt(UNSET);
    /*
    Rather than figure out how to output 32 bit floats in 8 bit chunks (a fun
    exercise for another day), we'll just create a buffer that can be set
    from a 32 bit float and read in 8 bit int chunks
    */
    const conversionBuffer = new ArrayBuffer(4),
      floatCache = new Float32Array(conversionBuffer),
      asInt = new Uint8Array(conversionBuffer),
      bigIntBuffer = new ArrayBuffer(8),
      bigIntCache = new BigInt64Array(bigIntBuffer),
      asInts = new Uint8Array(bigIntBuffer);

    const outBuffer = new Uint8Array(requiredSize),
      writeBytes = (u8arr:Uint8Array)=>{
        u8arr.forEach(bite=>outBuffer[pos++] = bite);
      },
      write32 = (u32:number)=>{
        outBuffer[pos++] = (u32 & 0x000000ff);
        outBuffer[pos++] = (u32 & 0x0000ff00) >> 8;
        outBuffer[pos++] = (u32 & 0x00ff0000) >> 16;
        outBuffer[pos++] = (u32 & 0xff000000) >> 24;
      },
      write64 = (u64:bigint)=>{
        bigIntCache[0] = u64;
        outBuffer[pos++] = asInts[0];
        outBuffer[pos++] = asInts[1];
        outBuffer[pos++] = asInts[2];
        outBuffer[pos++] = asInts[3];
        outBuffer[pos++] = asInts[4];
        outBuffer[pos++] = asInts[5];
        outBuffer[pos++] = asInts[6];
        outBuffer[pos++] = asInts[7];
      },
      write32f = (f32:number)=>{
        floatCache[0] = f32;
        outBuffer[pos++] = asInt[0];
        outBuffer[pos++] = asInt[1];
        outBuffer[pos++] = asInt[2];
        outBuffer[pos++] = asInt[3];
      },
      copyFlatbuffer = (buffer: ArrayBuffer, expectedLength: number)=>{
        const start = pos;
        const asUint8 = new Uint8Array(buffer);
        for (let i = 0; i < expectedLength; i++) {
          outBuffer[pos++] = asUint8[i];
        }
        const actual = pos - start;
        console.assert(expectedLength===actual, '%o', {expectedLength, actual})
      };
    writeBytes(APP_MAGIC_NUMBER_BYTES);
    write32(SAVE_FORMAT_VERSION);
    write32(coreVersion.length);
    writeBytes(coreVersion);
    write32(this.coreVersion.build);
    write32(coreCommit.length);
    writeBytes(coreCommit);
    write32(this.kneeIndex);
    write32(this.stepsPerSample);
    write32(this.run && this.run.isAlphaMoveEnabled() ? 1 : 0);
    write32(0);
    write32(this.run && this.run.isMuMoveEnabled() ? 1 : 0);
    write32f(this.run?.getMu() || 0);
    write32(getSize(infoBuffer));
    copyFlatbuffer(infoBuffer, getSize(infoBuffer));
    for (let i = 0; i < treeCount; i++) {
      const treeSize = getSize(treeBuffers[i]);
      if (treeSize === NO_MORE_TREES) {
        console.warn(`tree ${i} of ${treeCount} is of size 0, which will prevent loading any more trees when reloading the .dphy file.`);
        if (confirm(`This save file is unexpectedly corrupted, we can only save ${i-1} of the ${treeCount} sampled trees. You can cancel saving this file, but if you want to save it anyway, hit OK`)) {
          break;
        } else {
          throw new Error(`tree ${i} of ${treeCount} is of size 0.`);
        }
      }
      write32(treeSize);
      write32(getSize(paramsHist[i]));
      copyFlatbuffer(treeBuffers[i], getSize(treeBuffers[i]));
      copyFlatbuffer(paramsHist[i], getSize(paramsHist[i]));
    }
    treeEndPosition = BigInt(pos);
    write32(NO_MORE_TREES);
    write32(metadataSize);
    for (let i = 0; i < metadata.length; i++) {
      outBuffer[pos++] = metadata[i];
    }
    write64(treeEndPosition);
    console.assert(pos === requiredSize, 'Predicted size of save buffer does not match actual size of data: %o', {pos, requiredSize});
    return outBuffer;
  }





  initRunFromSaveFile = (raw: ArrayBuffer, runReadyCallback:()=>void)=>{
    const startTime = Date.now();
    this.runReadyCallback = runReadyCallback;
    let pos = 0;
    /*
    To read a float from the file, we load a buffer of 4 8 bit chunks,
    and then read it as a 32 bit float.
    */
    const conversionBuffer = new ArrayBuffer(4),
      floatCache = new Float32Array(conversionBuffer),
      asInt = new Uint8Array(conversionBuffer),
      bigIntBuffer = new ArrayBuffer(8),
      bigIntCache = new BigInt64Array(bigIntBuffer),
      asInts = new Uint8Array(bigIntBuffer);

    const buffer = new Uint8Array(raw),
      actualSize = buffer.byteLength,
      read32 = ()=>{
        let value = 0;
        value += buffer[pos++];
        value += buffer[pos++] << 8;
        value += buffer[pos++] << 16;
        value += buffer[pos++] << 24;
        return value;
      },
      read64 = ()=>{
        asInts[0] = buffer[pos++];
        asInts[1] = buffer[pos++];
        asInts[2] = buffer[pos++];
        asInts[3] = buffer[pos++];
        asInts[4] = buffer[pos++];
        asInts[5] = buffer[pos++];
        asInts[6] = buffer[pos++];
        asInts[7] = buffer[pos++];
        return bigIntCache[0];
      },
      read32f = ()=> {
        asInt[0] = buffer[pos++];
        asInt[1] = buffer[pos++];
        asInt[2] = buffer[pos++];
        asInt[3] = buffer[pos++];
        return floatCache[0];
      },
      readBuffer = (length: number)=>{
        const buf = new Uint8Array(length);
        for (let j = 0; j < length; j++) {
          buf[j] = buffer[pos++];
        }
        return buf;
      },
      readString = (length: number)=>{
        let s = '';
        for (let j = 0; j < length; j++) {
          s += String.fromCharCode(buffer[pos++]);
        }
        return s;
      }

    APP_MAGIC_NUMBER_BYTES.forEach(bite=>{
      const readByte = buffer[pos++];
      if (bite !== readByte) {
        const errorMsg = "This does not appear to be a .dphy file.";
        alert(errorMsg);
        throw new Error(errorMsg);
      }
    });
    const saveFormatVersion = read32();
    if (saveFormatVersion > SAVE_FORMAT_VERSION) {
      const errorMsg = `We cannot load unrecognized version ${saveFormatVersion} files`;
      alert(errorMsg);
      throw new Error(errorMsg);
    }

    if (saveFormatVersion >= CORE_VERSIONING_SAVE_VERSION) {
      const coreVersionSize = read32(),
        version = readString(coreVersionSize),
        build = read32(),
        coreCommitSize = read32(),
        commit = readString(coreCommitSize),
        saveString = `${version} build ${build} (commit ${commit})`,
        currentString = `${this.coreVersion.version} build ${this.coreVersion.build} (commit ${this.coreVersion.commit})`;
      this.saveVersion = {version, build, commit};
      if (saveString !== currentString) {
        console.warn(`Loading save file from different version of Delphy core: Current version is ${currentString}, .dphy file was saved with ${saveString}`)
      }
    } else {
      console.warn(`Loading save file from unknown early version of Delphy core, save file version ${saveFormatVersion}`);
    }

    const knee = read32(),
      stepsPerSample = read32(),
      siteRateHeterogeneityEnabled = read32() === 1;
    read32(); // placeholder for future config option
    const isMuMoveEnabled = read32() === 1,
      mutationRate = read32f(),
      treeInfoSize = read32(),
      treeBuffers = [],
      paramBuffers = [];
    const treeInfo = readBuffer(treeInfoSize);

    let treeSize = read32();
    while (treeSize !== NO_MORE_TREES) {
      const paramSize = read32();
      console.debug(`loading tree buffer ${treeBuffers.length} ${treeSize} ${paramSize}`);
      const treeBuff = readBuffer(treeSize),
        paramsBuff = readBuffer(paramSize);
      treeSize = read32();
      treeBuffers.push(treeBuff);
      paramBuffers.push(paramsBuff);
    }
    const treeCount = treeBuffers.length;
    const metadataSize = read32();
    const metadataEnd = pos + metadataSize;
    const metadataString = new TextDecoder().decode(buffer.slice(pos, metadataEnd));
    pos = metadataEnd;
    const treeEndLocation = read64();
    console.debug(`using save format version ${saveFormatVersion}, read ${pos} of ${actualSize} bytes. Trees end at position ${treeEndLocation}`);

    // "firstTree" object gets taken over by this.run
    const firstTree = this.delphy.createPhyloTreeFromFlatbuffers(treeBuffers[0], treeInfo);
    this.sourceTree = firstTree;
    const count = firstTree.getSize();
    let t = firstTree.getTimeOf(0);
    for (let i = 0; i < count; i++) {
      if (isTip(firstTree,i)) {
        t = Math.max(t, firstTree.getTimeOf(i));
      }
    }
    this.maxDate = t;
    this.run = this.delphy.createRun(firstTree);
    console.log(`Setting parallelism to ${navigator.hardwareConcurrency}`);
    this.run.setNumParts(navigator.hardwareConcurrency);

    for (let i = 0; i < treeCount; i++) {
      console.debug(`loading tree ${i} @ ${Date.now() - startTime}ms`);
      const tree = this.delphy.createPhyloTreeFromFlatbuffers(treeBuffers[i], treeInfo);
      this.run.getTree().copyFrom(tree);
      tree.delete();
      try {
        this.run.setParamsFromFlatbuffer(paramBuffers[i]);
      } catch (err) {
        console.warn(`error reading parameters for tree ${i}:`, err);
      }

      this.sampleCurrentTree();
    }
    this.run.setAlphaMoveEnabled(siteRateHeterogeneityEnabled);
    this.run.setMuMoveEnabled(isMuMoveEnabled);
    if (!isMuMoveEnabled) {
      this.run.setMu(mutationRate);
    }

    this.kneeIndex = knee;
    this.stepsPerSample = stepsPerSample;
    console.log(`${treeCount} trees loaded, knee at ${knee}, elapsed time: ${Date.now() - startTime}ms`);
    this.delphy.deriveMccTreeAsync(this.treeHist.slice(this.kneeIndex))
      .then((mccTree:MccTree) => {
        this.updateMcc(mccTree);
        console.log(`mcc updated, total elapsed time: ${Date.now() - startTime}ms`);
        this.runReadyCallback();
      })
      .catch(err=>{console.debug(err)});

    let config = {};
    try {
      config = JSON.parse(metadataString) as ConfigExport;
    } catch (err) {
      console.warn(`could not parse config export: `, config);
    }
    return config;
  };


  // BEASTY OUTPUT
  getBeastOutputs(): {log: ArrayBuffer, trees: ArrayBuffer} {
    const treeCount = this.paramsHist.length;
    const run = this.delphy.createRun(this.treeHist[0].copy());
    const bout = run.createBeastyOutput();
    for (let i = 0; i < treeCount; ++i) {
      run.getTree().copyFrom(this.treeHist[i]);
      run.setParamsFromFlatbuffer(this.paramsHist[i]);
      bout.snapshot();
    }
    bout.finalize();

    const result = {
      log: bout.extractLog(),    // Copy
      trees: bout.extractTrees() // Copy
    };

    bout.delete();
    run.delete();

    return result;
  }

  // BEAST INPUT
  exportBeastInput(): ArrayBuffer {
    if (this.run) {
      return this.run.exportBeastInput();
    } else {
      return new Uint8Array(0);
    }
  }
}




let globalDelphy: Delphy | null;
let readyCallback: (_:Pythia)=>void; // eslint-disable-line no-unused-vars


export function setReadyCallback(fnc:(_:Pythia)=>void):void { // eslint-disable-line no-unused-vars
  readyCallback = fnc;
  if (globalDelphy) {
    readyCallback(new Pythia());
  }
}


// const reparr = (arr:number[])=> arr.map(n=>`${n}`).join(',');




Delphy.waitForInit()
  .then(() => {
    globalDelphy = new Delphy();
    console.log(`Delphy core loaded (version ${globalDelphy.getVersionString()}, ` +
                `build ${globalDelphy.getBuildNumber()}, commit ${globalDelphy.getCommitString()})`);
    if (readyCallback) {
      readyCallback(new Pythia());
    }
  });


