import { SharedState } from "../sharedstate";

const qcDiv = document.querySelector("#qc") as HTMLDivElement;
const metadataDiv = qcDiv.querySelector("#qc--metadata") as HTMLDivElement;
const sequencesDiv = qcDiv.querySelector("#qc--sequences") as HTMLDivElement;
const otherDiv = qcDiv.querySelector("#qc--other") as HTMLDivElement;



const listItemTemplates : {[key: string]: HTMLLIElement} = {};

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
    setQCDiv("#qc--ambiguities", qc.ambiguousSiteSequences, amb=>`${amb.site}:${amb.state}`);
    setQCDiv("#qc--state", qc.invalidStateSequences, item=>item.state);
    setQCDiv("#qc--gaps", qc.invalidGapSequences, gap=>`${gap.startSite}:${gap.endSite}`);
    setQCDiv("#qc--mutations", qc.invalidMutationSequences, mut=>`${mut.from}:${mut.site}:${mut.to}`);
  }

  if (showOther) {
    setQCDiv("#qc--other", qc.other, JSON.stringify);
  }

}



const setDateIssues = (noDateSequences:string[])=>{
  /* might need to add logic to hide this if we end up tracking other metadata issues */
  const ul = qcDiv.querySelector("#qc--dates ul") as HTMLUListElement;
  noDateSequences.forEach(seq=>{
    const li = document.createElement("li") as HTMLLIElement;
    li.textContent = seq;
    ul.appendChild(li);
  });
}



/*
@param formatter: takes input and returns a string. At this point in time, the
inputs are of type InvalidGapWarning, InvalidMutationWarning, InvalidStateWarning,
SiteAmbiguity. These all hold information about various QC errors, and the
formatter function transforms these into legible strings for display.
*/
const setQCDiv = (cssSelector:string, seqs: {[seqId: string]: any[] }, // eslint-disable-line  @typescript-eslint/no-explicit-any
  formatter:(data:any)=>string)=>{ // eslint-disable-line  @typescript-eslint/no-explicit-any
  const div = qcDiv.querySelector(cssSelector) as HTMLDivElement;
  let anyEntries = false;
  const ul = div.querySelector("ul") as HTMLUListElement;
  let template = listItemTemplates[cssSelector];
  if (template === undefined) {
    template = ul.querySelector("li") as HTMLLIElement;
    template.remove();
    listItemTemplates[cssSelector] = template;
  }
  Object.entries(seqs).forEach(([seq, data])=>{
    const li = template.cloneNode(true) as HTMLLIElement;
    const seqSpan = li.querySelector(".seq") as HTMLSpanElement;
    const dataSpan = li.querySelector(".data") as HTMLSpanElement;
    seqSpan.textContent = seq;
    let siteList = '';
    data.forEach((a,i)=>{
      if (i > 0) siteList += ', ';
      siteList += formatter(a);
    })
    dataSpan.textContent = siteList;
    ul.appendChild(li);
    anyEntries = true;
  });
  div.classList.toggle('inactive', !anyEntries);

};