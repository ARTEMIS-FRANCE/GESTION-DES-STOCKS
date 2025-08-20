// ARTEMIS • Gestion des stocks — App front (GitHub Pages ready)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { 
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, 
  query, where, orderBy, limit, Timestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase config (fourni)
const firebaseConfig = {
  apiKey: "AIzaSyAH29rfTBpssIurraLagSnE-a1nHRpfVOw",
  authDomain: "gestion-des-stocks-8e1b9.firebaseapp.com",
  projectId: "gestion-des-stocks-8e1b9",
  storageBucket: "gestion-des-stocks-8e1b9.firebasestorage.app",
  messagingSenderId: "217955911455",
  appId: "1:217955911455:web:3120485f9bd8cadb29122a",
  measurementId: "G-VHH73188FZ"
};

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (e) { /* optional on GH Pages */ }
const db = getFirestore(app);

// Utils
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const delay = (ms) => new Promise(r => setTimeout(r, ms));
function fmtMoney(v) { return (v ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }); }
function todayISO() { return new Date().toISOString().slice(0,10); }
async function sha256(str) { const enc = new TextEncoder().encode(str); const buf = await crypto.subtle.digest("SHA-256", enc); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); }

const DEFAULT_AGENCIES = ["DEPOT","HAUT DE FRANCE","IDF","GRAND EST","RHONE ALPES","PACA","OCCITANIE","NOUVELLE AQUITAINE","AUTRE"];

// Session
let SESSION = null;
function saveSession(){ localStorage.setItem("gs_session", JSON.stringify(SESSION)); }
function loadSession(){ try { SESSION = JSON.parse(localStorage.getItem("gs_session")); } catch(e){ SESSION=null; } }
function clearSession(){ localStorage.removeItem("gs_session"); SESSION=null; }

// Seed (users & agencies)
async function seedIfEmpty() {
  const uSnap = await getDocs(query(collection(db,"users"), limit(1)));
  if (uSnap.empty) {
    await addDoc(collection(db,"users"), { login:"admin", passHash: await sha256("admin"), role:"admin", agency:null });
    await addDoc(collection(db,"users"), { login:"demo", passHash: await sha256("demo"), role:"agence", agency:"IDF" });
  }
  const aSnap = await getDocs(query(collection(db,"agencies"), limit(1)));
  if (aSnap.empty) {
    for (const name of DEFAULT_AGENCIES) await addDoc(collection(db,"agencies"), { name });
  }
}

// Auth
async function login(login, password) {
  const snap = await getDocs(query(collection(db,"users"), where("login","==",login)));
  if (snap.empty) return null;
  const u = snap.docs[0].data();
  if (u.passHash !== await sha256(password)) return null;
  SESSION = { id:snap.docs[0].id, login:u.login, role:u.role, agency: u.agency || DEFAULT_AGENCIES[0] };
  saveSession(); return SESSION;
}

// Agencies
async function listAgencies(){ const s=await getDocs(collection(db,"agencies")); return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.name.localeCompare(b.name)); }
async function addAgency(name){ return await addDoc(collection(db,"agencies"), {name}); }
// Users
async function listUsers(){ const s=await getDocs(collection(db,"users")); return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.login.localeCompare(b.login)); }
async function upsertUser({login,password,role,agency}){
  const s=await getDocs(query(collection(db,"users"), where("login","==",login)));
  const passHash = password ? await sha256(password) : null;
  if (s.empty) return await addDoc(collection(db,"users"), {login, passHash: passHash || await sha256("changeme"), role, agency: role==='admin'? null : agency});
  const ref = s.docs[0].ref; const data = { role, agency: role==='admin'? null : agency }; if (passHash) data.passHash = passHash; return await updateDoc(ref, data);
}
async function deleteUser(login){
  const s=await getDocs(query(collection(db,"users"), where("login","==",login)));
  for (const d of s.docs){ await deleteDoc(d.ref); }
}

// Products
async function listProducts(){ const s=await getDocs(collection(db,"products")); return s.docs.map(d=>({id:d.id,...d.data()})); }
async function getProduct(id){ const s=await getDoc(doc(db,"products",id)); return {id:s.id,...s.data()}; }
async function saveProduct(p){ if (p.id){ const id=p.id; delete p.id; await updateDoc(doc(db,"products",id),p); return id; } else { const ref=await addDoc(collection(db,"products"),p); return ref.id; } }
async function deleteProduct(id){ await deleteDoc(doc(db,"products",id)); }

// Stock
async function adjustStock(productId, agencyName, size, deltaQty){
  const key = `${productId}|${agencyName}|${size||''}`;
  const ref = doc(db, "stock", key);
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref,{productId, agency:agencyName, size:size||"", qty: Math.max(deltaQty,0)});
  else await updateDoc(ref, { qty: Math.max((snap.data().qty||0)+deltaQty, 0) });
}
async function readStockForAgency(agencyName){
  const s=await getDocs(query(collection(db,"stock"), where("agency","==",agencyName)));
  const rows=s.docs.map(d=>({id:d.id,...d.data()}));
  const map=new Map();
  for (const r of rows){
    if (!map.has(r.productId)) map.set(r.productId, { productId:r.productId, sizes:{}, total:0 });
    const obj = map.get(r.productId); const sz=r.size||""; obj.sizes[sz]=(obj.sizes[sz]||0)+(r.qty||0); obj.total+=(r.qty||0);
  }
  return map;
}

// Movements
async function addMovement(mv){ await addDoc(collection(db,"movements"), mv); }
async function listMovements({agency, from, to}){
  const s = await getDocs(query(collection(db,"movements"), orderBy("ts","desc"), limit(500)));
  const rows = s.docs.map(d=>({id:d.id,...d.data()}));
  const fromMs = from ? new Date(from).getTime() : 0;
  const toMs   = to ? new Date(to).getTime()+86400000-1 : Date.now();
  return rows.filter(r=>{
    const t = r.ts?.toDate?.().getTime?.() ?? r.ts;
    const dateOk = t>=fromMs && t<=toMs;
    const agOk = (r.fromAgency===agency || r.toAgency===agency || (r.type!=='transfer' && (r.fromAgency===agency || r.toAgency===agency)));
    return dateOk && agOk;
  });
}

// Thresholds
function underThresholdForAgency(product, stockMapForProduct, agencyName){
  const seuilGlobal = product.seuilGlobal ?? 0;
  const st = { status:'ok', missing:{}, count:0 };
  const sizes = ["","XS","S","M","L","XL","XXL","3XL"];
  for (const size of sizes){
    const threshold = (product.seuilTaille?.[size] ?? (size?0:seuilGlobal)) || 0;
    if (threshold<=0) continue;
    const cur = (stockMapForProduct?.sizes?.[size] ?? 0);
    if (cur < threshold){
      const diff = threshold - cur;
      st.missing[size||"global"] = diff;
      st.count += diff;
      st.status = diff > threshold/2 ? 'bad' : 'warn';
    }
  }
  return st;
}

// UI helpers
function setActiveTab(name){ $$(".tab-btn").forEach(b=>b.classList.toggle("active", b.dataset.tab===name)); $$(".tab").forEach(s=>s.classList.toggle("active", s.id===`tab-${name}`)); }
function gateAdminVisibility(){ $$(".admin-only").forEach(el => el.style.display = (SESSION.role==="admin" ? "" : "none")); }

let PRODUCTS_CACHE = [];
let STOCK_CACHE = new Map();
async function ensureProductsCache(){ PRODUCTS_CACHE = await listProducts(); }
async function ensureStockCache(){ const ag=$("#agency-select").value; STOCK_CACHE = await readStockForAgency(ag); }

function renderTable(container, columns, rows){
  const html = [`<table><thead><tr>${columns.map(c=>`<th>${c.label}</th>`).join("")}</tr></thead><tbody>`];
  for (const r of rows){ html.push("<tr>"); for (const c of columns) html.push(`<td>${c.render? c.render(r) : (r[c.key]??"")}</td>`); html.push("</tr>"); }
  html.push("</tbody></table>"); container.innerHTML = html.join("");
}

async function refreshBadgeUnderThreshold(){
  await ensureStockCache();
  const ag=$("#agency-select").value;
  let count=0;
  for (const p of PRODUCTS_CACHE){
    const s = STOCK_CACHE.get(p.id);
    const st= underThresholdForAgency(p,s,ag);
    count += Object.values(st.missing).reduce((a,b)=>a+b,0);
  }
  $("#under-threshold-badge").textContent = count;
}

// Catalogue
async function renderCatalogue(){
  await ensureProductsCache(); await ensureStockCache();
  const q=$("#search").value.trim().toLowerCase();
  const cat=$("#category-filter").value;
  const onlyReassort=$("#filter-reassort").checked;
  const ag=$("#agency-select").value;
  const rows=[];
  for (const p of PRODUCTS_CACHE){
    if (q && ![p.reference,p.name,p.barcode].some(v=>String(v||"").toLowerCase().includes(q))) continue;
    if (cat && p.category!==cat) continue;
    const s = STOCK_CACHE.get(p.id);
    const qtyTotal = s?.total || 0;
    const st = underThresholdForAgency(p,s,ag);
    if (onlyReassort && st.count===0) continue;
    const dot = st.status==='bad' ? 'status-bad' : (st.status==='warn' ? 'status-warn' : 'status-ok');
    rows.push({
      ref:p.reference, name:p.name, cat:p.category, vendor:p.vendor||'',
      price: fmtMoney(p.price||0), stock: qtyTotal,
      status: `<span class="status-dot ${dot}" title="${st.count? 'Sous seuil' : 'OK'}"></span>`,
      actions:`<button class="btn" data-action="edit" data-id="${p.id}">Éditer</button>`
    });
  }
  renderTable($("#catalogue-table"), [
    {label:"",key:"status"},
    {label:"Référence",key:"ref"},
    {label:"Nom",key:"name"},
    {label:"Catégorie",key:"cat"},
    {label:"Prix achat",key:"price"},
    {label:"Revendeur",key:"vendor"},
    {label:"Stock (agence)",key:"stock"},
    {label:"Actions",key:"actions"}
  ], rows);
  $("#catalogue-table").querySelectorAll("[data-action='edit']").forEach(btn=>{
    btn.addEventListener("click", ()=> openProductEditor(btn.dataset.id));
  });
  await refreshBadgeUnderThreshold();
}

async function openProductEditor(id){
  const isAdmin = SESSION.role==="admin";
  $("#pm-delete").style.display = isAdmin ? "" : "none";
  let p={reference:"", name:"", category:"Uniformes", price:0, vendor:"", barcode:"", affectation:"", seuilGlobal:0, seuilTaille:{}};
  if (id) p = await getProduct(id);
  $("#pm-title").textContent = id ? `Produit • ${p.reference}` : "Nouveau produit";
  $("#pm-reference").value = p.reference||"";
  $("#pm-name").value = p.name||"";
  $("#pm-category").value = p.category||"Uniformes";
  $("#pm-price").value = p.price||0;
  $("#pm-vendor").value = p.vendor||"";
  $("#pm-barcode").value = p.barcode||"";
  $("#pm-affect").value = p.affectation||"";
  $("#pm-seuil").value = p.seuilGlobal||0;
  $("#pm-xs").value = p.seuilTaille?.XS||0;
  $("#pm-s").value  = p.seuilTaille?.S ||0;
  $("#pm-m").value  = p.seuilTaille?.M ||0;
  $("#pm-l").value  = p.seuilTaille?.L ||0;
  $("#pm-xl").value = p.seuilTaille?.XL||0;
  $("#pm-xxl").value= p.seuilTaille?.XXL||0;
  $("#pm-3xl").value= p.seuilTaille?.["3XL"]||0;

  $("#product-modal").classList.remove("hidden");
  $("#pm-save").onclick = async ()=>{
    const data = {
      reference: $("#pm-reference").value.trim(),
      name: $("#pm-name").value.trim(),
      category: $("#pm-category").value,
      price: parseFloat($("#pm-price").value||"0"),
      vendor: $("#pm-vendor").value.trim(),
      barcode: $("#pm-barcode").value.trim(),
      affectation: $("#pm-affect").value.trim(),
      seuilGlobal: parseInt($("#pm-seuil").value||"0"),
      seuilTaille: {
        XS: parseInt($("#pm-xs").value||"0"),
        S:  parseInt($("#pm-s").value||"0"),
        M:  parseInt($("#pm-m").value||"0"),
        L:  parseInt($("#pm-l").value||"0"),
        XL: parseInt($("#pm-xl").value||"0"),
        XXL:parseInt($("#pm-xxl").value||"0"),
        "3XL":parseInt($("#pm-3xl").value||"0"),
      }
    };
    if (!data.reference || !data.name){ alert("Référence et Nom sont obligatoires"); return; }
    if (id) data.id = id;
    await saveProduct(data);
    $("#product-modal").classList.add("hidden");
    await renderCatalogue();
  };
  $("#pm-cancel").onclick = ()=> $("#product-modal").classList.add("hidden");
  $("#pm-delete").onclick = async ()=>{
    if (!confirm("Supprimer ce produit ?")) return;
    await deleteProduct(id);
    $("#product-modal").classList.add("hidden");
    await renderCatalogue();
  };
}

// Movements UI
let MV_SELECTED_PRODUCT = null;
function hookMovementProductSearch(){
  const inp = $("#mv-product-search");
  const list = $("#mv-product-results");
  inp.addEventListener("input", ()=>{
    const q=inp.value.trim().toLowerCase(); list.innerHTML="";
    if (!q) return;
    const matches = PRODUCTS_CACHE.filter(p=>[p.reference,p.name,p.barcode].some(v=>String(v||"").toLowerCase().includes(q))).slice(0,10);
    for (const p of matches){
      const div = document.createElement("div");
      div.className="item";
      div.textContent = `${p.reference} — ${p.name}`;
      div.addEventListener("click", ()=>{ inp.value = `${p.reference} — ${p.name}`; MV_SELECTED_PRODUCT = p; list.innerHTML=""; });
      list.appendChild(div);
    }
  });
}
async function submitMovement(){
  const type = $("#mv-type").value;
  const size = $("#mv-size").value || "";
  const qty  = parseInt($("#mv-qty").value||"0");
  const fromA = $("#mv-from").value;
  const toA   = $("#mv-to").value;
  const p = MV_SELECTED_PRODUCT;
  if (!p){ alert("Sélectionnez un produit"); return; }
  if (!qty || qty<=0){ alert("Quantité invalide"); return; }
  if (type==="in"){
    await adjustStock(p.id, toA, size, qty);
    await addMovement({ type, productId:p.id, size, qty, fromAgency:null, toAgency:toA, userLogin:SESSION.login, ts: Timestamp.now() });
  } else if (type==="out"){
    await adjustStock(p.id, fromA, size, -qty);
    await addMovement({ type, productId:p.id, size, qty, fromAgency:fromA, toAgency:null, userLogin:SESSION.login, ts: Timestamp.now() });
  } else {
    await adjustStock(p.id, fromA, size, -qty);
    await adjustStock(p.id, toA, size, qty);
    await addMovement({ type, productId:p.id, size, qty, fromAgency:fromA, toAgency:toA, userLogin:SESSION.login, ts: Timestamp.now() });
  }
  MV_SELECTED_PRODUCT = null; $("#mv-product-search").value = "";
  await ensureStockCache(); await renderCatalogue(); await renderMovements();
}
async function renderMovements(){
  const agency = $("#agency-select").value;
  const rows = await listMovements({ agency, from: $("#mv-date-from").value, to: $("#mv-date-to").value });
  const enriched = [];
  for (const r of rows){
    const p = PRODUCTS_CACHE.find(x=>x.id===r.productId);
    enriched.push({ ts: r.ts?.toDate?.().toLocaleString?.("fr-FR") ?? new Date(r.ts).toLocaleString("fr-FR"), type:r.type, product: p? `${p.reference} — ${p.name}` : r.productId, size:r.size||"", qty:r.qty, from:r.fromAgency||"", to:r.toAgency||"" });
  }
  renderTable($("#mouvements-table"), [
    {label:"Date",key:"ts"},{label:"Type",key:"type"},{label:"Produit",key:"product"},{label:"Taille",key:"size"},{label:"Qté",key:"qty"},{label:"De",key:"from"},{label:"Vers",key:"to"}
  ], enriched);
}

// Stats
async function renderStats(){
  const agency = $("#agency-select").value;
  await ensureStockCache();
  const rows=[];
  let totalQty=0, totalVal=0, totalIn=0, totalOut=0;
  const from=$("#st-date-from").value, to=$("#st-date-to").value;
  const mvs = await listMovements({ agency, from, to });
  for (const mv of mvs){
    if (mv.type==="in" || (mv.type==="transfer" && mv.toAgency===agency)) totalIn += mv.qty;
    if (mv.type==="out" || (mv.type==="transfer" && mv.fromAgency===agency)) totalOut += mv.qty;
  }
  for (const p of PRODUCTS_CACHE){
    const s = STOCK_CACHE.get(p.id);
    const qty = s?.total || 0;
    const val = (p.price||0) * qty;
    totalQty += qty; totalVal += val;
    rows.push({ ref:p.reference, name:p.name, qty, price: fmtMoney(p.price||0), val: fmtMoney(val) });
  }
  $("#stats-summary").innerHTML = `
    <div class="card"><b>Agence</b><div>${agency}</div></div>
    <div class="card"><b>Quantité totale</b><div>${totalQty}</div></div>
    <div class="card"><b>Valorisation</b><div>${fmtMoney(totalVal)}</div></div>
    <div class="card"><b>Entrées (période)</b><div>${totalIn}</div></div>
    <div class="card"><b>Sorties (période)</b><div>${totalOut}</div></div>`;
  renderTable($("#stats-table"), [
    {label:"Référence",key:"ref"},{label:"Nom",key:"name"},{label:"Qté",key:"qty"},{label:"Prix achat",key:"price"},{label:"Valorisation",key:"val"}
  ], rows);
}

// Export
function exportToExcel(sheets){
  const wb = XLSX.utils.book_new();
  for (const {name, data, header} of sheets){
    const ws = XLSX.utils.json_to_sheet(data, { header });
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, `export_${Date.now()}.xlsx`);
}
async function exportProductsExcel(){
  const data = PRODUCTS_CACHE.map(p => ({
    Reference: p.reference, Nom:p.name, Categorie:p.category,
    PrixAchat:p.price, Vendeur:p.vendor, CodeBarres:p.barcode, Affectation:p.affectation,
    SeuilGlobal: p.seuilGlobal || 0,
    XS: p.seuilTaille?.XS||0, S:p.seuilTaille?.S||0, M:p.seuilTaille?.M||0, L:p.seuilTaille?.L||0,
    XL:p.seuilTaille?.XL||0, XXL:p.seuilTaille?.XXL||0, _3XL:p.seuilTaille?.["3XL"]||0
  }));
  exportToExcel([{ name:"Produits", data, header: Object.keys(data[0]||{Reference:"",Nom:""}) }]);
}
function exportProductsJSON(){
  const data = JSON.stringify(PRODUCTS_CACHE, null, 2);
  const blob = new Blob([data], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download="produits.json"; a.click();
}
async function exportMovementsExcel(){
  const agency = $("#agency-select").value;
  const rows = await listMovements({ agency, from: $("#st-date-from").value, to: $("#st-date-to").value });
  const data = rows.map(r => ({
    Date: r.ts?.toDate?.().toLocaleString?.("fr-FR") ?? new Date(r.ts).toLocaleString("fr-FR"),
    Type: r.type, ProduitId: r.productId, Taille: r.size||"", Qte: r.qty, De: r.fromAgency||"", Vers: r.toAgency||"", Utilisateur: r.userLogin
  }));
  exportToExcel([{ name:"Mouvements", data, header: Object.keys(data[0]||{Date:"",Type:""}) }]);
}

// Import
async function importProductsFromExcel(file){
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, {type:"array"});
  const ws = wb.Sheets["Produits"];
  if (!ws){ alert("Feuille 'Produits' manquante"); return; }
  const arr = XLSX.utils.sheet_to_json(ws);
  for (const r of arr){
    const p = {
      reference: r.Reference ?? "",
      name: r.Nom ?? "",
      category: r.Categorie ?? "Divers",
      price: Number(r.PrixAchat ?? 0),
      vendor: r.Vendeur ?? "",
      barcode: r.CodeBarres ?? "",
      affectation: r.Affectation ?? "",
      seuilGlobal: Number(r.SeuilGlobal ?? 0),
      seuilTaille: {
        XS: Number(r.XS ?? 0), S:Number(r.S ?? 0), M:Number(r.M ?? 0), L:Number(r.L ?? 0),
        XL: Number(r.XL ?? 0), XXL: Number(r.XXL ?? 0), "3XL": Number(r._3XL ?? 0),
      }
    };
    if (p.reference && p.name) await saveProduct(p);
  }
  await renderCatalogue(); alert("Import terminé");
}

// Réassort
async function proposeReassort(){
  const ag = $("#agency-select").value;
  await ensureStockCache();
  const lines = [];
  for (const p of PRODUCTS_CACHE){
    const s = STOCK_CACHE.get(p.id);
    const st = underThresholdForAgency(p,s,ag);
    if (st.count>0){
      for (const [size, missing] of Object.entries(st.missing)){
        const sz = size==="global" ? "" : size;
        lines.push({ Reference:p.reference, Nom:p.name, Taille:sz, Manquant:missing, PrixAchat:p.price||0, Total:(p.price||0)*missing, Agence:ag });
      }
    }
  }
  if (!lines.length){ alert("Aucun article sous seuil pour cette agence."); return; }
  exportToExcel([{ name:"Reassort", data: lines, header: ["Reference","Nom","Taille","Manquant","PrixAchat","Total","Agence"] }]);
}

// Scanner
let qrReader = null;
function openScanner(){
  $("#scan-modal").classList.remove("hidden");
  const el = document.getElementById("qr-reader");
  qrReader = new Html5Qrcode(el);
  const config = { fps: 10, qrbox: 250, rememberLastUsedCamera: true };
  qrReader.start({ facingMode: "environment" }, config, (decoded) => {
    $("#search").value = decoded; closeScanner(); renderCatalogue();
  });
}
function closeScanner(){
  $("#scan-modal").classList.add("hidden");
  if (qrReader){ try { qrReader.stop(); qrReader.clear(); } catch(e){} qrReader=null; }
}

// Admin render
async function renderAdmin(){
  const agencies = await listAgencies();
  renderTable($("#agencies-table"), [{label:"Agence", key:"name"}], agencies);
  $("#us-agency").innerHTML = agencies.map(a=>`<option>${a.name}</option>`).join("");
  const users = await listUsers();
  renderTable($("#users-table"), [
    {label:"Login", key:"login"},
    {label:"Rôle", key:"role"},
    {label:"Agence", key:"agency"},
    {label:"Actions", key:"actions", render:(r)=> r.login!=="admin" ? `<button class="btn danger" data-del="${r.login}">Supprimer</button>` : "" }
  ], users);
  // Bind delete
  $("#users-table").querySelectorAll("[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const login = btn.getAttribute("data-del");
      if (!confirm(`Supprimer l'utilisateur ${login} ?`)) return;
      await deleteUser(login);
      await renderAdmin();
    });
  });
}

// Boot
async function main(){
  await seedIfEmpty();
  loadSession();

  $("#login-form").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const u = await login($("#login").value.trim(), $("#password").value);
    if (!u){ $(".hint").textContent = "Identifiants invalides"; return; }
    $("#login-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#user-label").textContent = `${SESSION.login} (${SESSION.role})`;

    const agencies = await listAgencies();
    const sel = $("#agency-select");
    sel.innerHTML = agencies.map(a=>`<option>${a.name}</option>`).join("");
    if (SESSION.role==="agence"){ sel.value = SESSION.agency; sel.disabled = true; } else { sel.value = SESSION.agency || agencies[0]?.name; sel.disabled = false; }

    gateAdminVisibility();

    $("#st-date-from").value = todayISO();
    $("#st-date-to").value = todayISO();

    await ensureProductsCache();
    await renderCatalogue();
    await renderMovements();
    await renderStats();
    await renderAdmin();

    // Movements select agencies
    $("#mv-from").innerHTML = agencies.map(a=>`<option>${a.name}</option>`).join("");
    $("#mv-to").innerHTML   = agencies.map(a=>`<option>${a.name}</option>`).join("");
  });

  $("#logout-btn").addEventListener("click", ()=>{ clearSession(); location.reload(); });

  // Tabs
  $$(".tab-btn").forEach(b=> b.addEventListener("click", ()=> setActiveTab(b.dataset.tab)));
  // Agency change
  $("#agency-select").addEventListener("change", async ()=>{
    SESSION.agency = $("#agency-select").value; saveSession();
    await ensureStockCache(); await renderCatalogue(); await renderMovements(); await renderStats();
  });

  // Catalogue
  $("#add-product-btn").addEventListener("click", ()=> SESSION.role==="admin" ? openProductEditor(null) : alert("Réservé à l’admin."));
  $("#search").addEventListener("input", renderCatalogue);
  $("#category-filter").addEventListener("change", renderCatalogue);
  $("#filter-reassort").addEventListener("change", renderCatalogue);
  $("#reassort-btn").addEventListener("click", proposeReassort);
  $("#scan-btn").addEventListener("click", openScanner);
  $("#scan-close").addEventListener("click", closeScanner);

  // Movements
  hookMovementProductSearch();
  $("#mv-submit").addEventListener("click", submitMovement);
  $("#mv-refresh").addEventListener("click", renderMovements);

  // Stats
  $("#st-refresh").addEventListener("click", renderStats);
  $("#st-export").addEventListener("click", async ()=>{
    await renderStats();
    const agency = $("#agency-select").value;
    const data = [];
    $("#stats-table table tbody tr").forEach(tr=>{
      const tds = tr.querySelectorAll("td");
      data.push({ Reference: tds[0].textContent, Nom: tds[1].textContent, Qte: Number(tds[2].textContent), PrixAchat: tds[3].textContent, Valorisation: tds[4].textContent, Agence: agency });
    });
    exportToExcel([{ name:"Stats", data, header: Object.keys(data[0]||{Reference:"",Nom:""}) }]);
  });

  // Import/Export
  $("#export-products").addEventListener("click", exportProductsExcel);
  $("#export-products-json").addEventListener("click", exportProductsJSON);
  $("#export-movements").addEventListener("click", exportMovementsExcel);
  $("#import-products").addEventListener("click", async ()=>{
    const f = $("#import-products-file").files[0];
    if (!f){ alert("Choisir un fichier Excel"); return; }
    await importProductsFromExcel(f);
  });

  // Admin
  $("#ag-add").addEventListener("click", async ()=>{
    const name = $("#ag-name").value.trim(); if (!name) return;
    await addAgency(name); $("#ag-name").value="";
    await renderAdmin();
    // refresh selectors
    const agencies = await listAgencies();
    $("#agency-select").innerHTML = agencies.map(a=>`<option>${a.name}</option>`).join("");
    $("#mv-from").innerHTML = agencies.map(a=>`<option>${a.name}</option>`).join("");
    $("#mv-to").innerHTML   = agencies.map(a=>`<option>${a.name}</option>`).join("");
  });

  $("#us-add").addEventListener("click", async ()=>{
    const payload = { login: $("#us-login").value.trim(), password: $("#us-password").value, role: $("#us-role").value, agency: $("#us-agency").value };
    if (!payload.login){ alert("Login requis"); return; }
    await upsertUser(payload);
    $("#us-login").value=""; $("#us-password").value="";
    await renderAdmin();
  });

  $("#purge-history").addEventListener("click", async ()=>{
    if (!confirm("Confirmer la purge des mouvements ?")) return;
    const snap = await getDocs(collection(db,"movements"));
    for (const d of snap.docs) await deleteDoc(d.ref);
    alert("Historique purgé");
    await renderMovements();
  });
}

main();
