import {Pythia} from '../pythia/pythia';
import {SharedState} from '../sharedstate';
import { ZoomFnc, getPercentLabel } from './common';

export class UIScreen {
  div: HTMLDivElement;
  pythia: Pythia | null;
  sharedState: SharedState;
  resizeHandler: ()=>void;
  zoomHandler: ZoomFnc;


  constructor(sharedState: SharedState, selector: string) {
    const maybeDiv = document.querySelector(selector) as HTMLDivElement;
    if (!maybeDiv) {
      throw new Error(`could not create UIScreen for "${selector}"`);
    }
    this.div = maybeDiv;
    this.sharedState = sharedState;
    this.resizeHandler = ()=>this.resize();
    this.pythia = null;
    this.zoomHandler = (vZoom:number, vZoomScroll: number, hZoom:number, hZoomScroll: number)=>{
      console.debug(`if we could zoom, we would zoom to ${hZoom * 100}%, ${vZoom * 100}% vertical centered at ${hZoomScroll*100}, ${vZoomScroll*100}`);
    };
  }

  resize() {} // eslint-disable-line @typescript-eslint/no-empty-function

  activate() {
    this.pythia = this.sharedState.pythia;
    // this.worker.onmessage = (message:any)=>this.handleMessage(message.data);
    window.addEventListener('resize', this.resizeHandler);
    this.resize();
    this.sharedState.mccConfig.bind(this.div.querySelector('.mcc-display-options'), this.zoomHandler);
    this.div.querySelectorAll(".cred-threshold").forEach(ele=>{
      (ele as HTMLSpanElement).innerText = `${getPercentLabel(this.sharedState.mccConfig.confidenceThreshold)}%`;
    });

  }

  deactivate() {
    this.pythia = null;
    window.removeEventListener('resize', this.resizeHandler);
    this.sharedState.mccConfig.unbind();
  }

  // handleMessage(){}

}