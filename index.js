#!/usr/bin/env node
const fs = require("fs");
const path = require('path');
var yargs = require('yargs');
const { hideBin } = require('yargs/helpers')
const flow = require('xml-flow');
const https = require('https');
const { readdir, writeFile } = fs.promises;

const puppeteer = require("puppeteer");
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const log = require('lighthouse-logger');
const csvStringify = require('csv-stringify/lib/sync');
const csvParse = require('csv-parse/lib/sync');

const Desktopconfig = require('./desktop-config.js');
const Mobileconfig = require('./mobile-config.js');

async function cutOff(url){
  const filename1 = url.slice(8);
  const filename2 = filename1.replace(/\//g, "-");
  return await filename2
}

function createHeadersRow(reportRows){
    let headersRow = [
    'Requested URL',
    'Final URL',
    ]
    for (row in reportRows) {
      headersRow.push(`${reportRows[row].category}: ${reportRows[row].title} (${reportRows[row].type})`);
    }
    return headersRow
}

async function reportToRowHeaders(csvFileContents) {
  const singleReportRows = await csvParse(
    csvFileContents,
    {
      columns: true,
      skip_empty_lines: true,
      ltrim: true,
      relax: true
    }
  );
  const headers = await createHeadersRow(singleReportRows);
  return headers;
};

async function createCSVRow(reportRows){
    let csvRow = [
    reportRows[0].requestedUrl,
    reportRows[0].finalUrl
    ]
    for (row in reportRows) {
      csvRow.push(reportRows[row].score)
    }
    return csvRow
}

async function reportToRow(csvFileContents){
  const reportRows = csvParse(
    csvFileContents,
    {
      columns: true,
      skip_empty_lines: true,
      ltrim: true,
    }
  );
  if (!reportRows || reportRows.length === 0) {
    return false;
  }
  const csvRow = await createCSVRow(reportRows);
  return csvRow;
};

async function aggregateCSVReports(site, dataDirPath){
  const files = await readdir(dataDirPath);
  const rows = [];
  let headers = null;
  for (file in files) {
    const filePath = path.join(dataDirPath, files[file]);
    const fileContents = fs.readFileSync(filePath, 'utf8');
    if (headers == null) {
        headers =  await reportToRowHeaders(fileContents);
        rows.push(headers);
      }
    const newRow =  await reportToRow(fileContents);
    rows.push(newRow);
  }
  const aggregatedReportData = csvStringify(rows);
  await writeFile(`${site}aggregatedMobileReport.csv`, aggregatedReportData);

};

async function siteAudit(site, sitemap) {
  sitemobile = site + "_mobile_";
  sitedesktop = site + "_desktop_";
  if (!fs.existsSync('audits')) {
    await fs.mkdirSync('audits');
  }
  if (!fs.existsSync('audits/desktop')) {
    await fs.mkdirSync('audits/desktop');
  }
  if (!fs.existsSync('audits/mobile')) {
    await fs.mkdirSync('audits/mobile');
  }
  const dirnamedesktop = "audits/desktop/" + site
  const dirnamemobile = "audits/mobile/" + site
  if (!fs.existsSync(dirnamedesktop)) {
    await fs.mkdirSync(dirnamedesktop);
  }
  if (!fs.existsSync(dirnamemobile)) {
    await fs.mkdirSync(dirnamemobile);
  }
  log.setLevel('info');
  const chrome = await chromeLauncher.launch({chromeFlags: ['--headless']});
  const csvOptions = {output: 'csv', port: chrome.port};
  const htmlOptions = {output: 'html', port: chrome.port};
  for (const loc of sitemap) {
      console.log('location: ', loc);
      const filename = await cutOff(loc);
      const runnerCSVDesktopResult = await lighthouse(loc, csvOptions, Desktopconfig);
      const runnerCSVMobileResult = await lighthouse(loc, csvOptions, Mobileconfig);
      // const runnerhtmlResult = await lighthouse(loc, htmlOptions);
      // `.report` is the csv report as a string
      const Desktopreportcsv = runnerCSVDesktopResult.report;
      const Mobilereportcsv = runnerCSVMobileResult.report;
      // const reporthtml = runnerhtmlResult.report;
      fs.writeFileSync(`audits/desktop/${site}/${filename}.csv`, Desktopreportcsv);
      fs.writeFileSync(`audits/mobile/${site}/${filename}.csv`, Mobilereportcsv);
      // fs.writeFileSync(`audits/${filename}.html`, reporthtml);
      // `.lhr` is the Lighthouse Result as a JS object
      console.log('Report is done for', runnerCSVDesktopResult.lhr.finalUrl);
      // console.log(runnerCSVResult.lhr.categories);
      console.log('Performance score was', runnerCSVDesktopResult.lhr.categories.performance.score * 100);
      console.log('Best Practices score was', runnerCSVDesktopResult.lhr.categories['best-practices'].score * 100);
      console.log('Accessiblity score was', runnerCSVDesktopResult.lhr.categories.accessibility.score * 100);
      console.log('SEO score was', runnerCSVDesktopResult.lhr.categories.seo.score * 100);
      console.log('Report is done for', runnerCSVMobileResult.lhr.finalUrl);
      // console.log(runnerCSVResult.lhr.categories);
      console.log('Performance score was', runnerCSVMobileResult.lhr.categories.performance.score * 100);
      console.log('Best Practices score was', runnerCSVMobileResult.lhr.categories['best-practices'].score * 100);
      console.log('Accessiblity score was', runnerCSVMobileResult.lhr.categories.accessibility.score * 100);
      console.log('SEO score was', runnerCSVMobileResult.lhr.categories.seo.score * 100);
  }
  await aggregateCSVReports(sitemobile, dirnamedesktop);
  await aggregateCSVReports(sitedesktop, dirnamemobile);
  await chrome.kill();
}






var argv = yargs.usage('This is my awesome program').options({
  'site': {
    description: 'site',
    required: true,
    alias: 's',
  },
  'sitemapurl': {
    description: 'url of sitemap',
    required: true,
    alias: 'u'
  }
}).argv;

// yargs.showHelp();

var file = fs.createWriteStream('site.xml');
let array = [];
https.get(argv.sitemapurl, function(res) {
    res.on('data', function(data) {
        file.write(data);
    }).on('end', function() {
        file.end();
      
        var inFile = fs.createReadStream("site.xml"),
            xmlStream = flow(inFile);
            
        xmlStream.on('tag:loc', function(url) {
            array.push(url.$text);
        }); 
        
        xmlStream.on('end', function() {
            console.log(array);
            })
        });
  });

siteAudit(argv.site, array);
// siteAudit('oldbubbies',oldbubbiessitemaparray);