import { BaseTreeSeriesType, CoreVersionInfo, MutationDistInfo, NodeDistributionType } from "../constants.js";
import { ConfigExport } from "../ui/mccconfig.js";
import { MccTree, Mutation, PhyloTree, PopModel, SequenceWarningCode, SummaryTree } from "./delphy_api.js";
import { MutationDistribution } from "./mutationdistribution.js";
import { Omphalos, returnless, RunParamConfig, setPythiaReadyCallback } from "./omphalos.js";


export type TreeExport = {
  log: ArrayBuffer,
  trees: ArrayBuffer
};

export class Pythia {

  pythia: Omphalos;

  constructor(pythia: Omphalos) {
    this.pythia = pythia;
  }


  exportBeastInput(version:string): Promise<ArrayBuffer> {
    return new Promise((resolve)=>{
      const buffer = this.pythia.exportBeastInput(version);
      resolve(buffer);
    })
  }

  getBaseTreeCount() : Promise<number> {
    return new Promise((resolve)=>{
      const count = this.pythia.getBaseTreeCount();
      resolve(count);
    });
  }

  getBaseTreeMinDate() : Promise<number> {
    return new Promise(resolve=>{
      const md = this.pythia.getBaseTreeMinDate();
      resolve(md);
    });
  }

  getBeastOutputs(version:string) : Promise<TreeExport> {
    return new Promise((resolve)=>{
      const treeExp = this.pythia.getBeastOutputs(version);
      resolve(treeExp);
    });
  }

  getMcc() {
    return this.pythia.getMcc();
  }

  getMccIndex() : Promise<number> {
    return new Promise(resolve=>{
      const index = this.pythia.getMccIndex();
      resolve(index);
    });
  }

  getMccMutationsBetween(upstreamMccNodeIndex: number,
    downstreamMccNodeIndex: number, tree: SummaryTree): MutationDistribution[] {
    return this.pythia.getMccMutationsBetween(upstreamMccNodeIndex, downstreamMccNodeIndex, tree);
  }

  getMccNodeTipCount(nodeIndex: number) : number {
    return this.pythia.getMccNodeTipCount(nodeIndex);
  }

  getMccNodeTips(nodeIndex: number) : number[] {
    return this.pythia.getMccNodeTips(nodeIndex);
  }

  getMutationDistributionInfo(mutation: Mutation, summaryTree: SummaryTree): MutationDistInfo {
    return this.pythia.getMutationDistributionInfo(mutation, summaryTree);
  }

  getMutationsOfInterest() {
    return this.pythia.getMutationsOfInterest();
  }

  getPopulationAlleleDistribution(site:number, minDate: number, maxDate: number, summaryTree: SummaryTree): BaseTreeSeriesType {
    return this.pythia.getPopulationAlleleDistribution(site, minDate, maxDate,  summaryTree);
  }

  getPopulationNodeDistribution(nodeIndices: number[], minDate: number, maxDate: number,
    summaryTree: SummaryTree): Promise<NodeDistributionType> {
    return new Promise(resolve=>{
      const dist = this.pythia.getPopulationNodeDistribution(nodeIndices, minDate, maxDate, summaryTree);
      resolve(dist);
    });
  }

  getSaveBuffer(config: ConfigExport) : Promise<Uint8Array> {
    return new Promise(resolve=>{
      const buf = this.pythia.getSaveBuffer(config)
      resolve(buf);
    });
  }

  initRunFromMaple(mapleBytesJs:ArrayBuffer,
    runReadyCallback:()=>void,
    errCallback:(msg:string)=>void,
    stageCallback:(stage:number)=>void,
    parseProgressCallback:(numSeqsSoFar: number, bytesSoFar: number, totalBytes: number)=>void,
    initTreeProgressCallback:(tipsSoFar:number, totalTips:number)=>void,
    warningCallback:(seqId:string, warningCode: SequenceWarningCode, detail:any)=>void, // eslint-disable-line @typescript-eslint/no-explicit-any
    config: RunParamConfig | null
  ): Promise<void> {
    return this.pythia.initRunFromMaple(
      mapleBytesJs, runReadyCallback, errCallback, stageCallback, parseProgressCallback,
      initTreeProgressCallback, warningCallback,
      config
    );
  }

  initRunFromFasta(fastaBytesJs:ArrayBuffer,
    runReadyCallback:()=>void,
    errCallback:(msg:string)=>void,
    stageCallback:(stage:number)=>void,
    parseProgressCallback:(numSeqsSoFar: number, bytesSoFar: number, totalBytes: number)=>void,
    analysisProgressCallback:(numSeqsSoFar: number, totalSeqs: number)=>void,
    initTreeProgressCallback:(tipsSoFar:number, totalTips:number)=>void,
    warningCallback:(seqId:string, warningCode: SequenceWarningCode, detail:any)=>void, // eslint-disable-line @typescript-eslint/no-explicit-any
    config: RunParamConfig | null
  ):Promise<void> {
    return this.pythia.initRunFromFasta(fastaBytesJs, runReadyCallback, errCallback,
      stageCallback, parseProgressCallback, analysisProgressCallback,
      initTreeProgressCallback, warningCallback, config);
  }

  initRunFromSaveFile(raw: ArrayBuffer, runReadyCallback:()=>void, progressCallback:(progress:number, total:number)=>void): Promise<ConfigExport> {
    return this.pythia.initRunFromSaveFile(raw, runReadyCallback, progressCallback);
  }

  getKneeIndex() : number {
    return this.pythia.kneeIndex;
  }

  getMaxDate() : number {
    return this.pythia.maxDate;
  }

  pauseRun() : Promise<void>{
    return new Promise(resolve=>{
      this.pythia.pauseRun();
      resolve();
    });
  }

  recalcMccTree() : Promise<MccTree> {
    return this.pythia.recalcMccTree();
  }

  reset(newRunParams: RunParamConfig): Promise<void> {
    return this.pythia.reset(newRunParams);
  }

  getRunParams() : RunParamConfig | null {
    return this.pythia.runParams;
  }

  setKneeIndexByPct(percent:number):void {
    this.pythia.setKneeIndexByPct(percent);
  }

  setKneeIndex(index: number) : void {
    this.pythia.setKneeIndex(index);
  }

  startRun(callback:(null|returnless)):void {
    return this.pythia.startRun(callback);
  }

  getStepsHist() : number[] {
    return this.pythia.stepsHist;
  }

  getTreeHist() : PhyloTree[] {
    return this.pythia.treeHist;
  }

  getTipIds() : string[] {
    return this.pythia.getTipIds();
  }

  getApobecEnabled() : boolean {
    return this.pythia.runParams?.apobecEnabled || false;
  }

  getCoreVersion() : CoreVersionInfo {
    return this.pythia.coreVersion;
  }

  getSaveVersion() : CoreVersionInfo | null {
    return this.pythia.saveVersion;
  }

  getNodeTimeDistribution(nodeIndex: number, summaryTree: SummaryTree) : number []{
    return this.pythia.getNodeTimeDistribution(nodeIndex, summaryTree);
  }

  getMuHist() : number[] {
    return this.pythia.muHist;
  }

  getLogPosteriorHist() : number[] {
    return this.pythia.logPosteriorHist;
  }

  getNumMutationsHist() : number[] {
    return this.pythia.numMutationsHist;
  }

  getPopModelHist() : PopModel[] {
    return this.pythia.popModelHist;
  }

  getTotalBranchLengthHist() : number[] {
    return this.pythia.totalBranchLengthHist;
  }



}

export type readyCallbackType = (_:Pythia)=>void;



let readyCallback: readyCallbackType | null;
let localPythia: Omphalos | null = null;
export function setReadyCallback(fnc: readyCallbackType):void { // eslint-disable-line no-unused-vars
  readyCallback = fnc;
  if (localPythia) {
    fnc(new Pythia(localPythia));
  }
}

/* hook into pythia's readycallback */
function onPythiaReady(pythia:Omphalos) : void {
  localPythia = pythia;
  if (readyCallback) {
    readyCallback(new Pythia(pythia));
  }
}

setPythiaReadyCallback(onPythiaReady);
