Delphy Web
======

Delphy Web is an HTML5 interface developed to run the "core" computational engine of Delphy - a fast, scalable, accurate and accessible tool for Bayesian phylogenetics based on Explicit Mutation-Annotated Trees - and visualize the results in near real time. The Delphy core is developed in collaboration with Patrick Varilly of [The Broad Institute, Inc](https://www.broadinstitute.org/)., and its separately licensed sources are hosted [here](https://github.com/broadinstitute/delphy).

In contrast to existing Bayesian phylogenetic inference tools such as BEAST that require a nontrivial amount of technical set up and computing proficiency to begin a run, Delphy Web has been developed to remove many of the barriers to entry that prevent researchers in the field from being able to engage with such tools. Delphy Web’s design means that it can be used by anyone with internet access, and users can immediately begin uploading their data into the tool without having to install software onto their computer. While web-based tools often carry with them privacy concerns from individuals and institutions alike, data processed through Delphy Web remains within the browser at all times and is never sent to servers outside of the control of users and their institutions. This design provides users with a way to quickly view and explore the output of a Delphy run while still remaining compatible with most system and administrative requirements.

The Delphy Web application that allows users to immediately and intuitively use Delphy is located at [https://delphy.fathom.info](https://delphy.fathom.info/).

References
----------

* [Whitepaper with overview of key ideas and accuracy+speed benchmarks](https://github.com/broadinstitute/delphy/blob/main/delphywp.pdf)

* [Preprint with full details and benchmarking](https://www.biorxiv.org/content/10.1101/2025.03.25.645253v1)

System Requirements
-------------------
Delphy-web includes a precompiled WebAssembly bundle of the [Delphy core](https://github.com/broadinstitute/delphy), so requires no compilation.  An official deployment is hosted by Fathom Information Design [here](https://delphy.fathom.info).  Instructions for running it locally and/or deploying it elsewhere can be found in [INSTALL.md](INSTALL.md).

Delphy-web was developed and is primarily tested under on a Mac (macOS Monterrey 12.7.4 running on an Intel Mac with a 2.4 GHz 8-core Intel Core i9 processor).  It has specifically been tested in Brave 1.66.118 (which in turn builds on Chromium 125.0.6422.147; macOS Monterrey 12.7.4, x86-64), Brave 1.67.116 (which in turn builds on Chromium 126.0.6478.114; Ubuntu 22.04.4 LTS, x86-64), Firefox 126.0.2 (on Ubuntu 22.04.4 LTS, x86-64) and Safari 17.5 (macOS Monterey 12.7.5, x86-64).


Credits and Acknowledgements
----------------------------

Delphy is developed with the support of the [Sabeti Lab](https://www.sabetilab.org/) at the [Broad
Institute](https://www.broadinstitute.org/).
