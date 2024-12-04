import { Pythia, setReadyCallback } from './pythia/pythia';
import { bindUpload, hideUpload, loadNow } from './ui/uploadui';
import { NavLabel, bindNav, activateView } from  "./ui/nav";
import { UIScreen } from './ui/uiscreen';
import { RunUI } from './ui/runner/runui';
import { LineagesUI } from './ui/lineages/lineagesui';
import { MutationsUI } from './ui/mutations/mutationsui';
import { CustomizeUI } from './ui/customize/customizeui';
import { Screens, NavigateFunctionType } from './ui/common';
import { SharedState } from './sharedstate';
import { ConfigExport } from './ui/mccconfig';
import { initErrors, setStage } from './errors';
import { STAGES } from './constants';
import { setQCPanel } from './ui/qcpanel';



function onReady(p:Pythia):void {
  const viewButtons: NavLabel[] = [];
  const goToScreens: UIScreen[] = [];
  const goTo: NavigateFunctionType = (screen: Screens)=>{
    const target: UIScreen = goToScreens[screen] || customizeUI;
    activateView(target);
  };
  const sharedState = new SharedState(p, goTo);
  const runUI = new RunUI(sharedState, "#runner");
  const lineagesUI = new LineagesUI(sharedState, "#lineages");
  const mutationsUI = new MutationsUI(sharedState, "#mutations");
  const customizeUI = new CustomizeUI(sharedState, "#customize");

  goToScreens[Screens.run] = runUI;
  goToScreens[Screens.lineages] = lineagesUI;
  goToScreens[Screens.mutations] = mutationsUI;
  goToScreens[Screens.customize] = customizeUI;

  viewButtons.push(new NavLabel("Trees", runUI, "#runner"));
  viewButtons.push(new NavLabel("Lineages", lineagesUI, "#lineages"));
  viewButtons.push(new NavLabel("Mutations", mutationsUI, "#mutations"));
  viewButtons.push(new NavLabel("Customize", customizeUI, "#customize"));
  bindNav(viewButtons);

  const qc = document.querySelector("#qc") as HTMLElement;
  const toggleQCButton = document.querySelector("#nav--qc") as HTMLButtonElement;
  const closeQCButton = qc.querySelector(".close-button") as HTMLButtonElement;
  toggleQCButton.addEventListener("click", () => {
    qc.classList.toggle("active");
    toggleQCButton.classList.toggle("active");
  });
  closeQCButton.addEventListener("click", () => {
    qc.classList.remove("active");
    toggleQCButton.classList.remove("active");
    toggleQCButton.classList.remove("uninspected");
  });
  const about = document.querySelector("#about") as HTMLElement;
  const toggleAboutButton = document.querySelector("#nav--about") as HTMLButtonElement;
  const closeAboutButton = about.querySelector(".close-button") as HTMLButtonElement;
  toggleAboutButton.addEventListener("click", () => {
    about.classList.toggle("active");
    toggleAboutButton.classList.toggle("active");
  });
  closeAboutButton.addEventListener("click", () => {
    about.classList.remove("active");
    toggleAboutButton.classList.remove("active");
  });
  about.addEventListener("click", e => {
    const target = e.target as HTMLElement;
    if (target.closest(".about--content")) return;
    about.classList.remove("active");
    toggleAboutButton.classList.remove("active");
  });
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (about.classList.contains("active")) {
        // about is showing
        about.classList.remove("active");
        toggleAboutButton.classList.remove("active");
      }
    }
  })

  const runCallback = ()=>{
    sharedState.setTipIds();
    if (!sharedState.qc.hasAnyIssues()) {
      toggleQCButton.classList.add("hidden");
    } else {
      setQCPanel(sharedState);
    }
    hideUpload();
    activateView(runUI);
    /*
    rather than explicitly list the currently known properties for version info,
    and risk that going out of date,
    iterate through properties that are defined at run time to look for differences.
    Apparently, we need a qeneric `any` type for that.
    */
    const current = p.coreVersion as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (p.saveVersion !== null) {
      const saved = p.saveVersion as any;  // eslint-disable-line @typescript-eslint/no-explicit-any
      let matched = true;
      Object.keys(current).forEach(prop=>{
        matched = matched && (current[prop] === saved[prop]);
      });
      document.querySelectorAll(".save-file-version").forEach(domElement=>{
        // (domElement as HTMLElement).classList.toggle("hidden", matched);
        (domElement as HTMLElement).classList.remove("hidden");
        (domElement as HTMLElement).classList.toggle("mismatch", saved.version !== current.version);
        (domElement.querySelector(".save-version") as HTMLElement).innerHTML = saved.version;
        (domElement.querySelector(".save-build") as HTMLElement).innerHTML = saved.build;
        (domElement.querySelector(".save-commit") as HTMLElement).innerHTML = saved.commit;
      });
    }
  };
  const configCallback = (config: ConfigExport)=>{
    sharedState.importConfig(config);
  };
  bindUpload(p, sharedState, runCallback, configCallback);
  setStage(STAGES.selecting);
  const loc = window.location;
  if (loc.search.length > 1) {
    const dataUrl = `${loc.origin}${loc.pathname}${loc.search.substring(1)}`;
    loadNow(dataUrl);
  }
}

initErrors();

setReadyCallback(onReady);

const loadListener = ()=>{
  fetch("/assets/revision.json")
    .then(response=>{
      if (response.ok) {
        return response.json();
      }
      throw new Error(`Error fetching revision.json: ${response.status} ${response.statusText}`);
    })
    .then((data:any)=>{ // eslint-disable-line @typescript-eslint/no-explicit-any
      document.querySelectorAll(".ui-version-info").forEach(domElement=>{
        (domElement as HTMLElement).classList.remove("hidden");
        const versionEle = domElement.querySelector(".ui-version") as HTMLElement;
        const commitEle = domElement.querySelector(".ui-commit") as HTMLElement;
        if (versionEle) versionEle.innerHTML = data.version;
        if (commitEle) commitEle.innerHTML = data.commit;
      });
      document.removeEventListener('DOMContentLoaded', loadListener);
    })
    .catch((err)=>{
      console.debug(err);
    });
}
document.addEventListener('DOMContentLoaded', loadListener);


