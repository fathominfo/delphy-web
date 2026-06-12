import { initRefDiv, setRefDivStatus } from '../pythia/genome';
import {Pythia} from '../pythia/pythia';
import {SharedState} from '../sharedstate';
import { getPercentLabel } from './common';

export class UIScreen {
  div: HTMLDivElement;
  pythia: Pythia | null;
  sharedState: SharedState;
  resizeHandler: ()=>void;
  isApobecEnabled: boolean;
  isActive = false;
  refSeqDiv: HTMLDivElement | null = null;



  constructor(sharedState: SharedState, selector: string) {
    const maybeDiv = document.querySelector(selector) as HTMLDivElement;
    if (!maybeDiv) {
      throw new Error(`could not create UIScreen for "${selector}"`);
    }
    this.div = maybeDiv;
    this.sharedState = sharedState;
    this.resizeHandler = ()=>this.resize();
    this.pythia = null;
    this.isApobecEnabled = false;
    this.refSeqDiv = this.div.querySelector(".reference-sequence") as HTMLDivElement;
    if (this.refSeqDiv) {
      initRefDiv(this.refSeqDiv, this.sharedState);
    }
  }

  resize() {} // eslint-disable-line @typescript-eslint/no-empty-function

  activate() {
    this.isActive = true;
    this.pythia = this.sharedState.pythia;
    this.isApobecEnabled = this.pythia.runParams?.apobecEnabled || false;
    // this.worker.onmessage = (message:any)=>this.handleMessage(message.data);
    window.addEventListener('resize', this.resizeHandler);
    setTimeout(()=>requestAnimationFrame(()=>this.resize()), 10);
    this.div.querySelectorAll(".cred-threshold").forEach(ele=>{
      (ele as HTMLSpanElement).innerText = `${getPercentLabel(this.sharedState.mccConfig.confidenceThreshold)}%`;
    });
    if (this.refSeqDiv) {
      setRefDivStatus(this.refSeqDiv, this.sharedState);
    }
  }

  deactivate() {
    if (this.isActive) {
      this.isActive = false;
      this.pythia = null;
      window.removeEventListener('resize', this.resizeHandler);
      this.sharedState.mccConfig.unbind();
    }
  }

}
