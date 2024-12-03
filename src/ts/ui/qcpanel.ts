import { InvalidGapWarning, InvalidMutationWarning, InvalidStateWarning, SiteAmbiguity } from "../recordquality";
import { SharedState } from "../sharedstate";

const metadataDiv = document.querySelector("#qc--metadata") as HTMLDivElement;
const sequencesDiv = document.querySelector("#qc--sequences") as HTMLDivElement;
const otherDiv = document.querySelector("#qc--other") as HTMLDivElement;


/*
executed once upon completing the load of the data
*/
export const setQCPanel = (sharedState: SharedState)=>{
  const qc = sharedState.qc;
  const showMetadata = qc.hasMissingDates();
  const showSequencing = qc.hasSequencingIssues();
  const showOther = qc.hasOther();

  metadataDiv.classList.toggle("inactive", !showMetadata);
  sequencesDiv.classList.toggle("inactive", !showSequencing);
  otherDiv.classList.toggle("inactive", !showOther);
  console.log(qc);

  if (showMetadata) {
    setDateIssues(qc.noDateSequences);
  }

  if (showSequencing) {
    setAmbiguous(qc.ambiguousSiteSequences);
    setInvalidState(qc.invalidStateSequences);
    setInvalidGaps(qc.invalidGapSequences);
    setInvalidMutations(qc.invalidMutationSequences);
  }

  if (showOther) {
    setOther(qc.other);
  }

}



const setDateIssues = (noDateSequences:string[])=>{
  /* might need to add logic to hide this if we end up tracking other metadata issues */
  const ul = metadataDiv.querySelector("#qc--dates ul") as HTMLUListElement;
  noDateSequences.forEach(seq=>{
    const li = document.createElement("li") as HTMLLIElement;
    li.textContent = seq;
    ul.appendChild(li);
  });
}

const setAmbiguous = (seqs: {[seqid: string]: SiteAmbiguity[] })=>{
  const div = sequencesDiv.querySelector("#qc--ambiguities") as HTMLDivElement;
  let anyEntries = false;
  const ul = div.querySelector("ul") as HTMLUListElement;
  const template = ul.querySelector("li") as HTMLLIElement;
  template.remove();
  Object.entries(seqs).forEach(([seq, ambs])=>{
    const li = template.cloneNode(true) as HTMLLIElement;
    const seqSpan = li.querySelector(".seq") as HTMLSpanElement;
    const dataSpan = li.querySelector(".data") as HTMLSpanElement;
    seqSpan.textContent = seq;
    let siteList = '';
    ambs.forEach((a,i)=>{
      if (i > 0) siteList += ', ';
      siteList += `${a.site}:${a.state}`;
    })
    dataSpan.textContent = siteList;
    ul.appendChild(li);
    anyEntries = true;
  });
  div.classList.toggle('inactive', !anyEntries);
};

const setInvalidState = (seqs: {[seqid: string]: InvalidStateWarning[] })=>{
  const div = sequencesDiv.querySelector("#qc--state") as HTMLDivElement;
  let anyEntries = false;
  const ul = div.querySelector("ul") as HTMLUListElement;
  const template = ul.querySelector("li") as HTMLLIElement;
  template.remove();
  Object.entries(seqs).forEach(([seq, states])=>{
    const li = template.cloneNode(true) as HTMLLIElement;
    const seqSpan = li.querySelector(".seq") as HTMLSpanElement;
    const dataSpan = li.querySelector(".data") as HTMLSpanElement;
    seqSpan.textContent = seq;
    let siteList = '';
    states.forEach((a,i)=>{
      if (i > 0) siteList += ', ';
      siteList += `${a.state}`;
    })
    dataSpan.textContent = siteList;
    ul.appendChild(li);
    anyEntries = true;
  });
  div.classList.toggle('inactive', !anyEntries);
};

const setInvalidGaps = (seqs: {[seqid: string]: InvalidGapWarning[] })=>{
  const div = sequencesDiv.querySelector("#qc--gaps") as HTMLDivElement;
  let anyEntries = false;
  const ul = div.querySelector("ul") as HTMLUListElement;
  const template = ul.querySelector("li") as HTMLLIElement;
  template.remove();
  Object.entries(seqs).forEach(([seq, sites])=>{
    const li = template.cloneNode(true) as HTMLLIElement;
    const seqSpan = li.querySelector(".seq") as HTMLSpanElement;
    const dataSpan = li.querySelector(".data") as HTMLSpanElement;
    seqSpan.textContent = seq;
    let siteList = '';
    sites.forEach((a,i)=>{
      if (i > 0) siteList += ', ';
      siteList += `${a.startSite}:${a.endSite}`;
    })
    dataSpan.textContent = siteList;
    ul.appendChild(li);
    anyEntries = true;
  });
  div.classList.toggle('inactive', !anyEntries);
};

const setInvalidMutations = (seqs: {[seqid: string]: InvalidMutationWarning[] })=>{
  const div = sequencesDiv.querySelector("#qc--mutations") as HTMLDivElement;
  let anyEntries = false;
  const ul = div.querySelector("ul") as HTMLUListElement;
  const template = ul.querySelector("li") as HTMLLIElement;
  template.remove();
  Object.entries(seqs).forEach(([seq, ambs])=>{
    const li = template.cloneNode(true) as HTMLLIElement;
    const seqSpan = li.querySelector(".seq") as HTMLSpanElement;
    const dataSpan = li.querySelector(".data") as HTMLSpanElement;
    seqSpan.textContent = seq;
    let siteList = '';
    ambs.forEach((m,i)=>{
      if (i > 0) siteList += ', ';
      siteList += `${m.from}:${m.site}:${m.to}`;
    })
    dataSpan.textContent = siteList;
    ul.appendChild(li);
    anyEntries = true;
  });
  div.classList.toggle('inactive', !anyEntries);
};


const setOther = (seqs: {[seqId: string]: any[] })=>{ // eslint-disable-line @typescript-eslint/no-explicit-any
  const div = sequencesDiv.querySelector("#qc--ambiguities") as HTMLDivElement;
  let anyEntries = false;
  const ul = div.querySelector("ul") as HTMLUListElement;
  const template = ul.querySelector("li") as HTMLLIElement;
  template.remove();
  Object.entries(seqs).forEach(([seq, ambs])=>{
    const li = template.cloneNode(true) as HTMLLIElement;
    const seqSpan = li.querySelector(".seq") as HTMLSpanElement;
    const dataSpan = li.querySelector(".data") as HTMLSpanElement;
    seqSpan.textContent = seq;
    let siteList = '';
    ambs.forEach((a,i)=>{
      if (i > 0) siteList += ', ';
      siteList += JSON.stringify(a);
    })
    dataSpan.textContent = siteList;
    ul.appendChild(li);
    anyEntries = true;
  });
  div.classList.toggle('inactive', !anyEntries);
}