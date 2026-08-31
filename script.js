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

const SUPABASE_URL = "https://bharypgmukejhzqverhd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoYXJ5cGdtdWtlamh6cXZlcmhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5NDI2ODgsImV4cCI6MjEwMzUxODY4OH0.0HkUrr4AB0BU65z1UYaDMt5JyZMBgq7Vyg-GO0nau2s";

let db = null;

if(
    window.supabase &&
    SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
    SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY"
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
    matchPage:{
        title:"IMEI Match",
        subtitle:"Verify IMEIs against your saved list"
    },

    dubaiPage:{
        title:"Dubai Scan",
        subtitle:"Shared IMEI scanning from multiple computers"
    }
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


    if(pageId === "matchPage"){
        matchScanInput.focus();
    }

    if(pageId === "dubaiPage"){
        dubaiScanInput.focus();

        if(!dubaiInitialized){
            initializeDubai();
        }
    }
}


/* =====================================================
   HELPERS
===================================================== */

function cleanImei(value){

    return String(value)
        .trim()
        .replace(/\D/g,"");
}


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
        .map(cleanImei)
        .filter(Boolean);

    let added = 0;
    let duplicates = 0;

    values.forEach(imei => {

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
        `${added} IMEI(s) added. ${duplicates} duplicate(s) skipped.`,
        true
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
   DUBAI SCAN PAGE
===================================================== */

let dubaiScans = [];
let dubaiInitialized = false;
let dubaiRealtimeChannel = null;

const dubaiTotal =
    document.getElementById("dubaiTotal");

const dubaiLatest =
    document.getElementById("dubaiLatest");

const dubaiScanInput =
    document.getElementById("dubaiScanInput");

const dubaiResult =
    document.getElementById("dubaiResult");

const dubaiTableBody =
    document.getElementById("dubaiTableBody");

const dubaiEmpty =
    document.getElementById("dubaiEmpty");

const dubaiLiveStatus =
    document.getElementById("dubaiLiveStatus");

const exportDubaiCsvBtn =
    document.getElementById("exportDubaiCsvBtn");

const exportDubaiXlsxBtn =
    document.getElementById("exportDubaiXlsxBtn");


async function initializeDubai(){

    dubaiInitialized = true;

    if(!db){

        setDubaiStatus(
            "Supabase Not Connected",
            "error"
        );

        showDubaiResult(
            "Add your Supabase URL and anon key in script.js",
            "error"
        );

        return;
    }

    await loadDubaiScans();

    subscribeDubaiRealtime();
}


async function loadDubaiScans(){

    const { data, error } =
        await db
        .from("dubai_scans")
        .select("imei,created_at")
        .order(
            "created_at",
            {ascending:false}
        );

    if(error){

        console.error(error);

        setDubaiStatus(
            "Connection Error",
            "error"
        );

        return;
    }

    dubaiScans =
        data || [];

    renderDubaiScans();
}


function renderDubaiScans(){

    dubaiTableBody.innerHTML = "";

    dubaiTotal.textContent =
        dubaiScans.length;

    dubaiLatest.textContent =
        dubaiScans.length
        ? dubaiScans[0].imei
        : "—";

    dubaiEmpty.style.display =
        dubaiScans.length
        ? "none"
        : "block";

    dubaiScans.forEach(scan => {

        const row =
            document.createElement("tr");

        const cell =
            document.createElement("td");

        cell.textContent =
            scan.imei;

        row.appendChild(cell);

        dubaiTableBody.appendChild(row);
    });
}


function showDubaiResult(
    message,
    type
){

    dubaiResult.textContent =
        message;

    dubaiResult.className =
        "scan-result";

    if(type === "success"){
        dubaiResult.classList.add(
            "result-success"
        );
    }
    else if(type === "duplicate"){
        dubaiResult.classList.add(
            "result-duplicate"
        );
    }
    else{
        dubaiResult.classList.add(
            "result-error"
        );
    }
}


function setDubaiStatus(
    text,
    type
){

    dubaiLiveStatus.className =
        "live-status";

    dubaiLiveStatus.innerHTML =
        '<span class="live-dot"></span>' +
        text;

    if(type === "connected"){
        dubaiLiveStatus.classList.add(
            "connected"
        );
    }

    if(type === "error"){
        dubaiLiveStatus.classList.add(
            "error"
        );
    }
}


async function saveDubaiScan(){

    const imei =
        cleanImei(
            dubaiScanInput.value
        );

    dubaiScanInput.value = "";
    dubaiScanInput.focus();

    if(!imei){
        return;
    }

    if(!db){

        showDubaiResult(
            "Supabase is not connected.",
            "error"
        );

        beep("error");

        return;
    }

    const { data, error } =
        await db
        .from("dubai_scans")
        .insert({
            imei
        })
        .select()
        .single();

    if(error){

        const duplicate =
            error.code === "23505" ||
            String(error.message)
            .toLowerCase()
            .includes("duplicate");

        if(duplicate){

            showDubaiResult(
                "⚠ IMEI Already Scanned",
                "duplicate"
            );

            beep("duplicate");

            return;
        }

        console.error(error);

        showDubaiResult(
            "✕ Unable to Save IMEI",
            "error"
        );

        beep("error");

        return;
    }

    showDubaiResult(
        "✓ IMEI Saved",
        "success"
    );

    beep("success");

    /*
    Realtime normally inserts this row into the UI.
    This fallback keeps the scanning computer responsive
    even if the realtime event arrives slightly later.
    */

    if(
        !dubaiScans.some(
            scan =>
                scan.imei === data.imei
        )
    ){
        dubaiScans.unshift(data);

        renderDubaiScans();
    }
}


dubaiScanInput.addEventListener(
    "keydown",
    event => {

        if(event.key !== "Enter"){
            return;
        }

        event.preventDefault();

        saveDubaiScan();
    }
);


function subscribeDubaiRealtime(){

    if(
        !db ||
        dubaiRealtimeChannel
    ){
        return;
    }

    dubaiRealtimeChannel =
        db
        .channel("dubai-imei-live")
        .on(
            "postgres_changes",
            {
                event:"INSERT",
                schema:"public",
                table:"dubai_scans"
            },
            payload => {

                const newScan =
                    payload.new;

                if(
                    !dubaiScans.some(
                        scan =>
                            scan.imei ===
                            newScan.imei
                    )
                ){
                    dubaiScans.unshift(
                        newScan
                    );

                    renderDubaiScans();
                }
            }
        )
        .subscribe(status => {

            if(status === "SUBSCRIBED"){

                setDubaiStatus(
                    "Live",
                    "connected"
                );
            }

            if(
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT"
            ){

                setDubaiStatus(
                    "Connection Error",
                    "error"
                );
            }
        });
}


/* DUBAI EXPORT CSV */

exportDubaiCsvBtn.addEventListener(
    "click",
    () => {

        /*
        First row is exactly:
        IMEI
        */

        const rows = [
            ["IMEI"],
            ...dubaiScans.map(
                scan => [scan.imei]
            )
        ];

        const csv =
            rows
            .map(row =>
                row
                .map(value =>
                    `"${String(value)
                    .replace(/"/g,'""')}"`
                )
                .join(",")
            )
            .join("\n");

        downloadTextFile(
            csv,
            "dubai_imei_scans.csv",
            "text/csv;charset=utf-8;"
        );
    }
);


/* DUBAI EXPORT XLSX */

exportDubaiXlsxBtn.addEventListener(
    "click",
    () => {

        const worksheet =
            XLSX.utils.aoa_to_sheet([
                ["IMEI"],
                ...dubaiScans.map(
                    scan => [scan.imei]
                )
            ]);

        const workbook =
            XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "IMEI"
        );

        XLSX.writeFile(
            workbook,
            "dubai_imei_scans.xlsx"
        );
    }
);


/* =====================================================
   DOWNLOAD HELPER
===================================================== */

function downloadTextFile(
    text,
    filename,
    type
){

    const blob =
        new Blob(
            [text],
            {type}
        );

    const url =
        URL.createObjectURL(blob);

    const anchor =
        document.createElement("a");

    anchor.href = url;
    anchor.download = filename;

    document.body.appendChild(anchor);

    anchor.click();

    anchor.remove();

    URL.revokeObjectURL(url);
}


/* =====================================================
   START
===================================================== */

loadMatchData();

renderMatchPage();

matchScanInput.focus();
