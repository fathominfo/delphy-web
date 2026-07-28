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
  mutFormatToggleForm: HTMLFormElement | null = null;



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
    this.mutFormatToggleForm = this.div.querySelector(".mut-format") as HTMLFormElement;
    if (this.mutFormatToggleForm) {
      this.mutFormatToggleForm.addEventListener("change", ()=>{
        const form = this.mutFormatToggleForm as HTMLFormElement;
        const value = form["mutation-name-format"].value;
        this.sharedState.showAAMutations = value === "aa";
        this.handleAAFormatChange();
      });
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
    // if (this.refSeqDiv) {
    //   setRefDivStatus(this.refSeqDiv, this.sharedState);
    // }
    if (this.mutFormatToggleForm) {
      if (this.sharedState.genome) {
        this.mutFormatToggleForm.classList.remove("hidden");
        if (this.sharedState.showAAMutations) {
          this.mutFormatToggleForm["mutation-name-format"].value = "aa";
        } else {
          this.mutFormatToggleForm["mutation-name-format"].value = "nucleotide";
        }
      } else {
        this.mutFormatToggleForm.classList.add("hidden");
      }
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

  handleAAFormatChange() { /* noop by default */ }

}
