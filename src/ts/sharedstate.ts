import { Pythia } from './pythia/pythia';
import { MccConfig, ConfigExport } from './ui/mccconfig';
import { Mutation } from './pythia/delphy_api';
import { NavigateFunctionType } from './ui/common';
import { RecordQuality } from './recordquality';




export class SharedState {
  pythia: Pythia;
  mccConfig: MccConfig;
  nodeList: number[];
  mutationList: Mutation[];
  hideBurnIn: boolean;
  goTo: NavigateFunctionType;
  private tipIds: string[];
  mutationsNeedReloading: boolean;
  kneeIsCurated: boolean;
  qc: RecordQuality;
  descriptor: string | null;

  constructor(pythia: Pythia, goTo: NavigateFunctionType) {
    this.pythia = pythia;
    this.mccConfig = new MccConfig(goTo);
    this.nodeList = [];
    this.mutationList = [];
    this.hideBurnIn = false;
    this.kneeIsCurated = false;
    this.goTo = goTo;
    this.tipIds = [];
    this.mutationsNeedReloading = false;
    this.qc = new RecordQuality();
    this.descriptor = null;
  }


  setTipIds() : void {

    this.tipIds = this.pythia.getTipIds();
  }

  setNodeSelection(nodes: number[]) : void {
    this.nodeList = nodes.slice(0);
  }

  setMutationSelection(mutations: Mutation[]): void {
    this.mutationList = mutations.slice(0);
  }

  addMutation(mutation: Mutation): void {
    this.mutationList.push(mutation);
  }

  exportConfig() : ConfigExport {
    const exp = this.mccConfig.exportConfig();
    exp.burnin = this.hideBurnIn ? 1 : 0;
    return exp;
  }

  importConfig(config: ConfigExport, descriptor: string) : void {
    this.hideBurnIn = config.burnin === 1;
    this.mccConfig.importConfig(config);
    this.descriptor = descriptor;
    console.log(`
      
      descriptor: ${ descriptor }
      
      `)
  }

  getTipIndexFromId(id: string): number {
    return this.tipIds.indexOf(id);
  }

  getTipIds(): string[] {
    return this.tipIds.slice();
  }

  resetSelections() : void {
    this.nodeList.length = 0;
    this.mutationsNeedReloading = this.mutationList.length > 0;
  }

  markMutationsUpdated() : void {
    this.mutationsNeedReloading = false;
  }

}