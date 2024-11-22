import { STAGES } from '../constants';
import { setShowFormat, setStage } from '../errors';
import {Pythia} from '../pythia/pythia';
import { ConfigExport } from './mccconfig';

const DEMO_PATH = './ma_sars_cov_2.maple'
const PROXY_PATH = 'https://delphy.fathom.info/proxy/';

let pythia : Pythia;

const showFormatHints = ()=>{
  info.classList.remove("hidden");
}
setShowFormat(showFormatHints);


/* show a progress bar when possible */
const statusContainer = document.querySelector("#uploader--status") as HTMLDivElement;
const progressBar = document.querySelector("#uploader--progress") as HTMLDivElement;
const progressLabel = document.querySelector("#uploader--progress-label") as HTMLDivElement;
const showProgress = (unit: string, total: number, soFar: number)=>{
  /* if we aren't tracking progress, yield to the main status message */
  if (soFar === 0 || soFar === total) {
    activateProgressBar(false);
  } else {
    activateProgressBar(true);
    const pct = 100 * soFar / total;
    const label = `${soFar} / ${total} ${unit}`;
    progressBar.style.width = `${pct}%`;
    progressLabel.textContent = label;
  }
};
const activateProgressBar = (showit=true)=>{
  statusContainer.classList.toggle("progressing", showit);
}

let runCallback = ()=>{console.debug('runCallback not assigned')},
  configCallback = (config: ConfigExport)=>{console.debug('configCallback not assigned', config)};
const errCallback = (msg:string)=>{
  console.log(msg);
  requestAnimationFrame(()=>{
    showFormatHints()
    uploadDiv.classList.remove('parsing');
    uploadDiv.classList.remove('loading');
    uploadDiv.classList.add('error');
    setTimeout(()=>alert(msg), 0);
  });
}

const maybeUploadDiv = document.querySelector("#uploader");
if (!maybeUploadDiv) {
  throw new Error("could not find the uploader div in the html");
}
const uploadDiv = maybeUploadDiv as HTMLDivElement;

const info = uploadDiv.querySelector(".uploader--info-content") as HTMLElement;
const infoToggle = uploadDiv.querySelector(".uploader--info-toggle") as HTMLButtonElement;
infoToggle.addEventListener("click", () => info.classList.toggle("hidden"));
uploadDiv.addEventListener("click", e => {
  const target = e.target as HTMLElement;
  if (target.closest(".uploader--info")) return;
  info.classList.add("hidden");
});
window.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (!info.classList.contains("hidden")) {
      info.classList.add("hidden");
    }
  }
});


function bindUpload(p:Pythia, callback : ()=>void, setConfig : (config: ConfigExport)=>void) {
  pythia = p;
  runCallback = callback;
  configCallback = setConfig;
  uploadDiv.classList.remove('disabled');
  document.body.addEventListener("dragover", (event:DragEvent)=>handleDrag(event));
  document.body.addEventListener("dragleave", () => handleDragLeave());
  document.body.addEventListener("drop", (event:DragEvent)=>{
    setStage(STAGES.loading);
    uploadDiv.classList.add('loading');
    handleFileUpload(event).then(()=>{
      setStage(STAGES.parsing);
      uploadDiv.classList.remove('loading');
      uploadDiv.classList.add('parsing');
      // console.log(item);
      // const {tree, refSeq, count} = item;
      // runCallback(tree, refSeq, count);
    });
  });
  document.querySelector("#uploader--demo-button")?.addEventListener("click", ()=>{
    setStage(STAGES.loading);
    uploadDiv.classList.add('loading');
    fetch(DEMO_PATH)
      .then(r => r.arrayBuffer())
      .then(bytesJs => {
        setStage(STAGES.parsing);
        uploadDiv.classList.remove('loading');
        uploadDiv.classList.add('parsing');
        // pythia.initRunFromFasta(bytesJs, runCallback, errCallback);
        pythia.initRunFromMaple(bytesJs, runCallback, errCallback);
      })
  });

  document.querySelectorAll('.version-info').forEach((domElement)=>{
    const coreVersion = p.coreVersion;
    (domElement.querySelector('.core-version') as HTMLElement).innerText = coreVersion.version;
    (domElement.querySelector('.core-build') as HTMLElement).innerText = `${coreVersion.build}`;
    (domElement.querySelector('.core-commit') as HTMLElement).innerText = coreVersion.commit;
    domElement.classList.remove('hidden');
  })


  const fileInput = uploadDiv.querySelector("#uploader--file-input") as HTMLInputElement;
  if (fileInput) {
    fileInput?.addEventListener("change", ()=>{
      if (fileInput.files) {
        setStage(STAGES.loading);
        uploadDiv.classList.add('loading');
        checkFiles(fileInput.files);
      }
    });
  }
  const urlInput = uploadDiv.querySelector("#uploader--url-input") as HTMLInputElement;
  const urlForm = uploadDiv.querySelector("#uploader--url-form") as HTMLFormElement;
  urlInput.addEventListener("change", ()=>loadNow(urlInput.value));
  urlForm.addEventListener("submit", (event:SubmitEvent)=>{
    event.preventDefault();
    loadNow(urlInput.value);
    return false;
  });
  const urlDiv = document.querySelector("#uploader--url-message") as HTMLDivElement;
  let button: HTMLButtonElement = document.querySelector("#uploader--proxy-info-activate") as HTMLButtonElement;
  button?.addEventListener("click", ()=>urlDiv?.classList.toggle("proxy-info"));
  const loc = window.location;
  if (loc.search.length > 1) {
    let dataUrl = loc.search.substring(1);
    if (!dataUrl.startsWith("http")) {
      dataUrl = `${loc.origin}${loc.pathname}${dataUrl}`;
    }
    loadNow(dataUrl);
  } else {
    button = document.querySelector("#uploader--demo-button") as HTMLButtonElement;
    button.focus();
  }
}



const loadNow = (url:string, byProxy=false)=>{
  setStage(STAGES.loading);
  uploadDiv.classList.add('loading');
  uploadDiv.classList.add('direct-loading');
  const options:RequestInit = byProxy ? {} : {mode: 'no-cors'};
  let urlOk = !byProxy;
  if (byProxy && !url.startsWith(PROXY_PATH)) {
    if (url.startsWith("https://")) {
      url = `${ PROXY_PATH }${ url.substring(8)}`;
      urlOk = true;
    }
  }
  if (!urlOk) {
    console.warn(`bad url for proxying, needs to start with https ${url}`)
  } else {
    console.log(`fetching from ${url}`);
    fetch(url, options)
      .then(response => {
        if (!response.ok) {
          console.log(`we connected, but got status code ${response.status}`);
          throw new Error(response.statusText);
        }
        return response.blob();
      })
      .then(blob => {
        setStage(STAGES.parsing);
        uploadDiv.classList.remove('loading');
        uploadDiv.classList.add('parsing');
        const fname = url.split('/').pop() || '';
        const asFile = new File([blob], fname);
        // blob.text().then(txt=>console.log(txt));
        checkFiles([asFile]);
      })
      .catch((err:TypeError)=>{
        console.log(err);
        if (!byProxy && !url.startsWith(PROXY_PATH)) {
          // console.log("gonna retry by proxy");
          // loadNow(url, true);
          showProxyOption(url);
        }
      });
  }
};

const showProxyOption = (url:string)=>{
  const urlDict = new URL(url);
  uploadDiv.classList.remove('loading');
  const popup = document.querySelector("#uploader--proxy-popup") as HTMLDivElement;
  const fileLink = popup.querySelector(".uploader--remote-url") as HTMLAnchorElement;
  const serverSpan = popup.querySelector(".uploader--remote-host") as HTMLSpanElement;
  const yesProxyButton = popup.querySelector("#uploader--try-proxy") as HTMLButtonElement;
  const noProxyButton = popup.querySelector("#uploader--no-proxy") as HTMLButtonElement;
  const yesHandler = ()=>{
    dismiss();
    loadNow(url, true);
  }
  const dismiss = ()=>{
    uploadDiv.classList.remove('direct-loading');
    yesProxyButton.removeEventListener("click", yesHandler);
    noProxyButton.removeEventListener("click", dismiss);
    popup.classList.remove("active");
  }
  fileLink.href = url;
  serverSpan.textContent = urlDict.hostname;
  yesProxyButton.addEventListener("click", yesHandler);
  noProxyButton.addEventListener("click", dismiss);
  popup.classList.add("active");
}



const hideUpload = ()=>{
  document.body.classList.toggle("displaying-import-view", false);
}


const handleDrag = (event: DragEvent)=>{
  if (event && event.dataTransfer) {
    /*
    default behavior for the browser is to open the file in a new tab.
    We don't want that.
    */
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';

    uploadDiv.classList.add("dragging");
  }
}

const handleDragLeave = ()=>{
  uploadDiv.classList.remove("dragging");
}

const handleFileUpload = (event: DragEvent)=>{
  return new Promise(()=>{
    if (event && event.dataTransfer) {
      event.preventDefault();
      event.stopPropagation();
      uploadDiv.classList.add('loading');
      setStage(STAGES.loading);
      const files = event.dataTransfer.files;
      checkFiles(files);
    }
  });
}


const displayParsingState = ()=>{
  setStage(STAGES.parsing);
  uploadDiv.classList.remove('loading');
  uploadDiv.classList.add('parsing');
}

const checkFiles = (files: File[] | FileList)=>{
  if (files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i],
        fname = file.name,
        tokens = fname.split('.'),
        extension = tokens[tokens.length - 1],
        reader = new FileReader();
      if (extension === 'dphy') {
        /* we are loading a saved run */
        reader.addEventListener('load', event=>{
          displayParsingState();
          const bytesJs = event.target?.result;
          if (bytesJs) {
            const progressCallback = (p:number, t:number)=>{
              const action = `${p === 1 ? 'tree' : 'trees'  } loaded`;
              showProgress(action, t, p);
            };
            pythia.initRunFromSaveFile(bytesJs as ArrayBuffer, runCallback, progressCallback)
              .then(mccConfig=>configCallback(mccConfig as ConfigExport));
          } else {
            alert(`could not read file.`);
          }
        });
        reader.readAsArrayBuffer(file);
      } else if (extension === 'fasta' || extension === 'fa') {
        reader.addEventListener('load', event=>{
          displayParsingState();
          const fastaBytesJs = event.target?.result as ArrayBuffer;
          if (fastaBytesJs) pythia.initRunFromFasta(fastaBytesJs, runCallback, errCallback);
        });
        reader.readAsArrayBuffer(file);
      } else if (extension === 'maple') {
        reader.addEventListener('load', event=>{
          setStage(STAGES.parsing);
          uploadDiv.classList.remove('loading');
          uploadDiv.classList.add('parsing');
          const mapleBytesJs = event.target?.result as ArrayBuffer;
          if (mapleBytesJs) pythia.initRunFromMaple(mapleBytesJs, runCallback, errCallback);
        });
        reader.readAsArrayBuffer(file);
      } else {
        // check if this is formatted like a fasta file
        const onload = (event:ProgressEvent)=>{
          const text = (event.target as HTMLFormElement)?.result;
          reader.removeEventListener('load', onload);
          uploadDiv.classList.remove('loading');
          // do we have a fasta file? this check is simplistic:
          if (text[0] === '>') {
            setStage(STAGES.parsing);
            uploadDiv.classList.add('parsing');
            reader.addEventListener('load', event=>{
              const fastaBytesJs = event.target?.result as ArrayBuffer;
              if (fastaBytesJs) pythia.initRunFromFasta(fastaBytesJs, runCallback, errCallback);
            });
            reader.readAsArrayBuffer(file);
          } else {
            alert(`This program doesn't handle '.${extension}' files. Please upload a fasta (with a ".fa" or ".fasta" extension) or a saved Delphy (.dphy) run.`);
            uploadDiv.classList.remove('loading');
            uploadDiv.classList.remove('parsing');
            uploadDiv.classList.remove('direct-loading');
            setStage(STAGES.initialization);
          }
        }
        reader.addEventListener('load', onload);
        reader.readAsText(file);
      }
    }
  }
}


export { bindUpload, hideUpload, loadNow };
