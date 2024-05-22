// import {Pythia} from '../pythia/pythia';
import {UIScreen} from "./uiscreen";


const maybeContainer = document.querySelector("#nav--views");
if (!maybeContainer) {
  throw new Error('could not find "#nav--views"');
}
const navContainer = maybeContainer as HTMLDivElement;

const maybeButton = navContainer.querySelector('button');
if (!maybeButton) {
  throw new Error('could not find "#nav--views .button"');
}
const buttonTemplate = maybeButton as HTMLButtonElement;
buttonTemplate.remove();


class NavLabel {
  label: string;
  view: UIScreen;
  div: HTMLDivElement;
  button: HTMLButtonElement | null;

  constructor(label: string, view: UIScreen, selector: string) {
    this.label = label;
    this.view = view;
    const maybeDiv = document.querySelector(selector);
    if (!maybeDiv) {
      throw new Error(`No div found with selector '${selector}'`)
    }
    this.div = maybeDiv as HTMLDivElement;
    this.button = null;
  }

  setButton(b:HTMLButtonElement) {
    this.button = b;
    b.innerText = this.label;
  }
}



let navLabels:NavLabel[];

function activateView(selectedView:UIScreen):void {
  let current: UIScreen | null = null;
  /*
  per https://github.com/microsoft/TypeScript/issues/16928, the typescript
  compiler seems to think that setting `current` in a callback will
  `never` happen, as it doesn't detect that the callback is invoked immediately
  as opposed to later via setTimeout, etc.
  So let's use old-style loops here.
  */
  for (let i = 0; i < navLabels.length; i++) {
    const nl:NavLabel = navLabels[i],
      active = selectedView === nl.view;
    nl.div.classList.toggle('active', active);
    if (nl.button) {
      nl.button.classList.toggle('active', active);
    }
    if (active) {
      current = nl.view;
    } else {
      nl.view.deactivate();
    }
  }
  if (current) {
    current.activate();
  }
}



function bindNav(labels:NavLabel[]):void {
  navLabels = labels;
  labels.forEach((nl:NavLabel)=>{
    const b = buttonTemplate.cloneNode(true) as HTMLButtonElement;
    b.id = `nav--${nl.label.toLowerCase()}`
    nl.setButton(b);
    b.addEventListener('click', ()=>{
      activateView(nl.view);
    });
    navContainer.appendChild(b);
  });
}


export { NavLabel, bindNav, activateView };