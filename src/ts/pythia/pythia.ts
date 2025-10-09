import {Delphy, Run, Tree, PhyloTree, MccTree, SummaryTree, Mutation,
  RealSeqLetter_A, RealSeqLetter_C, RealSeqLetter_G, RealSeqLetter_T,
  SequenceWarningCode, PopModel, ExpPopModel, SkygridPopModel,
  SkygridPopModelType} from './delphy_api';
import {MccRef, MccRefManager} from './mccref';
import {MutationDistribution} from './mutationdistribution';
import {getMutationName, TipsByNodeIndex, MutationDistInfo, BaseTreeSeriesType, mutationEquals, NodeDistributionType, OverlapTally, CoreVersionInfo, copyDict} from '../constants';
import {getMccMutationsOfInterest, MutationOfInterestSet} from './mutationsofinterest';
import {MostCommonSplitTree} from './mostcommonsplittree';
import {BackLink, MccNodeBackLinks} from './pythiacommon';
import {MccUmbrella} from './mccumbrella';
import { isTip } from '../util/treeutils';
import { ConfigExport } from '../ui/mccconfig';
import { UNSET } from '../ui/common';
import { randomGaussian } from '../util/randomsamplers';

type returnless = ()=>void;

type emptyResolveType = (m:undefined)=>void;
type configResolveType = (conf:ConfigExport)=>void;

const SAVE_FORMAT_VERSION = 3;

const CORE_VERSIONING_SAVE_VERSION = 3;

const NO_MORE_TREES = 0;
const BIGINT_SIZE = 2;

const TARGET = 200;
const TOO_MANY = TARGET * 2;

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

enum sequenceFileFormat {
  UNSUPPORTED,
  FASTA,
  MAPLE
}

// FIXME: Rename things like `mutationRate` to emphasize these are the *initial* values
export type RunParamConfig = {
  stepsPerSample: number,
  mutationRate: number,
  apobecEnabled: boolean,
  siteRateHeterogeneityEnabled: boolean,
  mutationRateIsFixed: boolean,
  popModelIsSkygrid: boolean,
  // exponential population model params
  finalPopSizeIsFixed: boolean,
  finalPopSize: number,
  popGrowthRateIsFixed: boolean,
  popGrowthRate: number,
  // skygrid population model params
  skygridStartDate: number,
  skygridNumIntervals: number,
  skygridGamma: number,
  skygridIsLogLinear: boolean,
};

function calcMaxDateOfTree(tree: PhyloTree): number {
  let maxDate = -Number.MAX_VALUE;
  const count = tree.getSize();
  for (let i = 0; i < count; i++) {
    if (isTip(tree, i)) {
      maxDate = Math.max(maxDate, tree.getMaxTimeOf(i));
    }
  }
  return maxDate;
}

function makeDefaultRunParamConfig(tree: PhyloTree): RunParamConfig {
  const count = tree.getSize(),
    tipCount = (count + 1) / 2,
    targetStepSize = Math.pow(10, Math.ceil(Math.log(tipCount * 1000)/ Math.log(10))),
    rootDate = tree.getTimeOf(tree.getRootIndex()) || 0,
    maxDate = calcMaxDateOfTree(tree),
    dateRange = maxDate - rootDate;

  return {
    stepsPerSample: targetStepSize,
    mutationRate: 1e-3 / 365.0,  // 1e-3 mutations / site / year
    apobecEnabled: false,
    siteRateHeterogeneityEnabled: false,
    mutationRateIsFixed: false,

    popModelIsSkygrid: false,

    // Defaults for exponential pop model
    finalPopSizeIsFixed: false,
    finalPopSize: 1000.0, // days
    popGrowthRateIsFixed: false,
    popGrowthRate: 0.0,  // e-foldings / year

    // Defaults for Skygrid pop model
    skygridStartDate: maxDate - 2 * dateRange,
    skygridNumIntervals: Math.round(tipCount / 15),
    skygridGamma: Math.log(1000),
    skygridIsLogLinear: true
  };
}

export class Pythia {

  private mccRefManager: MccRefManager | null;
  private currentMccRef: MccRef | null;
  private delphy: Delphy;
  private run: Run | null;
  private mcs: MostCommonSplitTree | null;

  initialTree: PhyloTree | null;    // Immutable snapshot of initial tree
  runParams: RunParamConfig | null; // Immutable once run has been initialized

  isRunning: boolean;

  muHist : number[] = [];
  muStarHist: number[] = [];
  totalBranchLengthHist : number[] = [];
  logPosteriorHist : number[] = [];
  logGHist : number[] = [];
  numMutationsHist : number[] = [];
  popModelHist: PopModel[] = [];
  stepsHist : number[] = [];
  minDateHist: number[] = [];
  paramsHist: ArrayBuffer[] = [];
  treeHist: PhyloTree[] = [];
  kneeIndex = 0;

  runReadyCallback: ()=>void;
  fileFormat: sequenceFileFormat;
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
    this.initialTree = null;
    this.runParams = null;
    this.isRunning = false;
    this.resetHist();
    this.mccRefManager = null;
    this.currentMccRef = null;
    this.fileFormat = sequenceFileFormat.UNSUPPORTED;
    /* dates are measured as # of days from 2020-01-01 */
    this.maxDate = UNSET;
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

  initRunFromFasta(fastaBytesJs:ArrayBuffer,
    runReadyCallback:()=>void,
    errCallback:(msg:string)=>void,
    stageCallback:(stage:number)=>void,
    parseProgressCallback:(numSeqsSoFar: number, bytesSoFar: number, totalBytes: number)=>void,
    analysisProgressCallback:(numSeqsSoFar: number, totalSeqs: number)=>void,
    initTreeProgressCallback:(tipsSoFar:number, totalTips:number)=>void,
    warningCallback:(seqId:string, warningCode: SequenceWarningCode, detail:any)=>void):void { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log("Loading FASTA file...");
    this.fileFormat = sequenceFileFormat.FASTA;
    const treePromise = this.delphy.parseFastaIntoInitialTreeAsync(
      fastaBytesJs,
      stageCallback,
      parseProgressCallback,
      analysisProgressCallback,
      initTreeProgressCallback,
      warningCallback
    );
    this.initRunFromTreePromise(treePromise, runReadyCallback, errCallback);
  }

  initRunFromMaple(mapleBytesJs:ArrayBuffer,
    runReadyCallback:()=>void,
    errCallback:(msg:string)=>void,
    stageCallback:(stage:number)=>void,
    parseProgressCallback:(numSeqsSoFar: number, bytesSoFar: number, totalBytes: number)=>void,
    initTreeProgressCallback:(tipsSoFar:number, totalTips:number)=>void,
    warningCallback:(seqId:string, warningCode: SequenceWarningCode, detail:any)=>void):void { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log("Loading Maple file...");
    this.fileFormat = sequenceFileFormat.MAPLE;
    const treePromise = this.delphy.parseMapleIntoInitialTreeAsync(
      mapleBytesJs,
      stageCallback,
      parseProgressCallback,
      initTreeProgressCallback,
      warningCallback
    );
    this.initRunFromTreePromise(treePromise, runReadyCallback, errCallback);
  }

  initRunFromTreePromise(futureTree:Promise<PhyloTree>, runReadyCallback:()=>void, errCallback:(msg:string)=>void):void {
    const startTime = Date.now();
    this.runReadyCallback = runReadyCallback;
    futureTree
      .then(phyloTree => {
        console.log("Creating run", phyloTree);
        console.log(`file parsed and initial tree generated in ${Date.now() - startTime}ms`);
        return this.instantiateRun(phyloTree, makeDefaultRunParamConfig(phyloTree));
      })
      .then(() => {
        this.runReadyCallback();
      })
      .catch(err => {
        console.error(err);
        errCallback(`Error loading the file: "${err}". Please check that it is formatted correctly. If you continue to have trouble, please contact us at delphy@fathom.info.`);
      });
  }

  async instantiateRun(initialTree: PhyloTree, runParams: RunParamConfig) : Promise<Run>{
    const prom = new Promise((resolve: (run: Run) => void, reject: emptyResolveType)=>{
      const startTime = Date.now();

      this.initialTree = initialTree;  // We take over this tree, and never mutate it

      /*
        Assuming the max date will always be on a tip,
        and the times of the tips don't change,
        we can get the max date now.
      */
      this.maxDate = calcMaxDateOfTree(this.initialTree);

      // Set up new run
      if (this.run) {
        this.run.delete();
        this.run = null;
      }
      const runTree = this.initialTree.copy();
      const run = this.run = this.delphy.createRun(runTree);  // Core takes possession of runTree's contents, leaving it a husk
      runTree.delete();

      this.resetHist();
      this.setParams(runParams);
      this.sampleCurrentTree();

      console.log(`Setting parallelism to ${navigator.hardwareConcurrency}`);
      this.run.setNumParts(navigator.hardwareConcurrency);

      this.delphy.deriveMccTreeAsync(this.treeHist.slice(this.kneeIndex))
        .then((mccTree:MccTree) => {
          this.updateMcc(mccTree);
          console.debug(`run instantiated and mcc updated in ${Date.now() - startTime}ms`);
          resolve(run);
        })
        .catch(err=>{
          console.debug(err);
          reject(undefined);
        });
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







  runSteps(callBack:()=>void):void {
    if (this.run && this.runParams){
      this.run.runStepsAsync(this.runParams.stepsPerSample)
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


  resetHist(): void {
    this.muHist = [];
    this.muStarHist = [];
    this.totalBranchLengthHist = [];
    this.logPosteriorHist = [];
    this.logGHist = [];
    this.numMutationsHist = [];
    this.popModelHist = [];
    this.stepsHist = [];
    this.minDateHist = [];
    this.paramsHist = [];
    if (this.treeHist) {
      this.treeHist.forEach((tree:PhyloTree)=>tree.delete());
    }
    this.treeHist = [];
    this.kneeIndex = 0;
  }

  sampleCurrentTree():void {
    if (this.run) {
      if (this.run.isMpoxHackEnabled()) {
        this.muHist.push(this.run.getMpoxMu());
        this.muStarHist.push(this.run.getMpoxMuStar());
      } else {
        this.muHist.push(this.run.getMu());
      }
      this.totalBranchLengthHist.push(this.run.getTotalBranchLength());
      this.logPosteriorHist.push(this.run.getLogPosterior());
      this.logGHist.push(this.run.getLogG());
      this.numMutationsHist.push(this.run.getNumMutations());
      this.popModelHist.push(this.run.getPopModel());
      this.stepsHist.push(this.run.getStep())
      this.paramsHist.push(this.run.getParamsToFlatbuffer());
      this.trackTree(this.run);
    }
  }

  trackTree(run: Run) {
    // copy() is crucial: the underlying tree keeps changing!
    const tree = run.getTree().copy();
    this.treeHist.push(tree);
    let minDate = this.maxDate;
    const count = tree.getSize();
    for (let i = 0; i < count; i++) {
      minDate = Math.min(minDate, tree.getTimeOf(i));
    }
    this.minDateHist.push(minDate);
  }


  pauseRun():void {
    this.isRunning = false;
  }


  async reset(newRunParams: RunParamConfig): Promise<void> {
    const prom = new Promise((resolve: emptyResolveType, reject: emptyResolveType)=>{
      if (!this.initialTree) {
        reject(undefined);
        return;
      }
      this.instantiateRun(this.initialTree, newRunParams).then(() => {
        this.runReadyCallback();
        resolve(undefined);
      });
    });
    return prom;
  }

  setParams(runParams: RunParamConfig) : void {
    const run = this.run;
    if (!run) {
      throw new Error('failed to create new run after reset');
    }

    if (this.stepsHist.length > 0) {
      throw new Error("can't change parameters of run that has already gathered samples");
    }

    this.runParams = copyDict(runParams) as RunParamConfig;

    // console.debug('setting params', runParams)
    run.setAlphaMoveEnabled(runParams.siteRateHeterogeneityEnabled);
    run.setMpoxHackEnabled(runParams.apobecEnabled);
    run.setMuMoveEnabled(!runParams.mutationRateIsFixed);
    if (runParams.mutationRate > 0) {
      run.setMu(runParams.mutationRate);
    }

    if (runParams.popModelIsSkygrid) {
      // SkygridPopModel
      const dt = (this.maxDate - runParams.skygridStartDate) / runParams.skygridNumIntervals;
      const M = runParams.skygridNumIntervals + 1;
      //const skygridGamma = runParams.skygridGamma;  // TODO: runParams.skygridGamma is redundant, remove from UI and elsewhere
      const skyGridInterpolation = runParams.skygridIsLogLinear ? SkygridPopModelType.LogLinear : SkygridPopModelType.Staircase;

      const x_k: number[] = [];
      for (let k = 0; k <= M; ++k) {
        x_k.push(runParams.skygridStartDate + k * dt);
      }

      let skygrid_tau = 0.0;
      const infer_tau = false;  // TODO: Configure via UI
      if (infer_tau) {
        // Infer a priori smoothness of log-population curve
        const prior_alpha = 0.001;  // TODO: Configure via UI (should be > 0)
        const prior_beta = 0.001;   // TODO: Configure via UI (should be > 0)

        run.setSkygridTauPriorAlpha(prior_alpha);
        run.setSkygridTauPriorBeta(prior_beta);

        skygrid_tau = prior_alpha / prior_beta;

      } else {
        const setSkygridTauDirectly = false; // TODO: Configure via UI
        if (setSkygridTauDirectly) {
          skygrid_tau = 0.001;  // unitless - TODO: Configure via UI (should be > 0)

        } else {
          const double_half_time = 30.0;  // days - TODO: Configure via UI (should be > 0)

          // Setting tau = 1 / (2 D dt), the prior for the log-population curve looks like
          // a 1D random walk with diffusion constant D.  Hence, on average, a starting
          // log-population changes after a time T by a root-mean-square deviation of
          // `sqrt(2 D T)`.  We parametrize D such that after T = double_half_time, the
          // rms deviation is log(2), i.e., population changes by up to a factor of ~2 in
          // the "double-half time" with 68% probability:
          //
          //   sqrt(2 D T) = log(2)  => D = log^2(2) / (2 T).
          //
          const D = Math.pow(Math.log(2.0), 2) / (2 * double_half_time);
          skygrid_tau = 1.0 / (2 * D * dt);
        }
      }

      // At this point, skygrid_tau is set.  Sample a random trajectory with this
      // precision, then reset its mean to "3 years" (the `skygrid_gammas_zero_mode_gibbs_move`
      // Gibbs sample the mean value of gamma, so we don't need to get this right at all here)
      const gamma_k: number[] = [];
      gamma_k.push(0.0);
      for (let k = 1; k <= M; ++k) {
        gamma_k.push(gamma_k[k-1] + randomGaussian(0.0, Math.sqrt(1.0/skygrid_tau)));
      }

      const mean_gamma_k = gamma_k.reduce((a, b) => a + b, 0.0) / gamma_k.length;
      for (let k = 0; k <= M; ++k) {
        gamma_k[k] += (-mean_gamma_k) + Math.log(3.0 * 365.0);
      }

      // Configure run
      run.setPopModel(new SkygridPopModel(skyGridInterpolation, x_k, gamma_k));
      run.setSkygridTau(skygrid_tau);
      run.setSkygridTauMoveEnabled(infer_tau);  // Prior configured above when infer_tau == true

      // Low-pop barrier
      const lowPopBarrierDisabled = false;  // TODO: Configure via UI
      if (lowPopBarrierDisabled) {
        run.setSkygridLowGammaBarrierEnabled(false);
      } else {
        const low_pop_barrier_loc = 1.0;  // days - TODO: Configure via UI (should be > 0)
        const low_gamma_barrier_loc = Math.log(low_pop_barrier_loc);

        const low_pop_barrier_scale = 0.30;  // fraction (0,1) - TODO: Configure via UI
        const low_gamma_barrier_scale = -Math.log(1 - low_pop_barrier_scale);  // Convert to scale in gamma

        run.setSkygridLowGammaBarrierEnabled(true);
        run.setSkygridLowGammaBarrierLoc(low_gamma_barrier_loc);
        run.setSkygridLowGammaBarrierScale(low_gamma_barrier_scale);
      }

    } else {
      // ExpPopModel
      run.setFinalPopSizeMoveEnabled(!runParams.finalPopSizeIsFixed);
      run.setPopGrowthRateMoveEnabled(!runParams.popGrowthRateIsFixed);
      run.setPopModel(
        new ExpPopModel(calcMaxDateOfTree(run.getTree()),
          runParams.finalPopSize,
          runParams.popGrowthRate));
    }
  }

  extractRunParamsFromRun(run: Run): RunParamConfig {
    const result = makeDefaultRunParamConfig(run.getTree());

    result.mutationRate = run.getMu();
    result.apobecEnabled = !!(run.isMpoxHackEnabled());
    result.siteRateHeterogeneityEnabled = !!(run.isAlphaMoveEnabled());
    result.mutationRateIsFixed = !run.isMuMoveEnabled();

    const popModel = run.getPopModel();

    if (popModel instanceof ExpPopModel) {
      result.popModelIsSkygrid = false;
      result.finalPopSizeIsFixed = !run.isFinalPopSizeMoveEnabled();
      result.finalPopSize = popModel.n0;
      result.popGrowthRateIsFixed = !run.isPopGrowthRateMoveEnabled();
      result.popGrowthRate = popModel.g;

    } else if (popModel instanceof SkygridPopModel) {
      result.popModelIsSkygrid = true;
      result.skygridStartDate = popModel.x[0];
      result.skygridNumIntervals = popModel.x.length - 1;
      //result.skygridGamma = popModel.gamma[0];  TODO: REMOVE THIS
      result.skygridIsLogLinear = popModel.type === SkygridPopModelType.LogLinear;

      // TODO: Add the below; I'm unsure of whether RunParamConfig should store
      // both skygridTau and skygridDoubleHalfTime, so I've written the relations
      // between both.  We can pick one of these and use it throughout.
      //
      // result.skygridInferTau = run.isSkygridTauMoveEnabled();
      //
      // // Applicable when skygridInferTau == true
      // result.skygridTauPriorAlpha = run.getSkygridTauPriorAlpha();
      // result.skygridTauPriorBeta = run.getSkygridTauPriorBeta();
      //
      // // Applicable when skygridInferTau == false
      // // See setParams for a longer explanation of the below
      // const dt = popModel.x[1] - popModel.x[0];
      // const D = 1.0 / (2 * run.skygridTau() * dt);
      // result.skygridSetTauExplicitly = ???;
      // result.skygridDoubleHalfTime = Math.pow(Math.log(2.0), 2) / (2 * D);
      // const D = Math.pow(Math.log(2.0), 2) / (2 * result.skygridDoubleHalfTime);
      // result.skygridTau = 1.0 / (2 * D * dt);
      //
      // result.skygridLowPopBarrierDisabled = !run.isSkygridLowGammaBarrierEnabled();
      //
      // // Applicable when skygridLowPopBarrierDisabled == false
      // result.skygridLowPopBarrierLoc = Math.exp(run.getSkygridLowGammaBarrierLoc());
      // result.skygridLowPopBarrierScale = 1 - Math.exp(-run.getSkygridLowGammaBarrierScale());

    } else {
      throw new Error("don't know what to do here");
    }

    return result;
  }


  setKneeIndexByPct(percent:number):void {
    this.kneeIndex = Math.round(percent * this.stepsHist.length);
    this.mcs = null;
  }

  getBaseTreeCount() : number {
    return this.treeHist.length;
  }





  // ███    ███  ██████  ██████     ██    ██ ██
  // ████  ████ ██      ██          ██    ██ ██
  // ██ ████ ██ ██      ██          ██    ██ ██
  // ██  ██  ██ ██      ██          ██    ██ ██
  // ██      ██  ██████  ██████      ██████  ██



  getBaseTreeMinDate():number {
    const minDate = Math.min(...this.minDateHist.slice(this.kneeIndex));
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
      let rootSeq: Uint8Array;
      const treeCount = tree.getNumBaseTrees(),
        mutationLookup: { [name: string]: MutationDistribution } = {},
        tallyMutation = (mut:Mutation)=>{
          const name:string = getMutationName(mut);
          if (mutationLookup[name] === undefined) {
            const isApobecCtx = checkApobecCtx(mut, rootSeq);
            mutationLookup[name] = new MutationDistribution(mut, treeCount, isApobecCtx);
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
            rootSeq = baseTree.getRootSequence();
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
    // const startTime = Date.now();
    const baseSeries: BaseTreeSeriesType = [],
      overlap: OverlapTally[] = [],
      nodeDist: NodeDistributionType = {series: baseSeries, overlap: overlap},
      treeCount = summaryTree.getNumBaseTrees(),
      startDate = Math.floor(minDate-1);
    let range = maxDate - startDate + 1;
    if (range >= TOO_MANY) range = TARGET;
    if (treeCount > 0) {
      for (let t = 0; t < treeCount; t++) {
        const tree = summaryTree.getBaseTree(t),
          baseTreeIndex = t + this.kneeIndex,
          popModel = this.popModelHist[baseTreeIndex],
          baseTreeIndices = nodeIndices.map(mccNodeIndex=>summaryTree.getCorrespondingNodeInBaseTree(mccNodeIndex, t)),
          deduped = baseTreeIndices.map((n, i)=>i === baseTreeIndices.lastIndexOf(n) ? n : UNSET),
          treeDist = this.delphy.popModelProbeAncestorsOnTree(
            tree, popModel, deduped, startDate - 1, maxDate, range);
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
    // console.debug(`getPopulationNodeDistribution               ${(Date.now()-startTime)/1000}s`);
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
          popModel = this.popModelHist[baseTreeIndex],
          treeDist = this.delphy.popModelProbeSiteStatesOnTree(
            tree, popModel, site, startDate - 1, maxDate, range);
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
    if (!this.run || !this.runParams) {
      throw new Error(`Saving before a run has been instantiated?`);
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
      apobecEnabled
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
    write32(this.runParams.stepsPerSample);
    write32(this.run && this.run.isAlphaMoveEnabled() ? 1 : 0);
    write32(this.run && this.run.isMpoxHackEnabled() ? 1 : 0);
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





  async initRunFromSaveFile(raw: ArrayBuffer, runReadyCallback:()=>void, progressCallback:(progress:number, total:number)=>void): Promise<ConfigExport> {
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
      readBuffer = (length: number):Uint8Array=>{
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

    const knee = read32();
    const stepsPerSample = read32();
    // The following settings below are stored separately in .dphy files, but now
    // live in the general params buffers later.  Their values at this point in the
    // file are now ignored.
    /*const siteRateHeterogeneityEnabled = */  read32()  /* === 1*/;
    /*const apobecEnabled = */  read32()  /* === 1*/;
    /*const isMuMoveEnabled = */  read32()  /* === 1*/;
    /*const mutationRate = */  read32f();
    const treeInfoSize = read32();
    const treeBuffers:Uint8Array[] = [];
    const paramBuffers:Uint8Array[] = [];
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

    // Create a tiny temporary run so that we can read off the run parameters
    let runParams: RunParamConfig;
    {
      const tmpTree = this.delphy.createPhyloTreeFromFlatbuffers(treeBuffers[0], treeInfo);

      const tmpRun = this.delphy.createRun(tmpTree);
      tmpTree.delete();  // tmpRun takes over tmpTree's contents, leaving only a husk

      tmpRun.setParamsFromFlatbuffer(paramBuffers[0]);

      runParams = this.extractRunParamsFromRun(tmpRun);
      runParams.stepsPerSample = stepsPerSample;

      tmpRun.delete();
    }

    // Now instantiate the real run and record all the associated snapshots
    const firstTree = this.delphy.createPhyloTreeFromFlatbuffers(treeBuffers[0], treeInfo);

    this.run = await this.instantiateRun(firstTree, runParams);

    for (let i = 0; i < treeCount; i++) {
      progressCallback(i, treeCount);

      const tree = this.delphy.createPhyloTreeFromFlatbuffers(treeBuffers[i], treeInfo);
      this.run.getTree().copyFrom(tree);
      tree.delete();

      this.run.setParamsFromFlatbuffer(paramBuffers[i]);

      this.sampleCurrentTree();

      await yieldToMain();
    }
    progressCallback(treeCount, treeCount);

    console.log(`Setting parallelism to ${navigator.hardwareConcurrency}`);
    this.run.setNumParts(navigator.hardwareConcurrency);

    let config = {} as ConfigExport;

    this.kneeIndex = knee;
    console.log(`${treeCount} trees loaded, knee at ${knee}, elapsed time: ${Date.now() - startTime}ms`);
    this.delphy.deriveMccTreeAsync(this.treeHist.slice(this.kneeIndex))
      .then((mccTree:MccTree) => {
        this.updateMcc(mccTree);
        console.log(`mcc updated, total elapsed time: ${Date.now() - startTime}ms`);
        this.runReadyCallback();
      })
      .catch(err=>{console.debug(err)});
    try {
      config = JSON.parse(metadataString) as ConfigExport;
    } catch (err) {
      console.warn(`could not parse config export: `, metadataString);
    }
    const prom = new Promise((resolve: configResolveType)=>resolve(config));
    return prom;
  }


  // BEASTY OUTPUT
  getBeastOutputs(version:string): {log: ArrayBuffer, trees: ArrayBuffer} {
    const treeCount = this.paramsHist.length;
    const run = this.delphy.createRun(this.treeHist[0].copy());
    run.setParamsFromFlatbuffer(this.paramsHist[0]);  // Some options can influence output
    const bout = run.createBeastyOutput(version);
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
  exportBeastInput(version:string): ArrayBuffer {
    if (this.run) {
      return this.run.exportBeastInput(version);
    } else {
      // return new Uint8Array(0);
      return new ArrayBuffer(0);
    }
  }
}



/*
we will designate any mutation like TC -> TT and the complementary GA -> AA
as happening in an APOBEC context
*/

export const checkApobecCtx = (mut: Mutation, rootSeq: Uint8Array)=>{
  if (mut.from === RealSeqLetter_C && mut.to === RealSeqLetter_T && rootSeq[mut.site-1] === RealSeqLetter_T) {
    return true;
  }
  if (mut.from === RealSeqLetter_G && mut.to === RealSeqLetter_A && rootSeq[mut.site+1] === RealSeqLetter_A) {
    return true;
  }
  return false;
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


const yieldToMain = ()=>new Promise((resolve:emptyResolveType)=>{setTimeout(resolve, 0)});
