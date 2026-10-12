/* ============================================================
   MI BODEGA — Punto de Venta e Inventario (Venezuela)
   App 100% local (localStorage). Tasa BCV online + manual.
   ============================================================ */
'use strict';
const _MEM={};
const DB = {
  k:p=>'mb_'+p,
  get(p,def){
    try{const v=localStorage.getItem(DB.k(p));if(v!=null)return JSON.parse(v);}catch(e){}
    return (DB.k(p) in _MEM)?_MEM[DB.k(p)]:def;
  },
  set(p,v){_MEM[DB.k(p)]=v;try{localStorage.setItem(DB.k(p),JSON.stringify(v));}catch(e){}}
};

const App = {
  user:null,
  cfg:null,
  cart:[],
  payment:'efectivo_bs',

  /* ---------- utilidades ---------- */
  uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);},
  rate(){return this.cfg.bcvRate||1;},
  toBs(usd){return usd*this.rate();},
  fmtBs(n){return new Intl.NumberFormat('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0)+' Bs';},
  fmtUsd(n){return '$'+new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);},
  esc(s){return String(s==null?'':s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));},
  today(){return new Date().toISOString().slice(0,10);},
  nowLabel(){return new Date().toLocaleString('es-VE');},

  toast(msg,type){
    const t=document.getElementById('toast');
    const el=document.createElement('div');
    el.className='toast '+(type||'');el.textContent=msg;t.appendChild(el);
    setTimeout(()=>el.remove(),2800);
  },
  modal(html){
    document.getElementById('modal-box').innerHTML=html;
    document.getElementById('modal').classList.add('show');
  },
  closeModal(){document.getElementById('modal').classList.remove('show');},
  toggleMenu(on){document.body.classList.toggle('menu-open',on);},
  /* ---------- datos semilla ---------- */
  seed(){
    if(!DB.get('users')){
      DB.set('users',[
        {id:'u1',username:'master',password:'admin123',name:'Administrador',role:'master'},
        {id:'u2',username:'vendedor',password:'vende123',name:'Vendedor',role:'vendedor'}
      ]);
    }
    if(!DB.get('config')){
      DB.set('config',{storeName:'Mi Bodega',phone:'',igtf:3,igtfOn:true,
        bcvRate:0,bcvDate:'',bcvManual:false,stockMin:3});
    }
    if(!DB.get('products')){
      DB.set('products',[
        {id:'p1',codigo:'7591',nombre:'CUBITOS MAGGI',categoria:'Alimentos',unidad:'und',costo:0.12,precio:0.20,stock:40,min:5},
        {id:'p2',codigo:'1001',nombre:'CIGARROS POR UNIDAD',categoria:'Varios',unidad:'und',costo:0.08,precio:0.15,stock:92,min:10},
        {id:'p3',codigo:'2002',nombre:'HUEVOS POR UNIDAD',categoria:'Alimentos',unidad:'und',costo:0.10,precio:0.18,stock:73,min:12},
        {id:'p4',codigo:'3003',nombre:'ARROZ KALY 1KG',categoria:'Alimentos',unidad:'kg',costo:0.90,precio:1.30,stock:2,min:5},
        {id:'p5',codigo:'4004',nombre:'CAFE FAVORITO',categoria:'Alimentos',unidad:'und',costo:1.50,precio:2.20,stock:1,min:4},
        {id:'p6',codigo:'5005',nombre:'HARINA PAN',categoria:'Alimentos',unidad:'und',costo:0.75,precio:1.10,stock:30,min:6}
      ]);
    }
    if(!DB.get('sales'))DB.set('sales',[]);
    if(!DB.get('clients'))DB.set('clients',[]);
  },

  /* ---------- métodos de pago ---------- */
  PAYS:[
    {k:'efectivo_bs',n:'Efectivo Bs',ic:'💵'},
    {k:'efectivo_usd',n:'Efectivo Divisas',ic:'💴'},
    {k:'usdt',n:'USDT',ic:'₿'},
    {k:'punto',n:'Punto / Tarjeta',ic:'💳'},
    {k:'pago_movil',n:'Pago Móvil',ic:'📱'},
    {k:'transferencia',n:'Transferencia',ic:'🏦'}
  ],
  payName(k){const p=this.PAYS.find(x=>x.k===k);return p?p.n:(k==='fiado'?'Fiado / Crédito':k);},
  /* ---------- tasa BCV ---------- */
  async fetchRate(silent){
    if(this.cfg.bcvManual){if(!silent)this.toast('Tasa en modo manual','');this.renderDashboard();return;}
    const urls=[
      {u:'https://ve.dolarapi.com/v1/dolares/oficial',pick:d=>d.promedio},
      {u:'https://pydolarve.org/api/v1/dollar?page=bcv',pick:d=>(d.monitors&&d.monitors.bcv&&d.monitors.bcv.price)}
    ];
    for(const s of urls){
      try{
        const r=await fetch(s.u,{cache:'no-store'});
        if(!r.ok)continue;
        const d=await r.json();const val=parseFloat(s.pick(d));
        if(val&&val>0){
          this.cfg.bcvRate=val;this.cfg.bcvDate=this.nowLabel();DB.set('config',this.cfg);
          if(!silent)this.toast('Tasa BCV actualizada: '+this.fmtBs(val),'ok');
          this.refreshAll();return val;
        }
      }catch(e){}
    }
    if(!silent)this.toast('Sin conexión. Use tasa manual en Configuración.','err');
    this.renderDashboard();
    return null;
  },

  /* ---------- sesión ---------- */
  login(){
    const u=document.getElementById('lg-user').value.trim();
    const p=document.getElementById('lg-pass').value;
    const users=DB.get('users',[]);
    const found=users.find(x=>x.username===u&&x.password===p);
    if(!found){this.toast('Usuario o contraseña incorrectos','err');return;}
    this.user=found;DB.set('session',found.id);
    this.enterApp();
  },
  logout(){DB.set('session',null);this.user=null;location.reload();},
  enterApp(){
    document.getElementById('login').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('u-name').textContent=this.user.name;
    document.getElementById('u-role').textContent=this.user.role==='master'?'Master / Admin':'Vendedor';
    document.getElementById('u-av').textContent=this.user.name.charAt(0).toUpperCase();
    document.getElementById('sb-store').textContent=this.cfg.storeName;
    this.buildNav();
    this.go('dashboard');
    this.fetchRate(true);
  },
  /* ---------- navegación ---------- */
  NAV:[
    {k:'dashboard',n:'Indicadores',ic:'📊',roles:['master','vendedor']},
    {k:'inventario',n:'Inventario',ic:'📦',roles:['master','vendedor']},
    {k:'pos',n:'POS / Ventas',ic:'🛒',roles:['master','vendedor']},
    {k:'reportes',n:'Reportes',ic:'📈',roles:['master']},
    {k:'cobranza',n:'Cobranza / Fiados',ic:'💰',roles:['master','vendedor']},
    {k:'config',n:'Configuración',ic:'⚙️',roles:['master']}
  ],
  buildNav(){
    const nav=document.getElementById('nav');nav.innerHTML='';
    this.NAV.filter(i=>i.roles.includes(this.user.role)).forEach(i=>{
      const a=document.createElement('a');a.dataset.k=i.k;
      a.innerHTML='<span class="ni">'+i.ic+'</span>'+i.n;
      a.onclick=()=>this.go(i.k);nav.appendChild(a);
    });
  },
  go(k){
    const item=this.NAV.find(i=>i.k===k);
    if(item&&!item.roles.includes(this.user.role)){this.toast('Sin permisos para esta sección','err');return;}
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('pg-'+k).classList.add('active');
    document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.k===k));
    document.getElementById('tb-title').textContent=item?item.n:'Mi Bodega';
    this.toggleMenu(false);
    ({dashboard:'renderDashboard',inventario:'renderInventario',pos:'renderPOS',
      reportes:'renderReportes',cobranza:'renderCobranza',config:'renderConfig'}[k]) &&
      this['render'+k.charAt(0).toUpperCase()+k.slice(1)]();
  },
  refreshAll(){
    this.renderDashboard();
    const act=document.querySelector('.page.active');
    if(act){const k=act.id.replace('pg-','');
      if(k==='inventario')this.renderInventario();
      if(k==='pos')this.renderPOS();
      if(k==='cobranza')this.renderCobranza();
      if(k==='reportes')this.renderReportes();
    }
  },
  /* ================= DASHBOARD ================= */
  renderDashboard(){
    const products=DB.get('products',[]);
    const sales=DB.get('sales',[]);
    const today=this.today();
    const todaySales=sales.filter(s=>s.fecha.slice(0,10)===today);
    let gananciaUsd=0,ingresosBs=0;
    todaySales.forEach(s=>{
      s.items.forEach(it=>{gananciaUsd+=(it.precio-it.costo)*it.cantidad;});
      if(s.tipo!=='fiado')ingresosBs+=s.totalBs;
    });
    let fiadoUsd=0;
    sales.filter(s=>s.tipo==='fiado').forEach(s=>{fiadoUsd+=Math.max(0,s.totalUsd-(s.abonado||0));});
    const costoTotal=products.reduce((a,p)=>a+p.costo*p.stock,0);
    const ventaTotal=products.reduce((a,p)=>a+p.precio*p.stock,0);
    const min=this.cfg.stockMin||3;
    const critico=products.filter(p=>p.stock<min).sort((a,b)=>a.stock-b.stock).slice(0,8);
    // top vendidos (28 dias)
    const lim=new Date(Date.now()-28*864e5).toISOString().slice(0,10);
    const map={};
    sales.filter(s=>s.fecha.slice(0,10)>=lim).forEach(s=>s.items.forEach(it=>{map[it.nombre]=(map[it.nombre]||0)+it.cantidad;}));
    const top=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const r=this.rate();
    const rateInfo=r>0?this.fmtBs(r):'— sin tasa —';
    document.getElementById('pg-dashboard').innerHTML=`
      <div class="ph"><h1>Indicadores del Día</h1><p>Resumen en tiempo real del rendimiento de tu negocio.</p></div>
      <div class="grid g3" style="margin-bottom:16px">
        <div class="card rate-card"><div class="stat">
          <span class="lbl">💲 Tasa del Día (BCV)</span>
          <span class="big">${rateInfo}</span>
          <span class="sub">${this.cfg.bcvManual?'Modo manual':'Actualizado: '+(this.cfg.bcvDate||'—')}</span>
          <button class="btn btn-sm" style="background:rgba(255,255,255,.2);color:#fff;margin-top:8px" onclick="App.fetchRate(false)">🔄 Actualizar tasa</button>
        </div></div>
        <div class="card"><div class="stat gr"><span class="lbl">Ganancia Estimada (Hoy)</span>
          <span class="big">${this.fmtBs(this.toBs(gananciaUsd))}</span><span class="sub">(${this.fmtUsd(gananciaUsd)}) — ${todaySales.length} ventas</span></div></div>
        <div class="card"><div class="stat bl"><span class="lbl">Ingresos Cobrados (Hoy)</span>
          <span class="big">${this.fmtBs(ingresosBs)}</span><span class="sub">Contado — todos los métodos</span></div></div>
      </div>
      <div class="grid g3" style="margin-bottom:16px">
        <div class="card"><div class="stat rd"><span class="lbl">Total Fiado (Global)</span>
          <span class="big">${this.fmtUsd(fiadoUsd)}</span><span class="sub">${this.fmtBs(this.toBs(fiadoUsd))} (a tasa BCV)</span></div></div>
        <div class="card"><div class="stat"><span class="lbl">Valor Inventario — Costo</span>
          <span class="big">${this.fmtUsd(costoTotal)}</span><span class="sub">${this.fmtBs(this.toBs(costoTotal))}</span></div></div>
        <div class="card"><div class="stat gr"><span class="lbl">Valor Inventario — Venta</span>
          <span class="big">${this.fmtUsd(ventaTotal)}</span><span class="sub">${this.fmtBs(this.toBs(ventaTotal))}</span></div></div>
      </div>
      <div class="grid g2">
        <div class="card"><h3>🏆 Top 5 Vendidos <span class="badge b-gray">28 días</span></h3>
          <ul class="rank">${top.length?top.map(t=>`<li><span>${this.esc(t[0])}</span><span class="q">${(+t[1].toFixed(2))} vend.</span></li>`).join(''):'<li class="empty">Sin ventas aún</li>'}</ul></div>
        <div class="card"><h3>⚠️ Stock Crítico <span class="badge b-red">&lt; ${min} unid</span></h3>
          <ul class="rank crit">${critico.length?critico.map(p=>`<li><span>${this.esc(p.nombre)}</span><span class="q">Quedan: ${(+p.stock.toFixed(3))}</span></li>`).join(''):'<li class="empty">Todo en orden ✅</li>'}</ul></div>
      </div>`;
  },
  /* ================= INVENTARIO ================= */
  invFilter:'',
  renderInventario(){
    const products=DB.get('products',[]);
    const f=this.invFilter.toLowerCase();
    const list=products.filter(p=>!f||p.nombre.toLowerCase().includes(f)||(p.codigo||'').toLowerCase().includes(f));
    const min=this.cfg.stockMin||3;
    document.getElementById('pg-inventario').innerHTML=`
      <div class="ph"><h1>Inventario</h1><p>${products.length} productos registrados. El stock se descuenta automáticamente al vender.</p></div>
      <div class="toolbar">
        <div class="grow"><input class="search" placeholder="🔍 Buscar por nombre o código..." value="${this.esc(this.invFilter)}" oninput="App.invFilter=this.value;App.renderInvTable()"></div>
        <button class="btn btn-primary btn-sm" onclick="App.editProduct()">➕ Nuevo</button>
        <button class="btn btn-green btn-sm" onclick="App.importExcel()">📂 Cargar Excel</button>
        <button class="btn btn-ghost btn-sm" onclick="App.exportInventario()">📥 Exportar</button>
        <button class="btn btn-ghost btn-sm" onclick="App.downloadTemplate()">📄 Plantilla</button>
      </div>
      <div class="card pad0"><div class="table-wrap" id="inv-table"></div></div>`;
    this.renderInvTable();
  },
  renderInvTable(){
    const products=DB.get('products',[]);
    const f=this.invFilter.toLowerCase();
    const min=this.cfg.stockMin||3;
    const list=products.filter(p=>!f||p.nombre.toLowerCase().includes(f)||(p.codigo||'').toLowerCase().includes(f));
    const el=document.getElementById('inv-table');if(!el)return;
    if(!list.length){el.innerHTML='<div class="empty">Sin productos</div>';return;}
    el.innerHTML=`<table><thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="right">Costo</th><th class="right">Precio $</th><th class="right">Precio Bs</th><th class="right">Stock</th><th></th></tr></thead><tbody>${
      list.map(p=>`<tr>
        <td>${this.esc(p.codigo||'')}</td>
        <td><b>${this.esc(p.nombre)}</b></td>
        <td>${this.esc(p.categoria||'')}</td>
        <td class="right">${this.fmtUsd(p.costo)}</td>
        <td class="right">${this.fmtUsd(p.precio)}</td>
        <td class="right">${this.fmtBs(this.toBs(p.precio))}</td>
        <td class="right">${(+p.stock.toFixed(3))} ${p.stock<min?'<span class="badge b-red">bajo</span>':''}</td>
        <td><div class="t-actions"><button class="icon-btn" onclick="App.editProduct('${p.id}')">✏️</button>${this.user.role==='master'?`<button class="icon-btn" onclick="App.delProduct('${p.id}')">🗑️</button>`:''}</div></td>
      </tr>`).join('')}</tbody></table>`;
  },
  editProduct(id){
    const products=DB.get('products',[]);
    const p=id?products.find(x=>x.id===id):{codigo:'',nombre:'',categoria:'',unidad:'und',costo:0,precio:0,stock:0,min:this.cfg.stockMin||3};
    this.modal(`<div class="modal-head"><h3>${id?'Editar':'Nuevo'} producto</h3><button class="icon-btn" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="row2"><div class="field"><label>Código</label><input id="f-cod" value="${this.esc(p.codigo)}"></div>
          <div class="field"><label>Unidad</label><input id="f-und" value="${this.esc(p.unidad||'und')}"></div></div>
        <div class="field"><label>Nombre *</label><input id="f-nom" value="${this.esc(p.nombre)}"></div>
        <div class="field"><label>Categoría</label><input id="f-cat" value="${this.esc(p.categoria)}"></div>
        <div class="row2"><div class="field"><label>Costo ($)</label><input id="f-cos" type="number" step="0.01" value="${p.costo}"></div>
          <div class="field"><label>Precio venta ($)</label><input id="f-pre" type="number" step="0.01" value="${p.precio}"></div></div>
        <div class="row2"><div class="field"><label>Stock</label><input id="f-sto" type="number" step="0.001" value="${p.stock}"></div>
          <div class="field"><label>Stock mínimo</label><input id="f-min" type="number" step="0.001" value="${p.min||3}"></div></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.saveProduct('${id||''}')">Guardar</button></div>`);
  },
  saveProduct(id){
    const nom=document.getElementById('f-nom').value.trim();
    if(!nom){this.toast('El nombre es obligatorio','err');return;}
    const products=DB.get('products',[]);
    const data={codigo:document.getElementById('f-cod').value.trim(),nombre:nom,
      categoria:document.getElementById('f-cat').value.trim(),unidad:document.getElementById('f-und').value.trim()||'und',
      costo:+document.getElementById('f-cos').value||0,precio:+document.getElementById('f-pre').value||0,
      stock:+document.getElementById('f-sto').value||0,min:+document.getElementById('f-min').value||3};
    if(id){Object.assign(products.find(x=>x.id===id),data);}
    else{data.id=this.uid();products.push(data);}
    DB.set('products',products);this.closeModal();this.renderInventario();this.toast('Producto guardado','ok');
  },
  delProduct(id){
    if(!confirm('¿Eliminar este producto?'))return;
    DB.set('products',DB.get('products',[]).filter(x=>x.id!==id));
    this.renderInventario();this.toast('Producto eliminado','ok');
  },
  /* ---------- Excel import / export ---------- */
  importExcel(){
    const inp=document.createElement('input');inp.type='file';inp.accept='.xlsx,.xls,.csv';
    inp.onchange=e=>{
      const file=e.target.files[0];if(!file)return;
      const reader=new FileReader();
      reader.onload=ev=>{
        try{
          let rows=[];
          if(typeof XLSX!=='undefined'){
            const wb=XLSX.read(ev.target.result,{type:'binary'});
            rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
          }else{
            rows=this.parseCSV(ev.target.result);
          }
          this.applyImport(rows);
        }catch(err){this.toast('Error al leer el archivo','err');}
      };
      if(typeof XLSX!=='undefined')reader.readAsBinaryString(file);else reader.readAsText(file);
    };
    inp.click();
  },
  parseCSV(text){
    const lines=text.split(/\r?\n/).filter(l=>l.trim());
    if(!lines.length)return [];
    const sep=lines[0].includes(';')?';':',';
    const head=lines[0].split(sep).map(h=>h.trim());
    return lines.slice(1).map(l=>{const c=l.split(sep);const o={};head.forEach((h,i)=>o[h]=(c[i]||'').trim());return o;});
  },
  pick(row,keys){for(const k of Object.keys(row)){const kn=k.toLowerCase().trim();if(keys.includes(kn))return row[k];}return undefined;},
  applyImport(rows){
    if(!rows.length){this.toast('El archivo está vacío','err');return;}
    const products=DB.get('products',[]);let add=0,upd=0;
    rows.forEach(r=>{
      const nombre=(this.pick(r,['nombre','producto','descripcion','descripción'])||'').toString().trim();
      if(!nombre)return;
      const codigo=(this.pick(r,['codigo','código','cod','sku','barra'])||'').toString().trim();
      const prod={codigo,nombre,
        categoria:(this.pick(r,['categoria','categoría','rubro'])||'').toString().trim(),
        unidad:(this.pick(r,['unidad','und','medida'])||'und').toString().trim(),
        costo:parseFloat(this.pick(r,['costo','costo$','costo_usd','costousd']))||0,
        precio:parseFloat(this.pick(r,['precio','precio$','precio_usd','preciousd','venta']))||0,
        stock:parseFloat(this.pick(r,['stock','cantidad','existencia','inventario']))||0,
        min:parseFloat(this.pick(r,['min','minimo','mínimo','stockmin','stock_min']))||(this.cfg.stockMin||3)};
      let ex=null;
      if(codigo)ex=products.find(p=>p.codigo&&p.codigo===codigo);
      if(!ex)ex=products.find(p=>p.nombre.toLowerCase()===nombre.toLowerCase());
      if(ex){Object.assign(ex,prod);upd++;}else{prod.id=this.uid();products.push(prod);add++;}
    });
    DB.set('products',products);this.renderInventario();
    this.toast(`Importación lista: ${add} nuevos, ${upd} actualizados`,'ok');
  },
  exportInventario(){
    const products=DB.get('products',[]);
    const data=products.map(p=>({Codigo:p.codigo,Nombre:p.nombre,Categoria:p.categoria,Unidad:p.unidad,
      Costo:p.costo,Precio:p.precio,PrecioBs:+this.toBs(p.precio).toFixed(2),Stock:p.stock,Min:p.min}));
    this.saveXlsx(data,'inventario_'+this.today(),'Inventario');
  },
  downloadTemplate(){
    const data=[{codigo:'7591',nombre:'EJEMPLO PRODUCTO',categoria:'Alimentos',unidad:'und',costo:0.5,precio:0.9,stock:100,min:5}];
    this.saveXlsx(data,'plantilla_inventario','Plantilla');
    this.toast('Plantilla descargada. Rellena y cárgala.','ok');
  },
  saveXlsx(data,name,sheet){
    if(typeof XLSX!=='undefined'){
      const ws=XLSX.utils.json_to_sheet(data);const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,sheet||'Hoja1');XLSX.writeFile(wb,name+'.xlsx');return;
    }
    // fallback: SpreadsheetML (.xls abre en Excel)
    const cols=data.length?Object.keys(data[0]):[];
    const row=o=>'<Row>'+cols.map(c=>{const v=o[c];const num=typeof v==='number';
      return `<Cell><Data ss:Type="${num?'Number':'String'}">${this.esc(v)}</Data></Cell>`;}).join('')+'</Row>';
    const xml=`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>`+
      `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`+
      `<Worksheet ss:Name="${sheet||'Hoja1'}"><Table><Row>`+
      cols.map(c=>`<Cell><Data ss:Type="String">${this.esc(c)}</Data></Cell>`).join('')+`</Row>`+
      data.map(row).join('')+`</Table></Worksheet></Workbook>`;
    this.download(xml,name+'.xls','application/vnd.ms-excel');
  },
  download(content,name,mime){
    const blob=new Blob(['\ufeff'+content],{type:(mime||'text/plain')+';charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
    document.body.appendChild(a);a.click();a.remove();
  },
  /* ================= POS / VENTAS ================= */
  posFilter:'',
  renderPOS(){
    document.getElementById('pg-pos').innerHTML=`
      <div class="ph"><h1>POS / Ventas</h1><p>Tasa BCV: <b>${this.rate()>0?this.fmtBs(this.rate()):'sin tasa'}</b> — Vendedor: ${this.esc(this.user.name)}</p></div>
      <div class="pos">
        <div class="card">
          <div class="toolbar"><div class="grow"><input class="search" placeholder="🔍 Buscar producto o código..." value="${this.esc(this.posFilter)}" oninput="App.posFilter=this.value;App.renderProdGrid()"></div></div>
          <div class="prod-grid" id="prod-grid"></div>
        </div>
        <div class="card cart"><h3>🛒 Carrito</h3><div id="cart-area"></div></div>
      </div>`;
    this.renderProdGrid();this.renderCart();
  },
  renderProdGrid(){
    const products=DB.get('products',[]);
    const f=this.posFilter.toLowerCase();
    const list=products.filter(p=>!f||p.nombre.toLowerCase().includes(f)||(p.codigo||'').toLowerCase().includes(f));
    const el=document.getElementById('prod-grid');if(!el)return;
    el.innerHTML=list.map(p=>`<button class="prod-tile ${p.stock<=0?'out':''}" onclick="App.addToCart('${p.id}')">
      <div class="pn">${this.esc(p.nombre)}</div>
      <div class="pp">${this.fmtUsd(p.precio)}</div>
      <div class="pb">${this.fmtBs(this.toBs(p.precio))}</div>
      <div class="ps">${p.stock<=0?'<span class="badge b-red">Agotado</span>':'Stock: '+(+p.stock.toFixed(2))}</div>
    </button>`).join('')||'<div class="empty">Sin productos</div>';
  },
  addToCart(id){
    const p=DB.get('products',[]).find(x=>x.id===id);if(!p)return;
    if(p.stock<=0){this.toast('Producto agotado','err');return;}
    const line=this.cart.find(c=>c.id===id);
    if(line){if(line.cantidad+1>p.stock){this.toast('No hay suficiente stock','err');return;}line.cantidad++;}
    else this.cart.push({id:p.id,codigo:p.codigo,nombre:p.nombre,precio:p.precio,costo:p.costo,cantidad:1,stock:p.stock});
    this.renderCart();
  },
  setQty(id,q){
    const line=this.cart.find(c=>c.id===id);if(!line)return;
    q=parseFloat(q);if(isNaN(q)||q<=0){this.cart=this.cart.filter(c=>c.id!==id);this.renderCart();return;}
    if(q>line.stock){this.toast('Stock disponible: '+line.stock,'err');q=line.stock;}
    line.cantidad=q;this.renderCart();
  },
  cartTotals(){
    let usd=0;this.cart.forEach(c=>usd+=c.precio*c.cantidad);
    const divisa=['efectivo_usd','usdt'].includes(this.payment);
    const igtf=(divisa&&this.cfg.igtfOn)?usd*(this.cfg.igtf/100):0;
    return {usd,igtf,totalUsd:usd+igtf,totalBs:this.toBs(usd+igtf)};
  },
  renderCart(){
    const el=document.getElementById('cart-area');if(!el)return;
    const t=this.cartTotals();
    el.innerHTML=`
      <div class="cart-items">${this.cart.length?this.cart.map(c=>`
        <div class="ci"><div class="cin"><b>${this.esc(c.nombre)}</b><small>${this.fmtUsd(c.precio)} • ${this.fmtBs(this.toBs(c.precio))}</small></div>
          <div class="qty"><button onclick="App.setQty('${c.id}',${c.cantidad-1})">−</button>
            <input type="number" step="0.001" value="${c.cantidad}" onchange="App.setQty('${c.id}',this.value)">
            <button onclick="App.setQty('${c.id}',${c.cantidad+1})">+</button></div></div>`).join(''):'<div class="empty">Carrito vacío</div>'}</div>
      <div class="pay-methods">${this.PAYS.map(p=>`<div class="pm ${this.payment===p.k?'sel':''}" onclick="App.payment='${p.k}';App.renderCart()">${p.ic} ${p.n}</div>`).join('')}</div>
      <div class="totbox">
        ${t.igtf>0?`<div class="totrow"><span>Subtotal</span><span>${this.fmtUsd(t.usd)}</span></div><div class="totrow"><span>IGTF (${this.cfg.igtf}%)</span><span>${this.fmtUsd(t.igtf)}</span></div>`:''}
        <div class="totrow big"><span>TOTAL</span><span><span class="usd">${this.fmtUsd(t.totalUsd)}</span></span></div>
        <div class="totrow big"><span></span><span>${this.fmtBs(t.totalBs)}</span></div>
        <button class="btn btn-green btn-block" style="margin-top:10px" onclick="App.checkout(false)">✅ Cobrar</button>
        <button class="btn btn-amber btn-block" style="margin-top:8px" onclick="App.checkout(true)">📝 Vender a Crédito / Fiado</button>
        ${this.cart.length?`<button class="btn btn-ghost btn-block btn-sm" style="margin-top:8px" onclick="App.cart=[];App.renderCart()">Vaciar carrito</button>`:''}
      </div>`;
  },
  checkout(fiado){
    if(!this.cart.length){this.toast('El carrito está vacío','err');return;}
    if(this.rate()<=0){this.toast('Configure la tasa BCV antes de vender','err');return;}
    const t=this.cartTotals();
    if(fiado){
      const clients=DB.get('clients',[]);
      this.modal(`<div class="modal-head"><h3>📝 Venta a Crédito</h3><button class="icon-btn" onclick="App.closeModal()">✕</button></div>
        <div class="modal-body">
          <div class="field"><label>Cliente *</label><input id="c-nom" list="cl-list" placeholder="Nombre del cliente"><datalist id="cl-list">${clients.map(c=>`<option value="${this.esc(c.nombre)}">`).join('')}</datalist></div>
          <div class="field"><label>Teléfono (WhatsApp) *</label><input id="c-tel" placeholder="Ej: 04141234567"></div>
          <div class="row2"><div class="field"><label>Fecha de vencimiento</label><input id="c-ven" type="date" value="${new Date(Date.now()+7*864e5).toISOString().slice(0,10)}"></div>
          <div class="field"><label>Abono inicial ($)</label><input id="c-abo" type="number" step="0.01" value="0"></div></div>
          <div class="card" style="background:#f8fafc"><b>Total a crédito: ${this.fmtUsd(t.totalUsd)}</b><br><small>${this.fmtBs(t.totalBs)}</small></div>
        </div>
        <div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
          <button class="btn btn-amber" onclick="App.confirmSale(true)">Registrar fiado</button></div>`);
      // auto completar telefono
      setTimeout(()=>{const inp=document.getElementById('c-nom');inp&&inp.addEventListener('change',()=>{
        const c=clients.find(x=>x.nombre===inp.value);if(c)document.getElementById('c-tel').value=c.telefono||'';});},50);
      return;
    }
    this.modal(`<div class="modal-head"><h3>✅ Confirmar Cobro</h3><button class="icon-btn" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="totrow big"><span>Total:</span><span class="usd">${this.fmtUsd(t.totalUsd)}</span></div>
        <div class="totrow big"><span></span><span>${this.fmtBs(t.totalBs)}</span></div>
        <p style="margin-top:10px;color:var(--muted)">Método: <b>${this.payName(this.payment)}</b></p>
        ${this.payment==='efectivo_bs'?`<div class="field" style="margin-top:10px"><label>Paga con (Bs)</label><input id="c-paga" type="number" oninput="App.calcVuelto(${t.totalBs})"></div><div id="vuelto" style="font-weight:700"></div>`:''}
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-green" onclick="App.confirmSale(false)">Finalizar venta</button></div>`);
  },
  calcVuelto(totalBs){
    const paga=+document.getElementById('c-paga').value||0;
    const v=paga-totalBs;
    document.getElementById('vuelto').textContent=v>=0?'Vuelto: '+this.fmtBs(v):'Falta: '+this.fmtBs(-v);
  },
  confirmSale(fiado){
    const products=DB.get('products',[]);
    for(const c of this.cart){const p=products.find(x=>x.id===c.id);
      if(!p||p.stock<c.cantidad){this.toast('Stock insuficiente: '+c.nombre,'err');return;}}
    const t=this.cartTotals();
    let cliente='',telefono='',vence='',abonado=0;
    if(fiado){
      cliente=document.getElementById('c-nom').value.trim();
      telefono=document.getElementById('c-tel').value.trim();
      vence=document.getElementById('c-ven').value;
      abonado=+document.getElementById('c-abo').value||0;
      if(!cliente||!telefono){this.toast('Cliente y teléfono son obligatorios','err');return;}
      const clients=DB.get('clients',[]);
      if(!clients.find(x=>x.nombre===cliente)){clients.push({id:this.uid(),nombre:cliente,telefono});DB.set('clients',clients);}
    }
    // descontar stock
    this.cart.forEach(c=>{const p=products.find(x=>x.id===c.id);p.stock=+(p.stock-c.cantidad).toFixed(3);});
    DB.set('products',products);
    const sale={id:this.uid(),fecha:new Date().toISOString(),vendedor:this.user.name,
      items:this.cart.map(c=>({id:c.id,codigo:c.codigo,nombre:c.nombre,precio:c.precio,costo:c.costo,cantidad:c.cantidad})),
      metodo:fiado?'fiado':this.payment,tipo:fiado?'fiado':'contado',tasa:this.rate(),
      igtf:t.igtf,totalUsd:t.totalUsd,totalBs:t.totalBs,
      cliente,telefono,vence,abonado,pagado:!fiado};
    const sales=DB.get('sales',[]);sales.push(sale);DB.set('sales',sales);
    this.cart=[];this.payment='efectivo_bs';this.closeModal();this.renderPOS();this.refreshAll();
    this.toast(fiado?'Venta a crédito registrada':'Venta registrada ✔️','ok');
  },
  /* ================= REPORTES ================= */
  repDate:null,
  renderReportes(){
    if(!this.repDate)this.repDate=this.today();
    const sales=DB.get('sales',[]).filter(s=>s.fecha.slice(0,10)===this.repDate);
    let totUsd=0,totBs=0,costUsd=0,uds=0;
    const porMetodo={};
    sales.forEach(s=>{
      totUsd+=s.totalUsd;totBs+=s.totalBs;
      s.items.forEach(it=>{costUsd+=it.costo*it.cantidad;uds+=it.cantidad;});
      porMetodo[s.metodo]=(porMetodo[s.metodo]||0)+s.totalBs;
    });
    const ganancia=totUsd-costUsd;
    document.getElementById('pg-reportes').innerHTML=`
      <div class="ph"><h1>Reportes</h1><p>Reporte de ventas por día. Exporta a Excel con un clic.</p></div>
      <div class="toolbar">
        <div class="field" style="margin:0"><input class="search" type="date" value="${this.repDate}" onchange="App.repDate=this.value;App.renderReportes()"></div>
        <button class="btn btn-green btn-sm" onclick="App.exportReporte()">📊 Exportar reporte a Excel</button>
      </div>
      <div class="grid g3" style="margin-bottom:16px">
        <div class="card"><div class="stat bl"><span class="lbl">Ventas del día</span><span class="big">${sales.length}</span><span class="sub">${(+uds.toFixed(2))} unidades</span></div></div>
        <div class="card"><div class="stat"><span class="lbl">Total vendido</span><span class="big">${this.fmtBs(totBs)}</span><span class="sub">${this.fmtUsd(totUsd)}</span></div></div>
        <div class="card"><div class="stat gr"><span class="lbl">Ganancia estimada</span><span class="big">${this.fmtUsd(ganancia)}</span><span class="sub">${this.fmtBs(this.toBs(ganancia))}</span></div></div>
      </div>
      <div class="grid g2" style="margin-bottom:16px">
        <div class="card"><h3>💳 Ingresos por método de pago (Bs)</h3><ul class="rank">${
          Object.keys(porMetodo).length?Object.entries(porMetodo).map(([k,v])=>`<li><span>${this.payName(k)}</span><span class="q">${this.fmtBs(v)}</span></li>`).join(''):'<li class="empty">Sin datos</li>'}</ul></div>
        <div class="card"><h3>ℹ️ Resumen</h3><ul class="rank"><li><span>Tasa BCV usada</span><span class="q">${this.fmtBs(this.rate())}</span></li><li><span>Fecha</span><span class="q">${this.repDate}</span></li></ul></div>
      </div>
      <div class="card pad0"><div class="table-wrap"><table><thead><tr><th>Hora</th><th>Vendedor</th><th>Productos</th><th>Método</th><th>Tipo</th><th class="right">Total $</th><th class="right">Total Bs</th></tr></thead><tbody>${
        sales.length?sales.map(s=>`<tr><td>${new Date(s.fecha).toLocaleTimeString('es-VE')}</td><td>${this.esc(s.vendedor)}</td>
          <td>${s.items.map(i=>this.esc(i.nombre)+' x'+(+i.cantidad.toFixed(2))).join(', ')}</td>
          <td>${this.payName(s.metodo)}</td><td>${s.tipo==='fiado'?'<span class="badge b-amber">Fiado</span>':'<span class="badge b-green">Contado</span>'}</td>
          <td class="right">${this.fmtUsd(s.totalUsd)}</td><td class="right">${this.fmtBs(s.totalBs)}</td></tr>`).join(''):'<tr><td colspan="7" class="empty">Sin ventas en esta fecha</td></tr>'}</tbody></table></div></div>`;
  },
  exportReporte(){
    const sales=DB.get('sales',[]).filter(s=>s.fecha.slice(0,10)===this.repDate);
    if(!sales.length){this.toast('No hay ventas en esta fecha','err');return;}
    const data=[];
    sales.forEach(s=>s.items.forEach(it=>{
      data.push({Fecha:new Date(s.fecha).toLocaleString('es-VE'),Vendedor:s.vendedor,Codigo:it.codigo,
        Producto:it.nombre,Cantidad:+it.cantidad.toFixed(3),PrecioUSD:it.precio,PrecioBs:+this.toBs(it.precio).toFixed(2),
        SubtotalUSD:+(it.precio*it.cantidad).toFixed(2),SubtotalBs:+this.toBs(it.precio*it.cantidad).toFixed(2),
        Metodo:this.payName(s.metodo),Tipo:s.tipo,Cliente:s.cliente||'',TasaBCV:s.tasa});
    }));
    this.saveXlsx(data,'reporte_'+this.repDate,'Reporte '+this.repDate);
    this.toast('Reporte exportado a Excel','ok');
  },
  /* ================= COBRANZA / FIADOS ================= */
  renderCobranza(){
    const sales=DB.get('sales',[]);
    const fiados=sales.filter(s=>s.tipo==='fiado'&&(s.totalUsd-(s.abonado||0))>0.001);
    const today=this.today();
    let totalDeuda=0;fiados.forEach(s=>totalDeuda+=s.totalUsd-(s.abonado||0));
    document.getElementById('pg-cobranza').innerHTML=`
      <div class="ph"><h1>Cobranza / Fiados</h1><p>Cuentas por cobrar. Envía la nota de cobro por WhatsApp con un clic.</p></div>
      <div class="grid g3" style="margin-bottom:16px">
        <div class="card"><div class="stat rd"><span class="lbl">Deuda total por cobrar</span><span class="big">${this.fmtUsd(totalDeuda)}</span><span class="sub">${this.fmtBs(this.toBs(totalDeuda))}</span></div></div>
        <div class="card"><div class="stat"><span class="lbl">Cuentas abiertas</span><span class="big">${fiados.length}</span><span class="sub">clientes con saldo</span></div></div>
        <div class="card"><div class="stat amber"><span class="lbl">Vencidas</span><span class="big">${fiados.filter(s=>s.vence&&s.vence<today).length}</span><span class="sub">requieren cobro</span></div></div>
      </div>
      <div class="card pad0"><div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Fecha</th><th>Vence</th><th class="right">Deuda</th><th>Estado</th><th></th></tr></thead><tbody>${
        fiados.length?fiados.map(s=>{const saldo=s.totalUsd-(s.abonado||0);const venc=s.vence&&s.vence<today;
        return `<tr><td><b>${this.esc(s.cliente)}</b></td><td>${this.esc(s.telefono||'')}</td>
          <td>${s.fecha.slice(0,10)}</td><td>${s.vence||'—'}</td>
          <td class="right"><b>${this.fmtUsd(saldo)}</b><br><small>${this.fmtBs(this.toBs(saldo))}</small></td>
          <td>${venc?'<span class="badge b-red">Vencida</span>':'<span class="badge b-blue">Al día</span>'}</td>
          <td><div class="t-actions">
            <button class="icon-btn" title="Abonar" onclick="App.abonar('${s.id}')">💵</button>
            <button class="icon-btn" title="WhatsApp" style="background:#dcfce7" onclick="App.whatsappCobro('${s.id}')">💬</button>
          </div></td></tr>`;}).join(''):'<tr><td colspan="7" class="empty">No hay cuentas por cobrar 🎉</td></tr>'}</tbody></table></div></div>`;
  },
  abonar(id){
    const s=DB.get('sales',[]).find(x=>x.id===id);if(!s)return;
    const saldo=s.totalUsd-(s.abonado||0);
    this.modal(`<div class="modal-head"><h3>Registrar abono</h3><button class="icon-btn" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body"><p>Cliente: <b>${this.esc(s.cliente)}</b></p><p style="margin:8px 0">Saldo actual: <b>${this.fmtUsd(saldo)}</b> (${this.fmtBs(this.toBs(saldo))})</p>
        <div class="field"><label>Monto del abono ($)</label><input id="ab-monto" type="number" step="0.01" max="${saldo}" value="${saldo.toFixed(2)}"></div></div>
      <div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-green" onclick="App.saveAbono('${id}')">Guardar abono</button></div>`);
  },
  saveAbono(id){
    const sales=DB.get('sales',[]);const s=sales.find(x=>x.id===id);
    const m=+document.getElementById('ab-monto').value||0;
    if(m<=0){this.toast('Monto inválido','err');return;}
    s.abonado=Math.min(s.totalUsd,(s.abonado||0)+m);
    if(s.abonado>=s.totalUsd-0.001)s.pagado=true;
    DB.set('sales',sales);this.closeModal();this.renderCobranza();this.refreshAll();this.toast('Abono registrado','ok');
  },
  whatsappCobro(id){
    const s=DB.get('sales',[]).find(x=>x.id===id);if(!s)return;
    const saldo=s.totalUsd-(s.abonado||0);
    const tel=(s.telefono||'').replace(/[^0-9]/g,'');
    let fono=tel;if(fono.startsWith('0'))fono='58'+fono.slice(1);else if(!fono.startsWith('58')&&fono.length<=11)fono='58'+fono;
    const prods=s.items.map(i=>'• '+i.nombre+' x'+(+i.cantidad.toFixed(2))).join('\n');
    const venc=s.vence&&s.vence<this.today();
    const msg=`*${this.cfg.storeName} — Nota de Cobro*\n\n`+
      `Hola ${s.cliente}, le recordamos su cuenta pendiente${venc?' *(VENCIDA el '+s.vence+')*':''}:\n\n`+
      `${prods}\n\n`+
      `Saldo a pagar: *${this.fmtUsd(saldo)}*\n`+
      `Equivalente: *${this.fmtBs(this.toBs(saldo))}* (tasa BCV ${this.fmtBs(this.rate())})\n`+
      `Fecha de compra: ${s.fecha.slice(0,10)}\n\n`+
      `Agradecemos su pronto pago. ¡Gracias por su preferencia! 🙏`;
    const url='https://wa.me/'+fono+'?text='+encodeURIComponent(msg);
    window.open(url,'_blank');
  },
  /* ================= CONFIGURACION ================= */
  renderConfig(){
    const c=this.cfg;const users=DB.get('users',[]);
    document.getElementById('pg-config').innerHTML=`
      <div class="ph"><h1>Configuración</h1><p>Ajustes del negocio, tasa del dólar y usuarios.</p></div>
      <div class="grid g2">
        <div class="card"><h3>🏪 Datos del negocio</h3>
          <div class="field"><label>Nombre del negocio</label><input id="cf-name" value="${this.esc(c.storeName)}"></div>
          <div class="field"><label>Teléfono / WhatsApp</label><input id="cf-phone" value="${this.esc(c.phone||'')}"></div>
          <div class="field"><label>Stock mínimo (alerta crítico)</label><input id="cf-min" type="number" value="${c.stockMin||3}"></div>
          <button class="btn btn-primary" onclick="App.saveConfigBiz()">Guardar datos</button>
        </div>
        <div class="card"><h3>💲 Tasa del dólar</h3>
          <div class="field"><label><input type="checkbox" id="cf-manual" ${c.bcvManual?'checked':''}> Usar tasa manual (no actualizar automático)</label></div>
          <div class="field"><label>Tasa BCV actual (Bs por $)</label><input id="cf-rate" type="number" step="0.01" value="${c.bcvRate}"></div>
          <div class="field"><label><input type="checkbox" id="cf-igtfon" ${c.igtfOn?'checked':''}> Cobrar IGTF en divisas/USDT</label></div>
          <div class="field"><label>IGTF (%)</label><input id="cf-igtf" type="number" step="0.1" value="${c.igtf}"></div>
          <button class="btn btn-primary" onclick="App.saveConfigRate()">Guardar tasa</button>
          <button class="btn btn-ghost" onclick="App.fetchRate(false)">🔄 Traer tasa BCV online</button>
        </div>
      </div>
      <div class="card" style="margin-top:16px"><h3>👥 Usuarios</h3>
        <div class="table-wrap"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th></th></tr></thead><tbody>${
          users.map(u=>`<tr><td>${this.esc(u.username)}</td><td>${this.esc(u.name)}</td><td>${u.role==='master'?'<span class="badge b-blue">Master</span>':'<span class="badge b-gray">Vendedor</span>'}</td>
          <td><div class="t-actions"><button class="icon-btn" onclick="App.editUser('${u.id}')">✏️</button>${users.length>1?`<button class="icon-btn" onclick="App.delUser('${u.id}')">🗑️</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>
        <button class="btn btn-green btn-sm" style="margin-top:12px" onclick="App.editUser()">➕ Nuevo usuario</button>
      </div>
      <div class="card" style="margin-top:16px"><h3>💾 Respaldo de datos</h3>
        <p style="color:var(--muted);font-size:13px;margin-bottom:10px">Guarda o restaura todos los datos (productos, ventas, fiados, config).</p>
        <button class="btn btn-ghost btn-sm" onclick="App.backup()">⬇️ Descargar respaldo</button>
        <button class="btn btn-ghost btn-sm" onclick="App.restore()">⬆️ Restaurar respaldo</button>
      </div>`;
  },
  saveConfigBiz(){
    this.cfg.storeName=document.getElementById('cf-name').value.trim()||'Mi Bodega';
    this.cfg.phone=document.getElementById('cf-phone').value.trim();
    this.cfg.stockMin=+document.getElementById('cf-min').value||3;
    DB.set('config',this.cfg);document.getElementById('sb-store').textContent=this.cfg.storeName;
    this.toast('Datos guardados','ok');this.renderDashboard();
  },
  saveConfigRate(){
    this.cfg.bcvManual=document.getElementById('cf-manual').checked;
    this.cfg.bcvRate=+document.getElementById('cf-rate').value||0;
    this.cfg.igtfOn=document.getElementById('cf-igtfon').checked;
    this.cfg.igtf=+document.getElementById('cf-igtf').value||0;
    if(this.cfg.bcvManual)this.cfg.bcvDate=this.nowLabel()+' (manual)';
    DB.set('config',this.cfg);this.toast('Tasa guardada','ok');this.renderDashboard();
  },
  editUser(id){
    const users=DB.get('users',[]);const u=id?users.find(x=>x.id===id):{username:'',name:'',password:'',role:'vendedor'};
    this.modal(`<div class="modal-head"><h3>${id?'Editar':'Nuevo'} usuario</h3><button class="icon-btn" onclick="App.closeModal()">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Nombre</label><input id="us-name" value="${this.esc(u.name)}"></div>
        <div class="field"><label>Usuario</label><input id="us-user" value="${this.esc(u.username)}"></div>
        <div class="field"><label>Contraseña</label><input id="us-pass" value="${this.esc(u.password)}"></div>
        <div class="field"><label>Rol</label><select id="us-role"><option value="vendedor" ${u.role==='vendedor'?'selected':''}>Vendedor</option><option value="master" ${u.role==='master'?'selected':''}>Master / Admin</option></select></div>
      </div>
      <div class="modal-foot"><button class="btn btn-ghost" onclick="App.closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="App.saveUser('${id||''}')">Guardar</button></div>`);
  },
  saveUser(id){
    const users=DB.get('users',[]);
    const name=document.getElementById('us-name').value.trim();
    const username=document.getElementById('us-user').value.trim();
    const password=document.getElementById('us-pass').value;
    const role=document.getElementById('us-role').value;
    if(!name||!username||!password){this.toast('Complete todos los campos','err');return;}
    if(users.find(x=>x.username===username&&x.id!==id)){this.toast('Ese usuario ya existe','err');return;}
    if(id){Object.assign(users.find(x=>x.id===id),{name,username,password,role});}
    else users.push({id:this.uid(),name,username,password,role});
    DB.set('users',users);this.closeModal();this.renderConfig();this.toast('Usuario guardado','ok');
  },
  delUser(id){
    if(id===this.user.id){this.toast('No puede eliminar su propio usuario','err');return;}
    if(!confirm('¿Eliminar usuario?'))return;
    DB.set('users',DB.get('users',[]).filter(x=>x.id!==id));this.renderConfig();this.toast('Usuario eliminado','ok');
  },
  /* ---------- respaldo ---------- */
  backup(){
    const data={users:DB.get('users',[]),config:DB.get('config',{}),products:DB.get('products',[]),
      sales:DB.get('sales',[]),clients:DB.get('clients',[]),_v:1,_date:this.nowLabel()};
    this.download(JSON.stringify(data,null,2),'respaldo_mibodega_'+this.today()+'.json','application/json');
    this.toast('Respaldo descargado','ok');
  },
  restore(){
    const inp=document.createElement('input');inp.type='file';inp.accept='.json';
    inp.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
      r.onload=ev=>{try{const d=JSON.parse(ev.target.result);
        if(!confirm('Esto reemplazará todos los datos actuales. ¿Continuar?'))return;
        if(d.users)DB.set('users',d.users);if(d.config)DB.set('config',d.config);
        if(d.products)DB.set('products',d.products);if(d.sales)DB.set('sales',d.sales);
        if(d.clients)DB.set('clients',d.clients);
        this.toast('Respaldo restaurado','ok');setTimeout(()=>location.reload(),800);
      }catch(err){this.toast('Archivo inválido','err');}};
      r.readAsText(f);};
    inp.click();
  },

  /* ---------- init ---------- */
  init(){
    this.seed();
    this.cfg=DB.get('config');
    const sid=DB.get('session');
    const users=DB.get('users',[]);
    document.getElementById('lg-hint').innerHTML='Usuarios de prueba:<br><b>master</b> / admin123 &nbsp;—&nbsp; <b>vendedor</b> / vende123';
    document.getElementById('lg-pass').addEventListener('keydown',e=>{if(e.key==='Enter')this.login();});
    if(sid){const u=users.find(x=>x.id===sid);if(u){this.user=u;this.enterApp();}}
    if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}
  }
};
window.addEventListener('DOMContentLoaded',()=>App.init());

