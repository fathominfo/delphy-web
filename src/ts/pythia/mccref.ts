import {MccTree} from './delphy_api';


let mrm = 0;



export interface MccRef {
  getMcc():MccTree;
  getNodeConfidence():number[];
  getManager(): MccRefManager;
  release(): void;
  isReleased(): boolean;
}


class MccRefImpl {

  manager: MccRefManager;
  released: boolean;

  constructor(manager: MccRefManager) {
    this.manager = manager;
    this.released = false;
  }

  getMcc():MccTree {
    return this.manager.mcc;
  }

  getNodeConfidence():number[] {
    return this.manager.mccNodeConfidence;
  }

  release(): void {
    if (!this.released) {
      this.released = true;
      this.manager.release();
    }
  }

  isReleased(): boolean {
    return this.released;
  }

  getManager(): MccRefManager {
    return this.manager;
  }

}


export class MccRefManager {

  mcc: MccTree;
  mccNodeConfidence: number[];
  locks: number;
  id: number;
  mccIndex: number;

  constructor(mcc: MccTree) {
    this.mcc = mcc;
    this.locks = 0;
    this.id = mrm++;
    this.mccIndex = mcc.getMasterBaseTreeIndex();
    const nodeCount = mcc.getSize(),
      treeCount = mcc.getNumBaseTrees(),
      mccNodeConfidence = new Array(nodeCount);
    if (treeCount === 0) {
      mccNodeConfidence.fill(0);
    } else {
      for (let mccNodeIndex = 0; mccNodeIndex < nodeCount; mccNodeIndex++) {
        let monophyleticCount = 0;
        for (let t = 0; t < treeCount; t++) {
          if (mcc.isExactMatchInBaseTree(mccNodeIndex, t)) {
            monophyleticCount++;
          }
        }
        mccNodeConfidence[mccNodeIndex] = monophyleticCount / treeCount;
      }
    }
    this.mccNodeConfidence = mccNodeConfidence;
  }

  getRef():MccRef {
    const ref = new MccRefImpl(this);
    this.locks++;
    // console.debug(`  .   get ref for ${this.id} ${ref.getRefNo()}`)
    return ref;
  }

  release():void {
    this.locks--;
    if (this.locks === 0) {
      // console.debug(` -   delete     ${this.id}   ref# ${refNo}    ${this.locks.length} refs`);
      this.mcc.delete();
      this.mccNodeConfidence.length = 0;
    } else {
      // console.debug(`      keeping    ${this.id}   ref# ${refNo}    ${this.locks.map((l,index)=>[l,index]).filter((arr)=>arr[0]).map((arr)=>arr[1]).join(',')}`);
    }


  }

}