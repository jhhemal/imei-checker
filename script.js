/*
=========================================================
IMEI WEB APP
=========================================================

FILES:
- index.html
- styles.css
- script.js

The IMEI Match page uses localStorage.

The Dubai Scan page uses Supabase so multiple computers
can scan into the same shared list.

Before using Dubai Scan:
1. Create a Supabase project.
2. Create the table below in Supabase SQL Editor.
3. Replace SUPABASE_URL and SUPABASE_ANON_KEY below.

SUPABASE SQL:

create table if not exists public.dubai_scans (
    imei text primary key,
    created_at timestamptz not null default now()
);

alter table public.dubai_scans enable row level security;

create policy "Allow public read of dubai scans"
on public.dubai_scans
for select
to anon
using (true);

create policy "Allow public insert of dubai scans"
on public.dubai_scans
for insert
to anon
with check (true);

alter publication supabase_realtime
add table public.dubai_scans;

=========================================================
*/


/* =====================================================
   SUPABASE CONFIG
===================================================== */

const SUPABASE_URL =
    window.APP_CONFIG?.SUPABASE_URL || "";

const SUPABASE_ANON_KEY =
    window.APP_CONFIG?.SUPABASE_KEY || "";

let db = null;

if(
    window.supabase &&
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
    SUPABASE_ANON_KEY !== "YOUR_SUPABASE_PUBLISHABLE_KEY"
){
    db = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );
}


/* =====================================================
   APP NAVIGATION
===================================================== */

const pageInfo = {
    dashboardPage:{title:"Dashboard",subtitle:"Dubai shipment scanning overview"},
    matchPage:{title:"IMEI Match",subtitle:"Verify IMEIs against your saved list"},
    dubaiPage:{title:"Dubai Scan",subtitle:"Shared IMEI scanning from multiple computers"},
    searchPage:{title:"Search IMEI",subtitle:"Find a scanned IMEI and its shipment"}
};

const navItems =
    document.querySelectorAll(".nav-item");

const pages =
    document.querySelectorAll(".page");

const pageTitle =
    document.getElementById("pageTitle");

const pageSubtitle =
    document.getElementById("pageSubtitle");

navItems.forEach(item => {

    item.addEventListener("click", () => {

        const pageId =
            item.dataset.page;

        showPage(pageId);
    });

});

document.querySelectorAll(".page-link").forEach(button => {
    button.addEventListener("click", () => showPage(button.dataset.targetPage));
});

const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("imei-theme");
const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

function applyTheme(theme){
    const dark = theme === "dark";
    document.body.classList.toggle("dark-theme", dark);
    themeToggle.textContent = dark ? "☀" : "☾";
    themeToggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
}

applyTheme(savedTheme || (prefersDark ? "dark" : "light"));
themeToggle.addEventListener("click", () => {
    const theme = document.body.classList.contains("dark-theme") ? "light" : "dark";
    localStorage.setItem("imei-theme", theme);
    applyTheme(theme);
});


function showPage(pageId){

    pages.forEach(page => {
        page.classList.remove("active");
    });

    navItems.forEach(item => {
        item.classList.remove("active");
    });

    document
        .getElementById(pageId)
        .classList
        .add("active");

    document
        .querySelector(
            `[data-page="${pageId}"]`
        )
        .classList
        .add("active");

    pageTitle.textContent =
        pageInfo[pageId].title;

    pageSubtitle.textContent =
        pageInfo[pageId].subtitle;


    if(pageId === "dashboardPage") refreshDashboard();
    if(pageId === "matchPage") matchScanInput.focus();
    if(pageId === "dubaiPage") { initializeDubai(); dubaiScanInput.focus(); }
    if(pageId === "searchPage") searchImeiInput.focus();
}


/* =====================================================
   HELPERS
===================================================== */

function cleanImei(value){

    return String(value)
        .trim()
        .replace(/\D/g,"");
}

function isValidImei(imei){
    if(!/^\d{15}$/.test(imei)) return false;

    let sum = 0;
    for(let index = 0; index < imei.length; index++){
        let digit = Number(imei[index]);
        if(index % 2 === 1){
            digit *= 2;
            if(digit > 9) digit -= 9;
        }
        sum += digit;
    }

    return sum % 10 === 0;
}

function imeiValidationMessage(imei){
    if(imei.length !== 15) return "IMEI must contain exactly 15 digits.";
    if(!isValidImei(imei)) return "IMEI checksum is invalid. Check the number and try again.";
    return "";
}

function formatDateTime(value){ return value ? new Date(value).toLocaleString() : "—"; }
function makeShipmentName(){
    const now=new Date();
    const date=now.toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
    const time=now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
    return `Dubai ${date} ${time}`;
}
function escapeHtml(value){ return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }


function beep(type){

    try{

        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        const ctx =
            new AudioContext();

        const oscillator =
            ctx.createOscillator();

        const gain =
            ctx.createGain();

        oscillator.connect(gain);
        gain.connect(ctx.destination);

        if(type === "success"){
            oscillator.frequency.value = 880;
        }
        else if(type === "duplicate"){
            oscillator.frequency.value = 420;
        }
        else{
            oscillator.frequency.value = 220;
        }

        gain.gain.setValueAtTime(
            .11,
            ctx.currentTime
        );

        gain.gain
            .exponentialRampToValueAtTime(
                .001,
                ctx.currentTime + .18
            );

        oscillator.start();

        oscillator.stop(
            ctx.currentTime + .18
        );

    }catch(error){}
}


/* =====================================================
   IMEI MATCH PAGE
===================================================== */

const MATCH_STORAGE = {
    imeis:"imeiWebApp_match_imeis",
    found:"imeiWebApp_match_found",
    history:"imeiWebApp_match_history"
};

let matchImeis = [];
let matchFoundSet = new Set();
let matchHistoryData = [];

const matchTotal =
    document.getElementById("matchTotal");

const matchFound =
    document.getElementById("matchFound");

const matchRemaining =
    document.getElementById("matchRemaining");

const matchProgressText =
    document.getElementById("matchProgressText");

const matchProgressFill =
    document.getElementById("matchProgressFill");

const matchScanInput =
    document.getElementById("matchScanInput");

const matchResult =
    document.getElementById("matchResult");

const matchComplete =
    document.getElementById("matchComplete");

const singleImeiInput =
    document.getElementById("singleImeiInput");

const bulkImeiInput =
    document.getElementById("bulkImeiInput");

const addSingleBtn =
    document.getElementById("addSingleBtn");

const addBulkBtn =
    document.getElementById("addBulkBtn");

const clearBulkBtn =
    document.getElementById("clearBulkBtn");

const manageMessage =
    document.getElementById("manageMessage");

const matchImeiList =
    document.getElementById("matchImeiList");

const matchListBadge =
    document.getElementById("matchListBadge");

const matchHistory =
    document.getElementById("matchHistory");

const matchHistoryBadge =
    document.getElementById("matchHistoryBadge");

const resetMatchesBtn =
    document.getElementById("resetMatchesBtn");

const deleteAllMatchBtn =
    document.getElementById("deleteAllMatchBtn");

const exportMatchHistoryBtn =
    document.getElementById("exportMatchHistoryBtn");

const clearMatchHistoryBtn =
    document.getElementById("clearMatchHistoryBtn");

const salesCsvInput =
    document.getElementById("salesCsvInput");

const uploadSalesCsvBtn =
    document.getElementById("uploadSalesCsvBtn");

const salesCsvMessage =
    document.getElementById("salesCsvMessage");


function loadMatchData(){

    const savedImeis =
        localStorage.getItem(
            MATCH_STORAGE.imeis
        );

    const savedFound =
        localStorage.getItem(
            MATCH_STORAGE.found
        );

    const savedHistory =
        localStorage.getItem(
            MATCH_STORAGE.history
        );

    if(savedImeis){
        matchImeis =
            JSON.parse(savedImeis);
    }

    if(savedFound){
        matchFoundSet =
            new Set(
                JSON.parse(savedFound)
            );
    }

    if(savedHistory){
        matchHistoryData =
            JSON.parse(savedHistory);
    }
}


function saveMatchData(){

    localStorage.setItem(
        MATCH_STORAGE.imeis,
        JSON.stringify(matchImeis)
    );

    localStorage.setItem(
        MATCH_STORAGE.found,
        JSON.stringify(
            [...matchFoundSet]
        )
    );

    localStorage.setItem(
        MATCH_STORAGE.history,
        JSON.stringify(matchHistoryData)
    );
}


function renderMatchPage(){

    matchFoundSet =
        new Set(
            [...matchFoundSet]
            .filter(imei =>
                matchImeis.includes(imei)
            )
        );

    const total =
        matchImeis.length;

    const found =
        matchFoundSet.size;

    const remaining =
        total - found;

    const percent =
        total === 0
        ? 0
        : Math.round(
            (found / total) * 100
        );

    matchTotal.textContent =
        total;

    matchFound.textContent =
        found;

    matchRemaining.textContent =
        remaining;

    matchProgressText.textContent =
        percent + "%";

    matchProgressFill.style.width =
        percent + "%";

    matchListBadge.textContent =
        remaining + " Remaining";

    matchComplete.style.display =
        total > 0 &&
        found === total
        ? "block"
        : "none";

    matchImeiList.innerHTML = "";

    matchImeis.forEach(imei => {

        const li =
            document.createElement("li");

        if(matchFoundSet.has(imei)){
            li.className =
                "imei-row-found";
        }

        const number =
            document.createElement("span");

        number.className =
            "imei-number";

        number.textContent =
            imei;

        const right =
            document.createElement("div");

        right.className =
            "imei-right";

        const status =
            document.createElement("span");

        status.className =
            "imei-status";

        status.textContent =
            matchFoundSet.has(imei)
            ? "✓ Verified"
            : "Pending";

        const deleteButton =
            document.createElement("button");

        deleteButton.type =
            "button";

        deleteButton.className =
            "delete-mini";

        deleteButton.textContent =
            "Delete";

        deleteButton.addEventListener(
            "click",
            () => deleteMatchImei(imei)
        );

        right.appendChild(status);
        right.appendChild(deleteButton);

        li.appendChild(number);
        li.appendChild(right);

        matchImeiList.appendChild(li);
    });

    renderMatchHistory();

    saveMatchData();
}


function showMatchResult(
    message,
    type
){

    matchResult.textContent =
        message;

    matchResult.className =
        "scan-result";

    if(type === "success"){
        matchResult.classList.add(
            "result-success"
        );
    }
    else if(type === "duplicate"){
        matchResult.classList.add(
            "result-duplicate"
        );
    }
    else{
        matchResult.classList.add(
            "result-error"
        );
    }
}


function addSingleMatchImei(){

    const imei =
        cleanImei(
            singleImeiInput.value
        );

    if(!imei){

        showManageMessage(
            "Enter an IMEI number.",
            false
        );

        return;
    }

    const validationMessage = imeiValidationMessage(imei);
    if(validationMessage){
        showManageMessage(validationMessage, false);
        return;
    }

    if(matchImeis.includes(imei)){

        showManageMessage(
            "This IMEI is already in your list.",
            false
        );

        return;
    }

    matchImeis.push(imei);

    singleImeiInput.value = "";

    showManageMessage(
        "IMEI added successfully.",
        true
    );

    renderMatchPage();
}


function addBulkMatchImeis(){

    const raw =
        bulkImeiInput.value.trim();

    if(!raw){

        showManageMessage(
            "Paste IMEIs first.",
            false
        );

        return;
    }

    const values =
        raw
        .split(/[\s,\t]+/)
        .map(cleanImei);

    let added = 0;
    let duplicates = 0;
    let invalid = 0;

    values.forEach(imei => {

        if(!isValidImei(imei)){
            invalid++;
            return;
        }

        if(matchImeis.includes(imei)){
            duplicates++;
        }
        else{
            matchImeis.push(imei);
            added++;
        }
    });

    bulkImeiInput.value = "";

    showManageMessage(
        `${added} IMEI(s) added. ${duplicates} duplicate(s) and ${invalid} invalid value(s) skipped.`,
        added > 0
    );

    renderMatchPage();
}


let manageMessageTimer = null;

function showManageMessage(
    message,
    success
){

    clearTimeout(
        manageMessageTimer
    );

    manageMessage.textContent =
        message;

    manageMessage.className =
        success
        ? "inline-message message-success"
        : "inline-message message-error";

    manageMessageTimer =
        setTimeout(() => {

            manageMessage.style.display =
                "none";

        },3500);

    manageMessage.style.display =
        "block";
}


function deleteMatchImei(imei){

    matchImeis =
        matchImeis.filter(
            item => item !== imei
        );

    matchFoundSet.delete(imei);

    renderMatchPage();
}


function addMatchHistory(
    imei,
    type
){

    matchHistoryData.unshift({
        imei,
        type,
        time:
            new Date()
            .toLocaleString()
    });

    renderMatchHistory();

    saveMatchData();
}


function renderMatchHistory(){

    matchHistory.innerHTML = "";

    matchHistoryBadge.textContent =
        matchHistoryData.length +
        " Scans";

    matchHistoryData.forEach(scan => {

        const row =
            document.createElement("div");

        if(scan.type === "MATCH"){
            row.className =
                "history-row history-match";
        }
        else if(scan.type === "DUPLICATE"){
            row.className =
                "history-row history-duplicate";
        }
        else{
            row.className =
                "history-row history-error";
        }

        const left =
            document.createElement("span");

        let icon = "✕";

        if(scan.type === "MATCH"){
            icon = "✓";
        }

        if(scan.type === "DUPLICATE"){
            icon = "⚠";
        }

        left.textContent =
            `${icon} ${scan.imei}`;

        const time =
            document.createElement("span");

        time.className =
            "history-time";

        time.textContent =
            scan.time;

        row.appendChild(left);
        row.appendChild(time);

        matchHistory.appendChild(row);
    });
}


matchScanInput.addEventListener(
    "keydown",
    event => {

        if(event.key !== "Enter"){
            return;
        }

        event.preventDefault();

        const imei =
            cleanImei(
                matchScanInput.value
            );

        matchScanInput.value = "";
        matchScanInput.focus();

        if(!imei){
            return;
        }

        const validationMessage = imeiValidationMessage(imei);
        if(validationMessage){
            showMatchResult(validationMessage, "error");
            addMatchHistory(imei || "Invalid entry", "INVALID");
            beep("error");
            return;
        }

        if(matchImeis.includes(imei)){

            if(matchFoundSet.has(imei)){

                showMatchResult(
                    "⚠ Already Scanned",
                    "duplicate"
                );

                addMatchHistory(
                    imei,
                    "DUPLICATE"
                );

                beep("duplicate");
            }
            else{

                matchFoundSet.add(imei);

                showMatchResult(
                    "✓ Match Found",
                    "success"
                );

                addMatchHistory(
                    imei,
                    "MATCH"
                );

                beep("success");

                renderMatchPage();
            }
        }
        else{

            showMatchResult(
                "✕ IMEI Not Found",
                "error"
            );

            addMatchHistory(
                imei,
                "NO MATCH"
            );

            beep("error");
        }
    }
);


singleImeiInput.addEventListener(
    "keydown",
    event => {

        if(event.key === "Enter"){

            event.preventDefault();

            addSingleMatchImei();
        }
    }
);


addSingleBtn.addEventListener(
    "click",
    addSingleMatchImei
);


addBulkBtn.addEventListener(
    "click",
    addBulkMatchImeis
);


clearBulkBtn.addEventListener(
    "click",
    () => {

        bulkImeiInput.value = "";
    }
);


resetMatchesBtn.addEventListener(
    "click",
    () => {

        if(
            !confirm(
                "Reset all matched IMEIs?"
            )
        ){
            return;
        }

        matchFoundSet.clear();

        renderMatchPage();
    }
);


deleteAllMatchBtn.addEventListener(
    "click",
    () => {

        if(
            !confirm(
                "Delete all IMEIs?"
            )
        ){
            return;
        }

        matchImeis = [];
        matchFoundSet.clear();

        renderMatchPage();
    }
);


clearMatchHistoryBtn.addEventListener(
    "click",
    () => {

        matchHistoryData = [];

        renderMatchHistory();
        saveMatchData();
    }
);


exportMatchHistoryBtn.addEventListener(
    "click",
    () => {

        let csv =
            "IMEI,Result,Time\n";

        matchHistoryData.forEach(scan => {

            csv +=
                `"${scan.imei}",` +
                `"${scan.type}",` +
                `"${scan.time}"\n`;
        });

        downloadTextFile(
            csv,
            "imei_match_history.csv",
            "text/csv;charset=utf-8;"
        );
    }
);



/* SALES CSV IMPORT */

let salesCsvMessageTimer = null;

function showSalesCsvMessage(
    message,
    success
){

    clearTimeout(
        salesCsvMessageTimer
    );

    salesCsvMessage.textContent =
        message;

    salesCsvMessage.className =
        success
        ? "inline-message message-success"
        : "inline-message message-error";

    salesCsvMessage.style.display =
        "block";

    salesCsvMessageTimer =
        setTimeout(
            () => {
                salesCsvMessage.style.display =
                    "none";
            },
            4500
        );
}


async function loadSalesCsv(){

    const file =
        salesCsvInput.files[0];

    if(!file){

        showSalesCsvMessage(
            "Choose a CSV file first.",
            false
        );

        return;
    }

    try{

        const data =
            await file.arrayBuffer();

        const workbook =
            XLSX.read(
                data,
                {type:"array"}
            );

        const sheet =
            workbook.Sheets[
                workbook.SheetNames[0]
            ];

        const rows =
            XLSX.utils.sheet_to_json(
                sheet,
                {
                    defval:"",
                    raw:false
                }
            );

        if(!rows.length){

            showSalesCsvMessage(
                "The CSV file is empty.",
                false
            );

            return;
        }

        const imeiColumn =
            Object.keys(rows[0])
            .find(
                key =>
                    String(key)
                    .trim()
                    .toLowerCase() ===
                    "imei"
            );

        if(!imeiColumn){

            showSalesCsvMessage(
                'Could not find a column named "IMEI".',
                false
            );

            return;
        }

        const csvImeis = rows
            .map(row => cleanImei(row[imeiColumn]));
        const uniqueImeis = [
            ...new Set(csvImeis.filter(isValidImei))
        ];
        const invalid = csvImeis
            .filter(imei => imei && !isValidImei(imei))
            .length;

        let added = 0;
        let duplicates = 0;

        uniqueImeis.forEach(
            imei => {

                if(
                    matchImeis.includes(
                        imei
                    )
                ){
                    duplicates++;
                }
                else{
                    matchImeis.push(
                        imei
                    );
                    added++;
                }
            }
        );

        renderMatchPage();

        showSalesCsvMessage(
            `${uniqueImeis.length} valid IMEI(s) read. ${added} added, ${duplicates} already in the list, ${invalid} invalid value(s) skipped.`,
            added > 0
        );

        salesCsvInput.value = "";
        matchScanInput.focus();

    }catch(error){

        console.error(error);

        showSalesCsvMessage(
            "Unable to read this CSV file.",
            false
        );
    }
}


uploadSalesCsvBtn.addEventListener(
    "click",
    loadSalesCsv
);


/* MATCH TABS */

document
.querySelectorAll("[data-match-tab]")
.forEach(button => {

    button.addEventListener(
        "click",
        () => {

            const target =
                button.dataset.matchTab;

            document
                .querySelectorAll("[data-match-tab]")
                .forEach(btn =>
                    btn.classList.remove("active")
                );

            document
                .querySelectorAll(".tab-panel")
                .forEach(panel =>
                    panel.classList.remove("active")
                );

            button.classList.add("active");

            if(target === "single"){
                document
                    .getElementById("singleTab")
                    .classList
                    .add("active");
            }
            else{
                document
                    .getElementById("bulkTab")
                    .classList
                    .add("active");
            }
        }
    );
});


/* =====================================================
   DUBAI SHIPMENT / SCANNING
===================================================== */
let currentShipment=null;
let dubaiScans=[];
let dubaiRealtimeChannel=null;
let shipmentRealtimeChannel=null;
let dubaiReady=false;

const dubaiShipmentName=document.getElementById("dubaiShipmentName");
const dubaiTotal=document.getElementById("dubaiTotal");
const dubaiLatest=document.getElementById("dubaiLatest");
const dubaiScanInput=document.getElementById("dubaiScanInput");
const dubaiScannerHelp=document.getElementById("dubaiScannerHelp");
const dubaiResult=document.getElementById("dubaiResult");
const dubaiTableBody=document.getElementById("dubaiTableBody");
const dubaiEmpty=document.getElementById("dubaiEmpty");
const dubaiLiveStatus=document.getElementById("dubaiLiveStatus");
const copyDubaiBtn=document.getElementById("copyDubaiBtn");
const exportDubaiCsvBtn=document.getElementById("exportDubaiCsvBtn");
const exportDubaiXlsxBtn=document.getElementById("exportDubaiXlsxBtn");
const undoDubaiBtn=document.getElementById("undoDubaiBtn");
const closeShipmentBtn=document.getElementById("closeShipmentBtn");
const newShipmentBtn=document.getElementById("newShipmentBtn");
const dubaiFilterInput=document.getElementById("dubaiFilterInput");
const dubaiVisibleCount=document.getElementById("dubaiVisibleCount");
const globalConnection=document.getElementById("globalConnection");

function updateGlobalConnection(text,state){
    globalConnection.className=`connection-pill ${state||""}`;
    globalConnection.lastElementChild.textContent=text;
}

updateGlobalConnection(db?(navigator.onLine?"Connected":"Offline"):"Not configured",db&&navigator.onLine?"online":"offline");
window.addEventListener("online",()=>updateGlobalConnection(db?"Connected":"Not configured",db?"online":"offline"));
window.addEventListener("offline",()=>updateGlobalConnection("Offline","offline"));

async function initializeDubai(){
    if(!db){ setDubaiStatus("Supabase Not Connected","error"); showDubaiResult("Add your Supabase URL and publishable key in config.js","error"); return; }
    if(!dubaiReady){ dubaiReady=true; await loadCurrentShipment(true); subscribeDubaiRealtime(); subscribeShipmentRealtime(); }
    else await loadCurrentShipment(false);
}

async function loadCurrentShipment(createIfMissing){
    const {data,error}=await db.from("shipments").select("*").eq("status","open").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(error){ console.error(error); setDubaiStatus("Connection Error","error"); return; }
    if(data){ currentShipment=data; await loadDubaiScans(); updateShipmentUI(); return; }
    if(createIfMissing){ await createNewShipment(); return; }
    currentShipment=null; dubaiScans=[]; renderDubaiScans(); updateShipmentUI();
}

async function createNewShipment(){
    if(!db) return;
    const {data,error}=await db.from("shipments").insert({name:makeShipmentName(),status:"open"}).select().single();
    if(error){ console.error(error); showDubaiResult("✕ Unable to Start Shipment","error"); return; }
    currentShipment=data; dubaiScans=[]; renderDubaiScans(); updateShipmentUI(); showDubaiResult("✓ New Shipment Started","success"); await refreshDashboard(); dubaiScanInput.focus();
}

async function loadDubaiScans(){
    if(!db||!currentShipment){ dubaiScans=[]; renderDubaiScans(); return; }
    const {data,error}=await db.from("dubai_scans").select("imei,created_at,shipment_id").eq("shipment_id",currentShipment.id).order("created_at",{ascending:false});
    if(error){ console.error(error); setDubaiStatus("Connection Error","error"); return; }
    dubaiScans=data||[]; renderDubaiScans();
}

function renderDubaiScans(){
    const filter=cleanImei(dubaiFilterInput.value);
    const visibleScans=filter?dubaiScans.filter(scan=>scan.imei.includes(filter)):dubaiScans;
    dubaiTableBody.innerHTML=""; dubaiTotal.textContent=dubaiScans.length; dubaiLatest.textContent=dubaiScans.length?dubaiScans[0].imei:"—"; dubaiEmpty.textContent=dubaiScans.length?"No IMEIs match this filter.":"No IMEIs scanned yet."; dubaiEmpty.style.display=visibleScans.length?"none":"block";
    dubaiVisibleCount.textContent=`${visibleScans.length} of ${dubaiScans.length} records`;
    visibleScans.forEach(scan=>{ const row=document.createElement("tr"); const imeiCell=document.createElement("td"); const timeCell=document.createElement("td"); imeiCell.textContent=scan.imei; timeCell.textContent=formatDateTime(scan.created_at); row.append(imeiCell,timeCell); dubaiTableBody.appendChild(row); });
    undoDubaiBtn.disabled=dubaiScans.length===0||!currentShipment||currentShipment.status!=="open";
}

dubaiFilterInput.addEventListener("input",renderDubaiScans);

function updateShipmentUI(){
    const isOpen=currentShipment&&currentShipment.status==="open";
    dubaiShipmentName.textContent=currentShipment?currentShipment.name:"No Open Shipment";
    dubaiScanInput.disabled=!isOpen;
    closeShipmentBtn.classList.toggle("hidden",!isOpen);
    newShipmentBtn.classList.toggle("hidden",isOpen);
    if(isOpen){ dubaiScannerHelp.textContent="Scan or enter an IMEI and press Enter"; setDubaiStatus("Live","connected"); }
    else{ dubaiScannerHelp.textContent="This shipment is closed. Start a new shipment to scan."; setDubaiStatus("Shipment Closed","closed"); }
    renderDubaiScans();
}

function showDubaiResult(message,type){
    dubaiResult.textContent=message; dubaiResult.className="scan-result";
    dubaiResult.classList.add(type==="success"?"result-success":type==="duplicate"?"result-duplicate":"result-error");
}
function setDubaiStatus(text,type){
    dubaiLiveStatus.className="live-status"; dubaiLiveStatus.innerHTML='<span class="live-dot"></span>'+text;
    if(type==="connected") dubaiLiveStatus.classList.add("connected");
    if(type==="closed") dubaiLiveStatus.classList.add("closed");
    if(type==="error") dubaiLiveStatus.classList.add("error");
    updateGlobalConnection(type==="connected"?"Live":type==="error"?"Offline":text,type==="connected"?"online":type==="error"?"offline":"");
}

async function saveDubaiScan(){
    const imei=cleanImei(dubaiScanInput.value); dubaiScanInput.value=""; dubaiScanInput.focus(); if(!imei) return;
    const validationMessage=imeiValidationMessage(imei);
    if(validationMessage){ showDubaiResult(validationMessage,"error"); beep("error"); return; }
    if(!db){ showDubaiResult("Supabase is not connected.","error"); beep("error"); return; }
    if(!currentShipment||currentShipment.status!=="open"){ showDubaiResult("✕ Shipment Is Closed","error"); beep("error"); return; }
    const {data,error}=await db.from("dubai_scans").insert({imei,shipment_id:currentShipment.id}).select().single();
    if(error){
        const duplicate=error.code==="23505"||String(error.message).toLowerCase().includes("duplicate");
        if(duplicate){
            const {data:existing}=await db.from("dubai_scans").select("created_at,shipments(name)").eq("imei",imei).maybeSingle();
            const shipmentName=existing&&existing.shipments?existing.shipments.name:"another shipment";
            const scannedTime=existing&&existing.created_at?` on ${formatDateTime(existing.created_at)}`:"";
            showDubaiResult(`⚠ Already scanned in ${shipmentName}${scannedTime}`,"duplicate"); beep("duplicate"); return;
        }
        console.error(error); showDubaiResult("✕ Unable to Save IMEI","error"); beep("error"); return;
    }
    showDubaiResult("✓ IMEI Saved","success"); beep("success");
    if(!dubaiScans.some(scan=>scan.imei===data.imei)){ dubaiScans.unshift(data); renderDubaiScans(); }
    refreshDashboard();
}

dubaiScanInput.addEventListener("keydown",event=>{ if(event.key==="Enter"){ event.preventDefault(); saveDubaiScan(); } });

async function undoLastDubaiScan(){
    if(!db||!currentShipment||currentShipment.status!=="open"||dubaiScans.length===0) return;
    const latest=dubaiScans[0];
    if(!confirm(`Undo the last scan?\n\n${latest.imei}`)) return;
    const {error}=await db.from("dubai_scans").delete().eq("imei",latest.imei).eq("shipment_id",currentShipment.id);
    if(error){ console.error(error); showDubaiResult("✕ Unable to Undo Scan","error"); return; }
    dubaiScans=dubaiScans.filter(scan=>scan.imei!==latest.imei); renderDubaiScans(); showDubaiResult("✓ Last Scan Removed","success"); refreshDashboard();
}

async function closeCurrentShipment(){
    if(!db||!currentShipment||currentShipment.status!=="open") return;
    if(!confirm(`Close this shipment?\n\n${currentShipment.name}\n\nAfter closing, no more IMEIs can be scanned into it.`)) return;
    const {data,error}=await db.from("shipments").update({status:"closed",closed_at:new Date().toISOString()}).eq("id",currentShipment.id).select().single();
    if(error){ console.error(error); showDubaiResult("✕ Unable to Close Shipment","error"); return; }
    currentShipment=data; updateShipmentUI(); showDubaiResult("✓ Shipment Closed","success"); refreshDashboard();
}

undoDubaiBtn.addEventListener("click",undoLastDubaiScan);
closeShipmentBtn.addEventListener("click",closeCurrentShipment);
newShipmentBtn.addEventListener("click",async()=>{ if(confirm("Start a new Dubai shipment?")) await createNewShipment(); });

function subscribeDubaiRealtime(){
    if(!db||dubaiRealtimeChannel) return;
    dubaiRealtimeChannel=db.channel("dubai-imei-live-v2")
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"dubai_scans"},payload=>{ const newScan=payload.new; if(currentShipment&&newScan.shipment_id===currentShipment.id&&!dubaiScans.some(scan=>scan.imei===newScan.imei)){ dubaiScans.unshift(newScan); renderDubaiScans(); } refreshDashboard(); })
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"dubai_scans"},()=>{ if(currentShipment) loadDubaiScans(); refreshDashboard(); })
      .subscribe(status=>{ if(status==="SUBSCRIBED"&&currentShipment&&currentShipment.status==="open") setDubaiStatus("Live","connected"); if(status==="CHANNEL_ERROR"||status==="TIMED_OUT") setDubaiStatus("Connection Error","error"); });
}
function subscribeShipmentRealtime(){
    if(!db||shipmentRealtimeChannel) return;
    shipmentRealtimeChannel=db.channel("dubai-shipments-live").on("postgres_changes",{event:"*",schema:"public",table:"shipments"},async()=>{ await loadCurrentShipment(false); await refreshDashboard(); }).subscribe();
}

copyDubaiBtn.addEventListener("click",async()=>{
    if(!dubaiScans.length){ showDubaiResult("No IMEIs to Copy","error"); return; }
    const text=["IMEI",...dubaiScans.map(scan=>scan.imei)].join("\n");
    try{ await navigator.clipboard.writeText(text); showDubaiResult("✓ IMEIs Copied","success"); } catch(error){ showDubaiResult("✕ Unable to Copy IMEIs","error"); }
});
exportDubaiCsvBtn.addEventListener("click",()=>{
    const rows=[["IMEI","Scanned At"],...dubaiScans.map(scan=>[scan.imei,formatDateTime(scan.created_at)])];
    const csv=rows.map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(",")).join("\n");
    downloadTextFile(csv,"dubai_imei_scans.csv","text/csv;charset=utf-8;");
});
exportDubaiXlsxBtn.addEventListener("click",()=>{
    const worksheet=XLSX.utils.aoa_to_sheet([["IMEI","Scanned At"],...dubaiScans.map(scan=>[scan.imei,formatDateTime(scan.created_at)])]);
    worksheet["!cols"]=[{wch:20},{wch:24}];
    const workbook=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook,worksheet,"IMEI"); XLSX.writeFile(workbook,"dubai_imei_scans.xlsx");
});

/* SEARCH */
const searchImeiInput=document.getElementById("searchImeiInput");
const searchImeiBtn=document.getElementById("searchImeiBtn");
const searchResultCard=document.getElementById("searchResultCard");
const recentSearches=document.getElementById("recentSearches");
const recentSearchChips=document.getElementById("recentSearchChips");
const clearRecentSearchesBtn=document.getElementById("clearRecentSearchesBtn");
const SEARCH_HISTORY_KEY="imei-recent-searches-v1";

function getRecentSearches(){
    try{return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY))||[];}catch(error){return [];}
}

function renderRecentSearches(){
    const searches=getRecentSearches();
    recentSearches.classList.toggle("hidden",searches.length===0);
    recentSearchChips.innerHTML="";
    searches.forEach(imei=>{
        const button=document.createElement("button");
        button.className="recent-search-chip"; button.type="button"; button.textContent=imei;
        button.addEventListener("click",()=>{ searchImeiInput.value=imei; searchImei(); });
        recentSearchChips.appendChild(button);
    });
}

function rememberSearch(imei){
    const searches=[imei,...getRecentSearches().filter(item=>item!==imei)].slice(0,6);
    localStorage.setItem(SEARCH_HISTORY_KEY,JSON.stringify(searches));
    renderRecentSearches();
}

clearRecentSearchesBtn.addEventListener("click",()=>{localStorage.removeItem(SEARCH_HISTORY_KEY);renderRecentSearches();});
renderRecentSearches();

async function searchImei(){
    const imei=cleanImei(searchImeiInput.value); if(!imei) return;
    const validationMessage=imeiValidationMessage(imei);
    if(validationMessage){ renderSearchError(validationMessage); return; }
    rememberSearch(imei);
    if(!db){ renderSearchError("Supabase is not connected."); return; }
    searchResultCard.className="search-result-card"; searchResultCard.innerHTML='<div class="search-result-title">Searching...</div>';
    const {data,error}=await db.from("dubai_scans").select('imei,created_at,shipment_id,shipments(id,name,status,created_at,closed_at)').eq("imei",imei).maybeSingle();
    if(error){ console.error(error); renderSearchError("Unable to search this IMEI."); return; }
    if(!data){ searchResultCard.className="search-result-card not-found"; searchResultCard.innerHTML=`<div class="search-result-title">✕ IMEI Not Found</div><div class="search-detail"><strong>IMEI</strong><span>${escapeHtml(imei)}</span></div>`; return; }
    const shipment=data.shipments||{};
    searchResultCard.className="search-result-card found";
    searchResultCard.innerHTML=`<div class="search-result-title">✓ IMEI Found</div><div class="search-detail"><strong>IMEI</strong><span>${escapeHtml(data.imei)}</span><strong>Shipment</strong><span>${escapeHtml(shipment.name||"—")}</span><strong>Status</strong><span>${escapeHtml(shipment.status||"—")}</span><strong>Scanned</strong><span>${escapeHtml(formatDateTime(data.created_at))}</span></div>`;
}
function renderSearchError(message){ searchResultCard.className="search-result-card not-found"; searchResultCard.innerHTML=`<div class="search-result-title">✕ ${escapeHtml(message)}</div>`; }
searchImeiBtn.addEventListener("click",searchImei);
searchImeiInput.addEventListener("keydown",event=>{ if(event.key==="Enter"){ event.preventDefault(); searchImei(); } });

/* DASHBOARD */
const dashShipmentName=document.getElementById("dashShipmentName");
const dashShipmentCount=document.getElementById("dashShipmentCount");
const dashTodayCount=document.getElementById("dashTodayCount");
const dashShipmentStatus=document.getElementById("dashShipmentStatus");
const dashShipmentMeta=document.getElementById("dashShipmentMeta");
const recentShipmentsBody=document.getElementById("recentShipmentsBody");
const recentShipmentsEmpty=document.getElementById("recentShipmentsEmpty");
const weeklyChart=document.getElementById("weeklyChart");
const weeklyTotalBadge=document.getElementById("weeklyTotalBadge");

function localDateKey(date){
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function renderWeeklyActivity(scans){
    const days=[];
    for(let offset=6;offset>=0;offset--){
        const date=new Date(); date.setHours(0,0,0,0); date.setDate(date.getDate()-offset);
        days.push({date,key:localDateKey(date),count:0});
    }
    scans.forEach(scan=>{
        const day=days.find(item=>item.key===localDateKey(new Date(scan.created_at)));
        if(day) day.count++;
    });
    const maximum=Math.max(1,...days.map(day=>day.count));
    const total=days.reduce((sum,day)=>sum+day.count,0);
    weeklyTotalBadge.textContent=`${total} scan${total===1?"":"s"}`;
    weeklyChart.innerHTML="";
    days.forEach((day,index)=>{
        const item=document.createElement("div"); item.className=`chart-day${index===6?" today":""}`;
        const value=document.createElement("span"); value.className="chart-value"; value.textContent=day.count;
        const track=document.createElement("div"); track.className="chart-track";
        const bar=document.createElement("div"); bar.className="chart-bar"; bar.style.height=`${Math.max(3,(day.count/maximum)*100)}%`; track.appendChild(bar);
        const label=document.createElement("span"); label.className="chart-label"; label.textContent=index===6?"Today":day.date.toLocaleDateString(undefined,{weekday:"short"});
        item.append(value,track,label); weeklyChart.appendChild(item);
    });
}

async function refreshDashboard(){
    if(!db){ dashShipmentName.textContent="Supabase Not Connected"; dashShipmentCount.textContent="0"; dashTodayCount.textContent="0"; renderWeeklyActivity([]); setDashboardStatus("Not Connected","error"); return; }
    const {data:openShipment}=await db.from("shipments").select("*").eq("status","open").order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(openShipment){
        const {count}=await db.from("dubai_scans").select("*",{count:"exact",head:true}).eq("shipment_id",openShipment.id);
        dashShipmentName.textContent=openShipment.name; dashShipmentCount.textContent=count||0; dashShipmentMeta.textContent=`Started ${formatDateTime(openShipment.created_at)}`; setDashboardStatus("Open","connected");
    }else{ dashShipmentName.textContent="No Open Shipment"; dashShipmentCount.textContent="0"; dashShipmentMeta.textContent="Start a new shipment from Dubai Scan."; setDashboardStatus("Closed","closed"); }
    const startOfDay=new Date(); startOfDay.setHours(0,0,0,0);
    const {count:todayCount}=await db.from("dubai_scans").select("*",{count:"exact",head:true}).gte("created_at",startOfDay.toISOString());
    dashTodayCount.textContent=todayCount||0;
    const weekStart=new Date(); weekStart.setHours(0,0,0,0); weekStart.setDate(weekStart.getDate()-6);
    const {data:weeklyScans,error:weeklyError}=await db.from("dubai_scans").select("created_at").gte("created_at",weekStart.toISOString());
    if(weeklyError) console.error(weeklyError);
    renderWeeklyActivity(weeklyScans||[]);
    await loadRecentShipments();
}
function setDashboardStatus(text,type){ dashShipmentStatus.className="live-status"; dashShipmentStatus.innerHTML='<span class="live-dot"></span>'+text; if(type==="connected") dashShipmentStatus.classList.add("connected"); if(type==="closed") dashShipmentStatus.classList.add("closed"); if(type==="error") dashShipmentStatus.classList.add("error"); }
async function loadRecentShipments(){
    const {data,error}=await db.from("shipments").select('id,name,status,created_at,closed_at,dubai_scans(count)').order("created_at",{ascending:false}).limit(5);
    if(error){ console.error(error); return; }
    const shipments=data||[]; recentShipmentsBody.innerHTML=""; recentShipmentsEmpty.style.display=shipments.length?"none":"block";
    shipments.forEach(shipment=>{ const row=document.createElement("tr"); const count=Array.isArray(shipment.dubai_scans)&&shipment.dubai_scans.length?shipment.dubai_scans[0].count:0; row.innerHTML=`<td>${escapeHtml(shipment.name)}</td><td>${escapeHtml(shipment.status)}</td><td>${count||0}</td><td>${escapeHtml(formatDateTime(shipment.created_at))}</td>`; recentShipmentsBody.appendChild(row); });
}

/* DOWNLOAD HELPER */
function downloadTextFile(text,filename,type){ const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const anchor=document.createElement("a"); anchor.href=url; anchor.download=filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); }

/* KEYBOARD PRODUCTIVITY */
document.addEventListener("keydown",event=>{
    const target=event.target;
    const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target.isContentEditable;

    if(event.key==="/"&&!typing){
        let activeInput=document.querySelector(".page.active .scan-input:not(:disabled)");
        if(!activeInput&&document.getElementById("dashboardPage").classList.contains("active")){
            showPage("dubaiPage");
            activeInput=dubaiScanInput;
        }
        if(activeInput){event.preventDefault();activeInput.focus();activeInput.select();}
    }

    if(event.key==="Escape"&&typing){
        target.value="";
        if(target===dubaiFilterInput) renderDubaiScans();
        target.blur();
    }
});

/* START */
loadMatchData();
renderMatchPage();
if(db){ initializeDubai(); refreshDashboard(); } else { refreshDashboard(); }
