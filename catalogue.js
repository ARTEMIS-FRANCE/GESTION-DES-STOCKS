// === Module Catalogue - version validée ===
(function(){
  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const money=n=>(n||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
  const SIZES=["XS","S","M","L","XL","2XL","3XL","4XL"];
  const FAMILIES=["Uniformes","EPI","Communication","Roulant","Informatique","Licences","Divers"];
  const CATEGORIES=["Uniformes (haut)","Uniformes (bas)","Chaussures","Accessoires","Tenues EPI","Gants","Casques","Talkies","Oreillettes","Véhicules","Pièces détachées","PC","Tablettes","Téléphones","Logiciels","Licences informatiques","Divers"];

  function ensureLib(src, checkFn){
    return new Promise((resolve,reject)=>{
      if(checkFn && checkFn()){return resolve()}
      const s=document.createElement('script'); s.src=src; s.onload=()=>resolve(); s.onerror=reject; document.head.appendChild(s);
    });
  }

  async function mount(){
    const host = $("#tab-catalogue");
    if(!host) return;
    await ensureLib("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", ()=>window.XLSX);
    await ensureLib("https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js", ()=>window.Chart);

    host.innerHTML = `
      <h2>Catalogue</h2>
      <div class="kpi">
        <div class="item"><div>Total articles</div><div id="kTotal" style="font-size:22px;font-weight:800"></div></div>
        <div class="item"><div>Valorisation (sélection)</div><div id="kValo" style="font-size:22px;font-weight:800"></div></div>
        <div class="item admin-only"><div>Valorisation (TOUT)</div><div id="kValoAll" style="font-size:22px;font-weight:800"></div></div>
        <div class="item"><div>Sous seuil (agence courante)</div><div id="kLow" style="font-size:22px;font-weight:800"></div></div>
      </div>
      <div class="grid g3">
        <div class="card">
          <h3>Filtres</h3>
          <div class="grid g3">
            <input id="fSearch" placeholder="Nom, référence, code-barres">
            <select id="fFamily"></select>
            <select id="fCategory"></select>
            <div>
              <label>Agences</label>
              <select id="fAgencies" multiple size="6"></select>
              <button id="fAll" class="ghost" style="margin-top:6px">TOUT</button>
            </div>
            <select id="fReassort">
              <option value="">Tous</option>
              <option value="1">À réassort (par taille)</option>
            </select>
            <div class="right">
              <label>Page</label>
              <select id="fPageSize"><option>20</option><option>50</option><option>100</option></select>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Actions</h3>
          <div class="grid g3">
            <button id="btnReassort" class="primary">Proposer un réassort</button>
            <button id="btnReassortGen" class="ghost">Générer Entrées</button>
            <div class="right admin-only">
              <button id="expX" class="ghost">Export Produits (XLSX)</button>
              <input id="impX" type="file" accept=".xlsx">
            </div>
          </div>
        </div>
      </div>
      <div class="table-wrap card">
        <table id="catTbl">
          <thead><tr>
            <th>Référence</th><th>Article</th><th>Famille</th><th>Catégorie</th>
            <th>Prix (€/u)</th><th>Stock (sélection)</th><th class="admin-only">Stock (TOUT)</th>
            <th>Seuil (agence courante)</th><th>Code-barres</th><th>Affectation</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="right"><button id="btnNewFromCat" class="ghost">+ Nouveau produit</button></div>
      <div class="card" id="chartsBlock">
        <h3>Graphiques (sélection)</h3>
        <div class="grid g3">
          <div class="card"><canvas id="chartFam"></canvas></div>
          <div class="card"><canvas id="chartCat"></canvas></div>
          <div class="card"><canvas id="chartArt"></canvas></div>
        </div>
      </div>
      <div id="reassortModal" class="hidden" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:50;display:flex;align-items:center;justify-content:center">
        <div class="card" style="width: min(1100px,95vw);max-height:90vh;overflow:auto">
          <div style="display:flex;align-items:center;gap:8px">
            <h3 style="margin:0;flex:1">Prévisualisation réassort</h3>
            <input id="rSearch" placeholder="Rechercher…">
            <button id="rExportXLSX" class="ghost">Exporter XLSX</button>
            <button id="rClose" class="ghost">Fermer</button>
          </div>
          <div class="small">Cochez/décochez les lignes à générer.</div>
          <div class="grid g3">
            <div><label>Destinataire</label><select id="rDest"></select></div>
            <div><label>Motif</label><select id="rMotif"></select></div>
            <div class="right"><button id="rGenerate" class="primary">Générer les entrées</button></div>
          </div>
          <div class="table-wrap" style="max-height:58vh">
            <table id="rTbl"><thead><tr>
              <th><input type="checkbox" id="rAll"></th>
              <th>Réf</th><th>Nom</th><th>Taille</th><th>Qté</th><th>Agence</th><th>Prix</th><th>Total</th>
            </tr></thead><tbody></tbody></table>
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",session.role!=="admin"));

    let catPage=1,catPageSize=20,catRows=[];

    function getMinGlobal(p,agency){const base=Number(p.minGlobal||0);const ag=p.perAgencyMin&&p.perAgencyMin[agency];return ag&&typeof ag.min==='number'?Number(ag.min):base}
    function getMinSize(p,agency,size){const ag=p.perAgencyMin&&p.perAgencyMin[agency];if(ag&&ag.minBySize&&ag.minBySize[size]!=null)return Number(ag.minBySize[size]||0);if(p.minBySize&&p.minBySize[size]!=null)return Number(p.minBySize[size]||0);return 0}
    function underThreshold(p,st,agency){
      const sizes=new Set([...(p.minBySize?Object.keys(p.minBySize):[]),...(p.perAgencyMin?.[agency]?.minBySize?Object.keys(p.perAgencyMin[agency].minBySize):[])]);
      for(const s of sizes){const min=getMinSize(p,agency,s);if(min>0&&((st.sizes?.[s]||0)<min))return true}
      const mg=getMinGlobal(p,agency);if(mg>0&&((st.total||0)<mg))return true;return false
    }

    async function load(){
      const products=await Store.get("products")||[];
      const stock=await Store.get("stock")||{};
      const allAg=await Store.get("agencies")||[];
      $("#fFamily").innerHTML="<option value=''>Toutes familles</option>"+FAMILIES.map(v=>`<option>${v}</option>`).join("");
      $("#fCategory").innerHTML="<option value=''>Toutes catégories</option>"+CATEGORIES.map(v=>`<option>${v}</option>`).join("");
      const agSel=$("#fAgencies");agSel.innerHTML="";
      const allowed=(session.role==="admin")?allAg:(session.agencies||[]).filter(a=>allAg.includes(a));
      allowed.forEach(a=>{const o=document.createElement("option");o.text=a;o.value=a;agSel.add(o)});
      $("#fAll").onclick=()=>{Array.from(agSel.options).forEach(o=>o.selected=true);render()};
      $("#fPageSize").onchange=()=>{catPageSize=Number($("#fPageSize").value||20);catPage=1;render()};$("#fSearch").oninput=render;$("#fFamily").onchange=render;$("#fCategory").onchange=render;$("#fAgencies").onchange=render;$("#fReassort").onchange=render;

      function selAg(){const s=Array.from(agSel.selectedOptions).map(o=>o.value);return s.length?s:[session.agency]}
      function stockSel(ref,ags){let t=0;ags.forEach(a=>t+=(stock[a]?.[ref]?.total)||0);return t}
      function stockAll(ref){let t=0;Object.keys(stock).forEach(a=>t+=(stock[a]?.[ref]?.total)||0);return t}

      function kpis(rows){
        $("#kTotal").textContent=products.length;let valoSel=0,valoAll=0,under=0;
        for(const r of rows){valoSel+=r.stSel*Number(r.p.price||0);valoAll+=r.stAll*Number(r.p.price||0);
          const cur=(stock[session.agency]||{})[r.p.ref]||{total:0,sizes:{}};if(underThreshold(r.p,cur,session.agency))under++}
        $("#kValo").textContent=money(valoSel);$("#kValoAll").textContent=money(valoAll);$("#kLow").textContent=under
      }

      function bindInline(){
        $$("#catTbl [data-ref][data-field]").forEach(el=>{
          el.addEventListener("keydown",ev=>{if(ev.key==="Enter"){ev.preventDefault();ev.target.blur()}});
          el.addEventListener("blur",async ev=>{
            const ref=ev.target.dataset.ref, field=ev.target.dataset.field, value=ev.target.innerText;
            const list=await Store.get("products")||[];const i=list.findIndex(x=>x.ref===ref);
            if(i>=0){if(field==="price")list[i].price=Number(value||0);if(field==="affectation")list[i].affectation=String(value||"").trim();await Store.set("products",list); render()}
          })
        })
      }

      function render(){
        const fam=$("#fFamily").value,cat=$("#fCategory").value,q=($("#fSearch").value||"").toLowerCase(),needR=$("#fReassort").value==="1";const ags=selAg();
        const body=$("#catTbl tbody");body.innerHTML="";catRows=[];
        for(const p of products){
          if(fam&&p.family!==fam)continue;if(cat&&p.category!==cat)continue;
          const fields=[p.ref,p.name,p.family,p.category,(p.barcode||""),(p.affectation||"")].join(" ").toLowerCase();if(q&&!fields.includes(q))continue;
          const stSel=stockSel(p.ref,ags),stAll=stockAll(p.ref);
          const stCur=(stock[session.agency]||{})[p.ref]||{total:0,sizes:{}};const isU=underThreshold(p,stCur,session.agency);if(needR&&!isU)continue;
          catRows.push({p,stSel,stAll,isU})
        }
        const pages=Math.max(1,Math.ceil(catRows.length/catPageSize));if(catPage>pages)catPage=pages;
        const start=(catPage-1)*catPageSize,end=start+catPageSize;const slice=catRows.slice(start,end);
        slice.forEach(({p,stSel,stAll,isU})=>{
          const tr=document.createElement("tr");if(isU)tr.className=stSel>0?"warn":"alert";
          tr.innerHTML=`<td>${p.ref}</td><td>${p.name||""}</td><td>${p.family||""}</td><td>${p.category||""}</td>
          <td><span class="cell" data-ref="${p.ref}" data-field="price" contenteditable="true">${p.price??""}</span></td><td>${stSel||0}</td><td class="admin-only">${stAll||0}</td>
          <td>G:${getMinGlobal(p,session.agency)||0}</td><td>${p.barcode||""}</td><td><span class="cell" data-ref="${p.ref}" data-field="affectation" contenteditable="true">${p.affectation||""}</span></td>`;
          body.appendChild(tr);
        });
        document.querySelectorAll(".admin-only").forEach(e=>e.classList.toggle("hidden",session.role!=="admin"));
        kpis(slice.length?slice:catRows);
        renderCharts(catRows);
        bindInline();
      }

      let _famChart,_catChart,_artChart;
      function renderCharts(rows){
        const ctxF=document.getElementById('chartFam'),ctxC=document.getElementById('chartCat'),ctxA=document.getElementById('chartArt');if(!ctxF||!ctxC||!ctxA)return;
        function stockSelAll(ref){let t=0;(Array.from($("#fAgencies").selectedOptions).map(o=>o.value) || [session.agency]).forEach(a=>t+=((stock[a]||{})[ref]?.total)||0);return t}
        const byFam={},byCat={},byArt={};
        rows.forEach(r=>{const qty=stockSelAll(r.p.ref),val=qty*Number(r.p.price||0);byFam[r.p.family]=(byFam[r.p.family]||0)+val;byCat[r.p.category]=(byCat[r.p.category]||0)+val;byArt[r.p.name]=(byArt[r.p.name]||0)+val});
        const top=(obj,n=10)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n);
        const fam=top(byFam),cat=top(byCat),art=top(byArt);
        const cfg=(labels,data)=>({type:'bar',data:{labels,datasets:[{label:'Valorisation (€)',data}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{maxRotation:45}},y:{beginAtZero:true}}}});
        if(_famChart){_famChart.destroy()}if(_catChart){_catChart.destroy()}if(_artChart){_artChart.destroy()}
        _famChart=new Chart(ctxF,cfg(fam.map(x=>x[0]),fam.map(x=>Math.round(x[1]))));
        _catChart=new Chart(ctxC,cfg(cat.map(x=>x[0]),cat.map(x=>Math.round(x[1]))));
        _artChart=new Chart(ctxA,cfg(art.map(x=>x[0]),art.map(x=>Math.round(x[1]))));
      }

      $("#expX").onclick=async()=>{
        const list=await Store.get("products")||[];
        const rows=list.map(p=>({ref:p.ref,name:p.name,family:p.family||"",category:p.category||"",price:p.price||0,vendor:p.vendor||"",barcode:p.barcode||"",affectation:p.affectation||"",minGlobal:p.minGlobal||0,
          XS:p.minBySize?.XS||"",S:p.minBySize?.S||"",M:p.minBySize?.M||"",L:p.minBySize?.L||"",XL:p.minBySize?.XL||"",_2XL:p.minBySize?.["2XL"]||"",_3XL:p.minBySize?.["3XL"]||"",_4XL:p.minBySize?.["4XL"]||"",notes:p.notes||""}));
        const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Produits");XLSX.writeFile(wb,"produits_full.xlsx");
      };
      $("#impX").onchange=async e=>{
        const f=e.target.files[0];if(!f)return;const data=await f.arrayBuffer();const wb=XLSX.read(data,{type:"array"});
        const sh=wb.Sheets["Produits"];if(!sh)return alert('Feuille "Produits" introuvable');
        const rows=XLSX.utils.sheet_to_json(sh);const list=await Store.get("products")||[];const idx=new Map(list.map((p,i)=>[p.ref,i]));
        rows.forEach(r=>{if(!r.ref)return;const rec={ref:String(r.ref),name:r.name||"",family:r.family||"",category:r.category||"",price:Number(r.price||0),vendor:r.vendor||"",barcode:r.barcode||"",affectation:r.affectation||"",minGlobal:Number(r.minGlobal||0),notes:r.notes||""};
          const minBySize={};if(r.XS)minBySize.XS=Number(r.XS);if(r.S)minBySize.S=Number(r.S);if(r.M)minBySize.M=Number(r.M);if(r.L)minBySize.L=Number(r.L);if(r.XL)minBySize.XL=Number(r.XL);if(r._2XL)minBySize["2XL"]=Number(r._2XL);if(r._3XL)minBySize["3XL"]=Number(r._3XL);if(r._4XL)minBySize["4XL"]=Number(r._4XL);
          if(Object.keys(minBySize).length)rec.minBySize=minBySize;if(idx.has(rec.ref))list[idx.get(rec.ref)]=Object.assign(list[idx.get(rec.ref)],rec);else list.push(rec)});
        await Store.set("products",list);alert("Import terminé"); load();
      };

      let REASSORT_DRAFT=[],REASSORT_VIEW=[];
      function computeReassort(products, stock, agency){
        const draft=[];
        for(const p of products){
          const st=(stock[agency]?.[p.ref])||{total:0,sizes:{}};
          const sizes = new Set([...(p.minBySize?Object.keys(p.minBySize):[]),...(p.perAgencyMin?.[agency]?.minBySize?Object.keys(p.perAgencyMin[agency].minBySize):[])]);
          for(const s of sizes){
            const min = getMinSize(p, agency, s);
            const cur = st.sizes?.[s]||0;
            if(min>0 && cur<min) draft.push({ref:p.ref,name:p.name||"",size:s,qty:(min-cur),price:Number(p.price||0),agency});
          }
          const mg=getMinGlobal(p, agency);
          if(mg>0 && (st.total||0)<mg){
            const needed = mg-(st.total||0);
            draft.push({ref:p.ref,name:p.name||"",size:null,qty:needed,price:Number(p.price||0),agency});
          }
        }
        return draft;
      }
      function openReassortModal(draft){REASSORT_DRAFT=draft.slice();REASSORT_VIEW=draft.slice();$("#reassortModal").classList.remove('hidden');fillReassortDicts();renderReassortTable()}
      function closeReassortModal(){$("#reassortModal").classList.add('hidden');REASSORT_VIEW=[];REASSORT_DRAFT=[]}
      async function fillReassortDicts(){const dict=await Store.get("dict")||{destinataires:["Agence"],motifs:["Réassort"]};const d=$("#rDest"),m=$("#rMotif");d.innerHTML="";m.innerHTML="";
        (dict.destinataires||[]).forEach(v=>{const o=document.createElement("option");o.text=v;d.add(o)});(dict.motifs||[]).forEach(v=>{const o=document.createElement("option");o.text=v;m.add(o)})}
      function renderReassortTable(){const tb=$("#rTbl tbody");tb.innerHTML="";const q=($("#rSearch").value||"").toLowerCase();const allchk=$("#rAll");allchk.checked=true;
        REASSORT_VIEW=REASSORT_DRAFT.filter(x=>(x.ref+' '+(x.name||'')+' '+(x.size||'')).toLowerCase().includes(q));
        for(const ln of REASSORT_VIEW){const tr=document.createElement("tr");tr.innerHTML=`<td><input type="checkbox" class="rSel" checked></td>
          <td>${ln.ref}</td><td>${ln.name||""}</td><td>${ln.size||""}</td><td>${ln.qty}</td><td>${ln.agency}</td><td>${ln.price.toFixed(2)}</td><td>${(ln.price*ln.qty).toFixed(2)}</td>`;tb.appendChild(tr)}
      }
      $("#rSearch").oninput=renderReassortTable;$("#rAll").onchange=e=>{$$("#rTbl .rSel").forEach(ch=>ch.checked=e.target.checked)};$("#rClose").onclick=closeReassortModal;
      $("#rExportXLSX").onclick=async()=>{if(!REASSORT_VIEW.length){alert("Aucune ligne à exporter");return}const dateStr=new Date().toISOString().slice(0,10).replace(/-/g,'');
        const rows=REASSORT_VIEW.map(ln=>({Agence:ln.agency,Reference:ln.ref,Nom:ln.name||"",Taille:ln.size||"",Quantite:ln.qty,Prix:ln.price||0,Total:(ln.price||0)*ln.qty,Logo:"ARTEMIS Security"}));
        const ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=[{wch:10},{wch:18},{wch:28},{wch:8},{wch:10},{wch:10},{wch:12},{wch:18}];
        const wb=XLSX.utils.book_new();XLSX.utils.sheet_add_aoa(ws,[["ARTEMIS Security — Brouillon de Réassort","","","","","","",""]],{origin:"A1"});
        XLSX.utils.book_append_sheet(wb,ws,"Reassort");XLSX.writeFile(wb,"reassort_"+dateStr+".xlsx")};
      $("#rGenerate").onclick=async()=>{
        const rows=Array.from($("#rTbl tbody").rows);const sel=rows.map((tr,i)=>({i,ok:tr.querySelector('.rSel').checked})).filter(x=>x.ok).map(x=>REASSORT_VIEW[x.i]);
        if(!sel.length){alert("Sélectionnez au moins une ligne.");return}
        const stock=await Store.get("stock")||{};const mv=await Store.get("movements")||[];stock[session.agency]=stock[session.agency]||{};
        const dest=$("#rDest").value||"Réassort";const motif=$("#rMotif").value||"Réassort";
        sel.forEach(ln=>{const ref=ln.ref;stock[session.agency][ref]=stock[session.agency][ref]||{total:0,sizes:{}};stock[session.agency][ref].total+=ln.qty;if(ln.size){stock[session.agency][ref].sizes[ln.size]=(stock[session.agency][ref].sizes[ln.size]||0)+ln.qty}
          mv.push({date:new Date().toISOString().slice(0,19).replace('T',' '),type:"in",agency:session.agency,ref,size:ln.size,qty:ln.qty,toAgency:"",dest,motif,note:"Réassort (modale)"})});
        await Store.set("stock",stock);await Store.set("movements",mv);alert("Entrées générées pour "+sel.length+" lignes.");closeReassortModal();load();
      };

      $("#btnReassort").onclick=async()=>{
        const products=await Store.get("products")||[];const stock=await Store.get("stock")||{};
        let draft=computeReassort(products,stock,session.agency);
        if(!draft.length){alert("Aucun article sous seuil pour l'agence "+session.agency);return}openReassortModal(draft);
      };
      $("#btnReassortGen").onclick=()=>{alert("Utilisez la modale pour générer sélectivement : cliquez d'abord sur 'Proposer un réassort'.")};

      render();
    } // load()

    const tabBtn = Array.from(document.querySelectorAll("#tabs button")).find(b=>b.dataset.tab==="catalogue");
    if(tabBtn){tabBtn.addEventListener("click", mount, {once:true});}
    if(!document.getElementById("placeholder-cat")) { /* already mounted elsewhere */ }
  }
)();
