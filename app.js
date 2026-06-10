// ══════════════════════════════════════════
//  JR VENTAS v2.0 — app.js
//  Toda la lógica de la aplicación
// ══════════════════════════════════════════

var invFiltroActual = 'todos';

// ══════════════════════════════════════════
//  ESTADO
// ══════════════════════════════════════════
var META = 500;
var selectedTipo = 'venta';
var stkOpActual = 'sumar';
var pedidoTab = 'pendiente';
var currentDate = new Date();
var currentPage = 'resumen';
var data = {};      // data[YYYY-MM-DD] = {ventas,gastos,pedidos}
var productos = []; // inventario global
// pedidos especiales globales (multi-día)
var pedidosGlobal = [];
// encargos
var encargos = [];
// fondos diarios {YYYY-MM-DD: monto}
var fondos = {};
// items temporales de venta multi-producto
var ventaItems = [];
// items temporales de pedido multi-producto
var pedidoItems = [];

// ── FIREBASE CONFIG ──
var firebaseConfig = {
  apiKey: "AIzaSyA3Y95NMaWUpKGjoVJZ3Mdc9MA-7p2QWPw",
  authDomain: "jrventa-72523.firebaseapp.com",
  projectId: "jrventa-72523",
  storageBucket: "jrventa-72523.firebasestorage.app",
  messagingSenderId: "293349390874",
  appId: "1:293349390874:web:442a06af6f0e405bc32fa3"
};
firebase.initializeApp(firebaseConfig);
var db = firebase.firestore();
var DB_DOC = 'negocio/principal'; // único documento con todos los datos
var fbOnline = false;
var syncPending = false;

// ── PERSISTENCIA (localStorage + Firebase) ──
function loadData() {
  try { var s=localStorage.getItem('cvd_data'); if(s) data=JSON.parse(s); } catch(e){data={};}
  try { var s=localStorage.getItem('cvd_productos'); if(s) productos=JSON.parse(s); } catch(e){productos=[];}
  try { var s=localStorage.getItem('cvd_pedidos'); if(s) pedidosGlobal=JSON.parse(s); } catch(e){pedidosGlobal=[];}
  try { var s=localStorage.getItem('cvd_encargos'); if(s) encargos=JSON.parse(s); } catch(e){encargos=[];}
  try { var s=localStorage.getItem('cvd_fondos'); if(s) fondos=JSON.parse(s); } catch(e){fondos={};}
}

// Guarda en localStorage Y programa sync a Firebase
function saveData(){ _lsSave('cvd_data', data); _fbSync(); }
function saveProductos(){ _lsSave('cvd_productos', productos); _fbSync(); }
function savePedidos(){ _lsSave('cvd_pedidos', pedidosGlobal); _fbSync(); }
function saveEncargos(){ _lsSave('cvd_encargos', encargos); _fbSync(); }
function saveFondos(){ _lsSave('cvd_fondos', fondos); _fbSync(); }

function _lsSave(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); } catch(e){ toast('⚠ Error al guardar localmente'); }
}

// Debounce: agrupa múltiples saves en un solo write a Firebase (500ms)
var _fbTimer = null;
function _fbSync(){
  syncPending = true;
  updateSyncIndicator();
  clearTimeout(_fbTimer);
  _fbTimer = setTimeout(function(){ _fbWrite(); }, 500);
}

function _fbWrite(){
  if(!fbOnline) return;
  var payload = {
    data: JSON.stringify(data),
    productos: JSON.stringify(productos),
    pedidos: JSON.stringify(pedidosGlobal),
    encargos: JSON.stringify(encargos),
    fondos: JSON.stringify(fondos),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  db.doc(DB_DOC).set(payload).then(function(){
    syncPending = false;
    updateSyncIndicator();
  }).catch(function(err){
    console.error('Firebase write error:', err);
    updateSyncIndicator();
  });
}

// Carga desde Firebase (sobrescribe localStorage si Firebase tiene datos más recientes)
function _fbLoad(){
  db.doc(DB_DOC).get().then(function(doc){
    fbOnline = true;
    if(doc.exists){
      var d = doc.data();
      // Solo sobrescribir si Firebase tiene datos
      try{ if(d.data) { data=JSON.parse(d.data); localStorage.setItem('cvd_data',d.data); } }catch(e){}
      try{ if(d.productos) { productos=JSON.parse(d.productos); localStorage.setItem('cvd_productos',d.productos); } }catch(e){}
      try{ if(d.pedidos) { pedidosGlobal=JSON.parse(d.pedidos); localStorage.setItem('cvd_pedidos',d.pedidos); } }catch(e){}
      try{ if(d.encargos) { encargos=JSON.parse(d.encargos); localStorage.setItem('cvd_encargos',d.encargos); } }catch(e){}
      try{ if(d.fondos) { fondos=JSON.parse(d.fondos); localStorage.setItem('cvd_fondos',d.fondos); } }catch(e){}
      renderAll();
      updateSyncIndicator();
      migrarDatos(true); // migrar silenciosamente y escribir de vuelta a Firebase
      toast('☁ Sincronizado');
    } else {
      // Firebase vacío → subir los datos locales existentes
      _fbWrite();
      toast('☁ Datos locales migrados a la nube');
    }
  }).catch(function(err){
    fbOnline = false;
    console.warn('Firebase no disponible, usando datos locales:', err);
    updateSyncIndicator();
  });
}

function updateSyncIndicator(){
  var el = document.getElementById('syncIndicator');
  if(!el) return;
  if(!fbOnline){
    el.textContent = '⚡ Local';
    el.style.color = 'var(--text-muted)';
  } else if(syncPending){
    el.textContent = '↑ Sync...';
    el.style.color = 'var(--amber)';
  } else {
    el.textContent = '☁ Sync';
    el.style.color = 'var(--green)';
  }
}

function openFondoModal(){
  var k=dateKey(currentDate);
  document.getElementById('fondoInput').value=fondos[k]||'';
  document.getElementById('fondoModal').classList.add('open');
}
function saveFondo(){
  var k=dateKey(currentDate);
  var v=parseFloat(document.getElementById('fondoInput').value)||0;
  fondos[k]=v;
  saveFondos();
  closeModal('fondoModal');
  updateFondoLabel();
  toast('✓ Efectivo guardado');
}
function updateFondoLabel(){
  var k=dateKey(currentDate);
  var v=fondos[k]||0;
  document.getElementById('fondoLabel').textContent=v>0?fmt(v):'$0.00';
}

function openFondoInicialModal(){
  if(fondos['inicial']!=null) return; // ya registrado, no se puede editar
  document.getElementById('fondoInicialInput').value='';
  document.getElementById('fondoInicialDate').value=dateKey(new Date());
  document.getElementById('fondoInicialModal').classList.add('open');
}
function saveFondoInicial(){
  var v=parseFloat(document.getElementById('fondoInicialInput').value)||0;
  var fecha=document.getElementById('fondoInicialDate').value||dateKey(new Date());
  if(v<=0){toast('⚠ Ingresa un monto válido');return;}
  fondos['inicial']=v;
  fondos['inicialFecha']=fecha;
  saveFondos();
  closeModal('fondoInicialModal');
  renderResumen();
  toast('✓ Capital inicial registrado');
}

// ── HELPERS ──
function dateKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function getDayData(d){ var k=dateKey(d); if(!data[k])data[k]={ventas:[],gastos:[],pedidos:[]}; return data[k]; }
function fmt(n){ return '$'+Number(n).toFixed(2); }
function fmtShort(n){ return n>=1000?'$'+(n/1000).toFixed(1)+'k':fmt(n); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function cap(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function getProducto(id){ for(var i=0;i<productos.length;i++){if(productos[i].id===id)return productos[i];}return null; }
function getPedido(id){ for(var i=0;i<pedidosGlobal.length;i++){if(pedidosGlobal[i].id===id)return pedidosGlobal[i];}return null; }

// ── SEMANA ──
function getLunes(d){
  var day=new Date(d); var dow=day.getDay(); var diff=dow===0?-6:1-dow;
  day.setDate(day.getDate()+diff); day.setHours(0,0,0,0); return day;
}
function getWeekDays(d){
  var lun=getLunes(d); var days=[];
  for(var i=0;i<7;i++){ var dd=new Date(lun); dd.setDate(lun.getDate()+i); days.push(dd); }
  return days;
}

// ══════════════════════════════════════════
//  NAVEGACIÓN
// ══════════════════════════════════════════
function showPage(name,btn){
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('active');});
  document.getElementById('page-'+name).classList.add('active');
  if(btn) btn.classList.add('active');
  currentPage=name;
  renderPage(name);
  var hideFab=(name==='historial'||name==='inventario'||name==='encargos'||name==='reportes');
  document.getElementById('fabBtn').style.display=hideFab?'none':'flex';
}

// ══════════════════════════════════════════
//  FECHA
// ══════════════════════════════════════════
function updateHeaderDate(){
  document.getElementById('headerDate').textContent=currentDate.toLocaleDateString('es-SV',{day:'2-digit',month:'2-digit',year:'numeric'});
  var sub=document.getElementById('resumeDateSub');
  if(sub) sub.textContent=currentDate.toLocaleDateString('es-SV',{weekday:'long',day:'numeric',month:'long'});
}
function openDateModal(){ document.getElementById('dateInput').value=dateKey(currentDate); document.getElementById('dateModal').classList.add('open'); }
function applyDate(){
  var v=document.getElementById('dateInput').value;
  if(v){var p=v.split('-');currentDate=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));}
  closeModal('dateModal'); updateHeaderDate(); updateFondoLabel(); renderAll();
}

// ══════════════════════════════════════════
//  MODALES
// ══════════════════════════════════════════
function closeModal(id){document.getElementById(id).classList.remove('open');}
function overlayClose(e,id){if(e.target===document.getElementById(id))closeModal(id);}

// ─ Modal registro ─
function openAddModal(){
  ventaItems=[];
  pedidoItems=[];
  setTipo('venta');
  document.getElementById('fDesc').value='';
  document.getElementById('fCant').value='1';
  document.getElementById('fMonto').value='';
  document.getElementById('ventaProductoSel').value='';
  document.getElementById('ventaStockInfo').style.display='none';
  poblarSelectProductos('ventaProductoSel');
  poblarSelectProductos('pedidoProductoSel');
  renderVentaItems();
  renderPedidoItems();
  document.getElementById('addModal').classList.add('open');
}

function poblarSelectProductos(selId){
  var sel=document.getElementById(selId);
  sel.innerHTML='<option value="">— Seleccionar producto —</option>';
  productos.forEach(function(p){
    var opt=document.createElement('option');
    opt.value=p.id;
    opt.textContent=p.nombre+' (stock: '+p.cantidad+' '+p.unidad+')';
    sel.appendChild(opt);
  });
}

function setTipo(t){
  selectedTipo=t;
  ['Venta','Gasto','Pedido'].forEach(function(x){document.getElementById('tBtn'+x).classList.remove('active');});
  document.getElementById('tBtn'+cap(t)).classList.add('active');
  document.getElementById('pedidoWrap').style.display=(t==='pedido')?'block':'none';
  document.getElementById('ventaProductoWrap').style.display=(t==='venta')?'block':'none';
  document.getElementById('ventaItemsWrap').style.display=(t==='venta')?'block':'none';
  document.getElementById('gastoWrap').style.display=(t==='gasto')?'block':'none';
  if(t==='venta') renderVentaItems();
  if(t==='pedido') renderPedidoItems();
}

function onProductoSelChange(){
  var pid=parseInt(document.getElementById('ventaProductoSel').value);
  var info=document.getElementById('ventaStockInfo');
  if(!pid){info.style.display='none';return;}
  var p=getProducto(pid);
  if(!p){info.style.display='none';return;}
  info.style.display='block';
  info.innerHTML='Precio venta: <strong>'+fmt(p.precioVenta)+'</strong> &nbsp;|&nbsp; Stock: <strong>'+p.cantidad+' '+p.unidad+'</strong>';
  document.getElementById('fMonto').value=p.precioVenta>0?p.precioVenta:'';
  document.getElementById('fDesc').value=p.nombre;
  onCantChange();
}

function onCantChange(){
  var cant=parseFloat(document.getElementById('fCant').value)||1;
  // Venta: usa precioVenta
  var pidV=parseInt(document.getElementById('ventaProductoSel').value);
  if(pidV){ var pV=getProducto(pidV); if(pV) document.getElementById('fMonto').value=(pV.precioVenta*cant).toFixed(2); return; }
  // Pedido: usa precioCosto
  if(selectedTipo==='pedido'){
    var pidP=parseInt(document.getElementById('pedidoProductoSel').value);
    if(pidP){ var pP=getProducto(pidP); if(pP&&pP.precioCosto>0) document.getElementById('fMonto').value=(pP.precioCosto*cant).toFixed(2); }
  }
}

// Multi-producto: agregar item a la lista de venta
function agregarItemVenta(){
  var pid=parseInt(document.getElementById('ventaProductoSel').value);
  var cant=parseFloat(document.getElementById('fCant').value)||1;
  var monto=parseFloat(document.getElementById('fMonto').value)||0;
  var desc=document.getElementById('fDesc').value.trim();
  if(cant<=0){toast('⚠ Ingresa una cantidad válida');return;}
  if(monto<=0){toast('⚠ Ingresa un monto válido');return;}
  if(!desc) desc='Venta';
  var prod=pid?getProducto(pid):null;
  if(prod && cant>prod.cantidad){toast('⚠ Stock insuficiente ('+prod.cantidad+' '+prod.unidad+' disponibles)');return;}
  ventaItems.push({productoId:prod?prod.id:null,productoNombre:prod?prod.nombre:null,desc:desc,cant:cant,monto:monto});
  // reset campos
  document.getElementById('ventaProductoSel').value='';
  document.getElementById('ventaStockInfo').style.display='none';
  document.getElementById('fDesc').value='';
  document.getElementById('fCant').value='1';
  document.getElementById('fMonto').value='';
  renderVentaItems();
}

function removeVentaItem(i){
  ventaItems.splice(i,1);
  renderVentaItems();
}

function renderVentaItems(){
  var el=document.getElementById('ventaItemsList');
  if(!ventaItems.length){
    el.innerHTML='<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:8px;background:var(--surface2);border-radius:var(--r-sm)">Selecciona un producto y presiona <strong>+ Agregar</strong>, o registra una venta manual abajo.</div>';
    return;
  }
  var total=ventaItems.reduce(function(a,x){return a+x.monto;},0);
  var html='';
  ventaItems.forEach(function(it,i){
    html+='<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border-radius:var(--r-sm);border:1px solid var(--border)">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:13px;font-weight:500">'+esc(it.desc)+'</div>'+
        '<div style="font-size:11px;color:var(--text-muted)">Cant: '+it.cant+(it.productoNombre?' &middot; '+esc(it.productoNombre):'')+'</div>'+
      '</div>'+
      '<div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--green);font-weight:500">'+fmt(it.monto)+'</div>'+
      '<button onclick="removeVentaItem('+i+')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;padding:2px 4px;line-height:1">×</button>'+
    '</div>';
  });
  html+='<div style="text-align:right;font-size:13px;font-weight:700;color:var(--primary);padding:4px 2px">Total: '+fmt(total)+'</div>';
  el.innerHTML=html;
}

// ─ Guardar registro ─
function saveRecord(){
  var desc=document.getElementById('fDesc').value.trim();
  var cant=parseFloat(document.getElementById('fCant').value)||1;
  var monto=parseFloat(document.getElementById('fMonto').value);
  var ahora=new Date();
  var hora=ahora.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'});
  var day=getDayData(currentDate);

  if(selectedTipo==='venta'){
    // Si hay items en la lista multi-producto, agrupar en un solo registro
    if(ventaItems.length>0){
      var rec={id:Date.now(),monto:0,desc:'Venta múltiple ('+ventaItems.length+' productos)',cant:1,hora:hora,items:[]};
      ventaItems.forEach(function(it){
        if(it.productoId){var prod=getProducto(it.productoId);if(prod) prod.cantidad=Math.max(0,prod.cantidad-it.cant);}
        rec.items.push({desc:it.desc,cant:it.cant,monto:it.monto,productoId:it.productoId,productoNombre:it.productoNombre});
        rec.monto+=it.monto;
      });
      day.ventas.push(rec);
      saveProductos(); saveData();
      ventaItems=[];
    } else {
      // Venta manual simple (sin item list o con datos directos)
      if(!monto||monto<=0){toast('⚠ Ingresa un monto válido');document.getElementById('fMonto').focus();return;}
      if(!desc) desc='Venta';
      var record={id:Date.now(),monto:monto,desc:desc,cant:cant,hora:hora};
      var pid=parseInt(document.getElementById('ventaProductoSel').value);
      if(pid){
        var prod=getProducto(pid);
        if(prod){
          if(cant>prod.cantidad){toast('⚠ Stock insuficiente ('+prod.cantidad+' '+prod.unidad+' disponibles)');return;}
          prod.cantidad=Math.max(0, prod.cantidad-cant);
          record.productoId=pid;
          record.productoNombre=prod.nombre;
          saveProductos();
        }
      }
      day.ventas.push(record);
      saveData();
    }

  } else if(selectedTipo==='gasto'){
    if(!monto||monto<=0){toast('⚠ Ingresa un monto válido');document.getElementById('fMonto').focus();return;}
    var cat=document.getElementById('gastoCat').value||'otro';
    if(!desc) desc=({pasaje:'Pasaje/Transporte',alimentacion:'Alimentación',alcaldia:'Alcaldía',electricidad:'Energía Eléctrica',otro:'Gasto operativo'})[cat]||'Gasto';
    var record={id:Date.now(),monto:monto,desc:desc,cant:cant,hora:hora,categoria:cat};
    day.gastos.push(record);
    saveData();

  } else {
    // PEDIDO ESPECIAL → va a pedidosGlobal con estado pendiente
    var tipo=document.getElementById('pedidoTipo').value;

    if(pedidoItems.length>0){
      // Multi-producto: un solo pedido global con array de items
      var totalMontoPed=pedidoItems.reduce(function(a,x){return a+x.monto;},0);
      var descPed='Pedido múltiple ('+pedidoItems.length+' productos)';
      var pedRec={
        id:Date.now(),
        tipo:tipo,
        desc:descPed,
        cant:1,
        monto:totalMontoPed,
        hora:hora,
        fecha:dateKey(currentDate),
        estado:'pendiente',
        items:pedidoItems.slice() // guardar items para completar stock después
      };
      day.pedidos.push({id:pedRec.id,tipo:tipo,desc:descPed,cant:1,monto:totalMontoPed,hora:hora});
      pedidosGlobal.push(pedRec);
      pedidoItems=[];
    } else {
      // Pedido manual simple
      if(!monto||monto<=0){toast('⚠ Ingresa un monto válido');document.getElementById('fMonto').focus();return;}
      if(!desc) desc='Pedido';
      var pedRec={
        id:Date.now(),
        tipo:tipo,
        desc:desc, cant:cant, monto:monto, hora:hora,
        fecha:dateKey(currentDate),
        estado:'pendiente',
        productoId:parseInt(document.getElementById('pedidoProductoSel').value)||null
      };
      day.pedidos.push({id:pedRec.id,tipo:tipo,desc:desc,cant:cant,monto:monto,hora:hora});
      pedidosGlobal.push(pedRec);
    }
    saveData();
    savePedidos();
  }

  closeModal('addModal');
  renderAll();
  toast('✓ Registro guardado');
}

// ─ Eliminar registro ─
function deleteRecord(tipo,id){
  if(!confirm('¿Eliminar este registro?'))return;
  var day=getDayData(currentDate);
  if(tipo==='ventas'){
    var rec=null;
    for(var i=0;i<day.ventas.length;i++){if(day.ventas[i].id===id){rec=day.ventas[i];break;}}
    if(rec&&rec.productoId){var prod=getProducto(rec.productoId);if(prod){prod.cantidad+=rec.cant;saveProductos();}}
  }
  day[tipo]=day[tipo].filter(function(x){return x.id!==id;});
  saveData();
  renderAll();
  toast('Registro eliminado');
}

// ══════════════════════════════════════════
//  PEDIDOS ESPECIALES - COMPLETAR/CANCELAR
// ══════════════════════════════════════════
function setPedidoTab(tab){
  pedidoTab=tab;
  document.getElementById('tabPend').classList.toggle('active',tab==='pendiente');
  document.getElementById('tabDone').classList.toggle('active',tab==='completado');
  document.getElementById('tabCanc').classList.toggle('active',tab==='cancelado');
  renderPedidos();
}

function completarPedido(id){
  var ped=getPedido(id);
  if(!ped)return;
  if(ped.estado!=='pendiente'){toast('Este pedido ya fue procesado');return;}

  var hoy=new Date();
  var fechaCompletado=dateKey(hoy);
  var horaCompletado=hoy.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'});

  // Registrar como gasto en el día que se completa
  var dayCompletado=getDayData(hoy);
  dayCompletado.gastos.push({
    id:Date.now(),
    monto:ped.monto,
    desc:'Pedido: '+ped.desc+' ('+ped.tipo+')',
    cant:ped.cant,
    hora:horaCompletado,
    pedidoId:ped.id
  });
  saveData();

  // Sumar stock — soporta tanto pedido simple como multi-producto
  var stockMsg='';
  if(ped.items&&ped.items.length){
    // Multi-producto: restaurar cada item
    ped.items.forEach(function(it){
      if(it.productoId){
        var prod=getProducto(it.productoId);
        if(prod){
          prod.cantidad+=it.cant;
          stockMsg+=' +'+it.cant+' '+it.unidad+' '+prod.nombre+';';
        }
      }
    });
    if(stockMsg) saveProductos();
  } else if(ped.productoId){
    // Pedido simple con producto
    var prod=getProducto(ped.productoId);
    if(prod){
      prod.cantidad+=ped.cant;
      saveProductos();
      stockMsg=' +'+ped.cant+' '+prod.unidad+' en stock de '+prod.nombre;
    }
  }

  ped.estado='completado';
  ped.fechaCompletado=fechaCompletado;
  savePedidos();
  renderAll();
  toast('✓ Pedido completado — $'+ped.monto.toFixed(2)+' en gastos'+(stockMsg?' ·'+stockMsg:''));
}

function cancelarPedido(id){
  if(!confirm('¿Cancelar este pedido?'))return;
  var ped=getPedido(id);
  if(!ped)return;
  ped.estado='cancelado';
  savePedidos();
  renderAll();
  toast('Pedido cancelado');
}

function eliminarPedidoGlobal(id){
  if(!confirm('¿Eliminar este pedido del historial?'))return;
  pedidosGlobal=pedidosGlobal.filter(function(p){return p.id!==id;});
  savePedidos();
  renderPedidos();
  toast('Pedido eliminado');
}

// ── Producto modal ──
function openProductoModal(id){
  document.getElementById('pId').value=id||'';
  if(id){
    var p=getProducto(id);
    document.getElementById('productoModalTitle').textContent='Editar producto';
    document.getElementById('pNombre').value=p.nombre;
    document.getElementById('pCantidad').value=p.cantidad;
    document.getElementById('pUnidad').value=p.unidad;
    document.getElementById('pPrecioCosto').value=p.precioCosto;
    document.getElementById('pPrecioVenta').value=p.precioVenta;
    document.getElementById('pFecha').value=p.fecha;
    document.getElementById('pNotas').value=p.notas||'';
  } else {
    document.getElementById('productoModalTitle').textContent='Nuevo producto';
    ['pNombre','pNotas'].forEach(function(f){document.getElementById(f).value='';});
    document.getElementById('pCantidad').value='';
    document.getElementById('pUnidad').value='unidad';
    document.getElementById('pPrecioCosto').value='';
    document.getElementById('pPrecioVenta').value='';
    document.getElementById('pFecha').value=dateKey(new Date());
  }
  document.getElementById('productoModal').classList.add('open');
}

function saveProducto(){
  var nombre=document.getElementById('pNombre').value.trim();
  var cantidad=parseFloat(document.getElementById('pCantidad').value)||0;
  var unidad=document.getElementById('pUnidad').value;
  var precioCosto=parseFloat(document.getElementById('pPrecioCosto').value)||0;
  var precioVenta=parseFloat(document.getElementById('pPrecioVenta').value)||0;
  var fecha=document.getElementById('pFecha').value;
  var notas=document.getElementById('pNotas').value.trim();
  var idExist=document.getElementById('pId').value;
  if(!nombre){toast('⚠ Ingresa el nombre del producto');return;}
  if(!fecha){toast('⚠ Selecciona la fecha de ingreso');return;}
  if(idExist){
    var p=getProducto(parseInt(idExist));
    if(p){p.nombre=nombre;p.cantidad=cantidad;p.unidad=unidad;p.precioCosto=precioCosto;p.precioVenta=precioVenta;p.fecha=fecha;p.notas=notas;}
  } else {
    productos.push({id:Date.now(),nombre:nombre,cantidad:cantidad,unidad:unidad,precioCosto:precioCosto,precioVenta:precioVenta,fecha:fecha,notas:notas});
  }
  saveProductos();
  closeModal('productoModal');
  renderInventario();
  toast('✓ Producto guardado');
}

function eliminarProducto(id){
  if(!confirm('¿Eliminar este producto?'))return;
  productos=productos.filter(function(p){return p.id!==id;});
  saveProductos();
  renderInventario();
  toast('Producto eliminado');
}

function openStockModal(id){
  var p=getProducto(id);
  if(!p)return;
  document.getElementById('sId').value=id;
  document.getElementById('stockModalTitle').textContent='Ajustar stock: '+p.nombre;
  document.getElementById('sActual').textContent=p.cantidad+' '+p.unidad;
  document.getElementById('sCant').value='1';
  setStkOp('sumar');
  document.getElementById('stockModal').classList.add('open');
}

function setStkOp(op){
  stkOpActual=op;
  document.getElementById('sOpSumar').classList.toggle('active',op==='sumar');
  document.getElementById('sOpRestar').classList.toggle('active',op==='restar');
}

function saveStockAjuste(){
  var id=parseInt(document.getElementById('sId').value);
  var cant=parseFloat(document.getElementById('sCant').value)||0;
  if(cant<=0){toast('⚠ Ingresa una cantidad válida');return;}
  var p=getProducto(id);
  if(!p)return;
  if(stkOpActual==='sumar'){p.cantidad+=cant;}
  else{if(cant>p.cantidad){toast('⚠ No hay suficiente stock');return;}p.cantidad-=cant;}
  saveProductos();
  closeModal('stockModal');
  renderInventario();
  toast('✓ Stock actualizado');
}

// ══════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════
function renderAll(){ renderResumen(); renderPage(currentPage); }

function renderPage(name){
  if(name==='resumen') renderResumen();
  else if(name==='ventas') renderList('ventas');
  else if(name==='gastos') renderList('gastos');
  else if(name==='pedidos') renderPedidos();
  else if(name==='inventario') renderInventario();
  else if(name==='encargos') renderEncargos();
  else if(name==='historial') renderHistorial();
}

function renderResumen(){
  var day=getDayData(currentDate);
  var tv=day.ventas.reduce(function(a,x){return a+x.monto;},0);
  var tg=day.gastos.reduce(function(a,x){return a+x.monto;},0);
  // Solo pedidos no cancelados para los totales
  function pedActivo(p){ var gp=getPedido(p.id); return !gp||(gp.estado!=='cancelado'); }
  var tpr=day.pedidos.filter(function(x){return x.tipo==='Pollo Rico'&&pedActivo(x);}).reduce(function(a,x){return a+x.monto;},0);
  var tpi=day.pedidos.filter(function(x){return x.tipo==='Pollo Indio'&&pedActivo(x);}).reduce(function(a,x){return a+x.monto;},0);
  var tso=day.pedidos.filter(function(x){return x.tipo==='Sello de Oro'&&pedActivo(x);}).reduce(function(a,x){return a+x.monto;},0);
  var tpTotalDia=tpr+tpi+tso;
  var bal=tv-tg;
  var pct=Math.min(100,(tv/META)*100);

  document.getElementById('totalVentas').textContent=fmt(tv);
  document.getElementById('cntVentas').textContent=day.ventas.length+' transacciones';
  document.getElementById('totalGastos').textContent=fmt(tg);
  document.getElementById('cntGastos').textContent=day.gastos.length+' egresos';
  document.getElementById('balanceNeto').textContent=fmt(bal);
  document.getElementById('balanceNeto').style.color=bal>=0?'#a8e6cf':'#f4a590';
  document.getElementById('balanceTag').textContent=bal>0?'Positivo':bal<0?'Negativo':'Neutro';
  document.getElementById('metaText').textContent=Math.round(pct)+'% de meta ('+fmt(META)+')';
  document.getElementById('progressFill').style.width=pct+'%';
  document.getElementById('sumPolloRico').textContent=fmt(tpr);
  document.getElementById('sumPolloIndio').textContent=fmt(tpi);
  document.getElementById('sumSelloOro').textContent=fmt(tso);
  var totalPedidosDia=document.getElementById('totalPedidosDia');
  if(totalPedidosDia) totalPedidosDia.textContent=fmt(tpTotalDia);

  // Fondo inicial (histórico, una sola vez)
  var fondoInicialEl=document.getElementById('fondoInicialDisplay');
  var fondoInicialFechaEl=document.getElementById('fondoInicialFecha');
  var fondoInicialAccion=document.getElementById('fondoInicialAccion');
  if(fondos['inicial']!=null){
    fondoInicialEl.textContent=fmt(fondos['inicial']);
    var fi=fondos['inicialFecha']||'';
    fondoInicialFechaEl.textContent=fi?'Apertura: '+fi.split('-').reverse().join('/'):'Capital de apertura del negocio';
    if(fondoInicialAccion) fondoInicialAccion.innerHTML='<span style="font-size:11px;color:var(--text-muted)">✓ Dato registrado</span>';
  } else {
    fondoInicialEl.textContent='—';
    fondoInicialFechaEl.textContent='Aún no registrado';
  }

  // Ganancia bruta y neta del mes actual
  var mesActual=dateKey(currentDate).substring(0,7);
  var ganancia=0;
  var gastosTotal=0;
  Object.keys(data).forEach(function(k){
    if(k.substring(0,7)!==mesActual) return;
    var d=data[k];
    (d.ventas||[]).forEach(function(v){
      // Venta múltiple: tiene items[]
      if(v.items&&v.items.length){
        v.items.forEach(function(it){
          if(it.productoId){
            var prod=getProducto(it.productoId);
            if(prod&&prod.precioCosto>0) ganancia+=it.monto-(prod.precioCosto*it.cant);
            else ganancia+=it.monto; // sin costo registrado = suma completo
          } else {
            ganancia+=it.monto; // item sin producto = suma completo
          }
        });
      } else {
        // Venta simple
        if(v.productoId){
          var prod=getProducto(v.productoId);
          if(prod&&prod.precioCosto>0) ganancia+=v.monto-(prod.precioCosto*v.cant);
          else ganancia+=v.monto;
        } else {
          ganancia+=v.monto; // venta manual sin producto = suma completo
        }
      }
    });
    // Solo gastos operativos (NO de pedidos)
    (d.gastos||[]).forEach(function(g){
      var esDePedido=g.pedidoId||(g.desc&&g.desc.indexOf('Pedido:')===0);
      if(!esDePedido) gastosTotal+=g.monto;
    });
  });
  var gananciaNeta=ganancia-gastosTotal;
  var mesLabel=currentDate.toLocaleDateString('es-SV',{month:'long',year:'numeric'});
  var ganEl=document.getElementById('gananciaDia');
  var ganNetaEl=document.getElementById('gananciaNeta');
  var ganSub=document.getElementById('gananciaBrutaSub');
  var ganNetaSub=document.getElementById('gananciaNetaSub');
  if(ganEl){ ganEl.textContent=fmt(ganancia); ganEl.style.color=ganancia>=0?'var(--amber)':'var(--red)'; }
  if(ganNetaEl){ ganNetaEl.textContent=fmt(gananciaNeta); ganNetaEl.style.color=gananciaNeta>=0?'var(--green)':'var(--red)'; }
  if(ganSub) ganSub.textContent='Mes: '+mesLabel;
  if(ganNetaSub) ganNetaSub.textContent='Mes: '+mesLabel;

  var maxVal=Math.max(tv,tg,tpr,tpi,tso,1);
  ['bVentas','bGastos','bPollo','bIndio','bSello'].forEach(function(bid,i){
    var vals=[tv,tg,tpr,tpi,tso];
    document.getElementById(bid).style.height=Math.max(4,Math.round((vals[i]/maxVal)*80))+'px';
  });

  // Semana
  renderSemana();
}

function renderSemana(){
  var days=getWeekDays(currentDate);
  var lun=days[0]; var dom=days[6];
  var fmtD=function(d){return d.toLocaleDateString('es-SV',{day:'2-digit',month:'2-digit'});};
  document.getElementById('semanaRango').textContent=fmtD(lun)+' – '+fmtD(dom);

  var semV=0, semG=0, cntV=0, cntG=0;
  var dayVals=[]; // {v,g} por día
  var DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  days.forEach(function(d){
    var dd=getDayData(d);
    var v=dd.ventas.reduce(function(a,x){return a+x.monto;},0);
    var g=dd.gastos.reduce(function(a,x){return a+x.monto;},0);
    semV+=v; semG+=g;
    cntV+=dd.ventas.length; cntG+=dd.gastos.length;
    dayVals.push({v:v,g:g});
  });

  document.getElementById('semVentas').textContent=fmtShort(semV);
  document.getElementById('semGastos').textContent=fmtShort(semG);
  var semBal=semV-semG;
  var balEl=document.getElementById('semBalance');
  balEl.textContent=fmtShort(Math.abs(semBal));
  balEl.style.color=semBal>=0?'var(--green)':'var(--red)';

  // Tarjetas grandes de semana
  document.getElementById('semVentasCard').textContent=fmt(semV);
  document.getElementById('semGastosCard').textContent=fmt(semG);
  document.getElementById('cntSemVentas').textContent=cntV+' transacciones';
  document.getElementById('cntSemGastos').textContent=cntG+' egresos';

  // mini barras por día
  var maxDay=Math.max.apply(null,dayVals.map(function(d){return Math.max(d.v,d.g);}));
  if(maxDay===0) maxDay=1;
  var todayKey2=dateKey(currentDate);
  var html='';
  days.forEach(function(d,i){
    var isToday=dateKey(d)===todayKey2;
    var hv=Math.max(3,Math.round((dayVals[i].v/maxDay)*32));
    var hg=Math.max(3,Math.round((dayVals[i].g/maxDay)*32));
    var dotColor=dayVals[i].v>dayVals[i].g?'#1d9e75':dayVals[i].g>dayVals[i].v?'#d44f2e':'#9a9a9a';
    html+='<div class="semana-day">'+
      '<div class="semana-day-label" style="color:'+(isToday?'var(--primary)':'var(--text-muted)')+'">'+DIAS[i]+'</div>'+
      '<div class="semana-day-bar-wrap" style="gap:2px;display:flex;align-items:flex-end">'+
        '<div class="semana-day-bar" style="background:#1d9e75;height:'+hv+'px"></div>'+
        '<div class="semana-day-bar" style="background:#d44f2e;height:'+hg+'px"></div>'+
      '</div>'+
      '<div class="semana-day-dot" style="background:'+dotColor+'"></div>'+
    '</div>';
  });
  document.getElementById('semanaDays').innerHTML=html;
}

var ventaFiltroActual='lista';
function setVentaFiltro(f){
  ventaFiltroActual=f;
  ['Lista','Ranking'].forEach(function(x){ var el=document.getElementById('ventaFiltro'+x); if(el) el.classList.remove('active'); });
  var el=document.getElementById('ventaFiltro'+f.charAt(0).toUpperCase()+f.slice(1)); if(el) el.classList.add('active');
  renderList('ventas');
}

function renderRankingVentas(){
  // Acumula todos los días en localStorage
  var conteo={};
  Object.keys(data).forEach(function(k){
    (data[k].ventas||[]).forEach(function(v){
      var items=v.items||[{desc:v.desc,cant:v.cant,monto:v.monto,productoNombre:v.productoNombre}];
      items.forEach(function(it){
        var key=it.productoNombre||it.desc||'Sin nombre';
        if(!conteo[key]) conteo[key]={nombre:key,cant:0,monto:0};
        conteo[key].cant+=parseFloat(it.cant)||1;
        conteo[key].monto+=it.monto;
      });
    });
  });
  var lista=Object.values(conteo).sort(function(a,b){return b.cant-a.cant;});
  var el=document.getElementById('listaVentas');
  if(!lista.length){ el.innerHTML='<div class="empty"><div class="empty-icon">📊</div><div class="empty-text">Sin datos de ventas aún.</div></div>'; return; }
  var html='<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Acumulado de todos los días registrados</div>';
  lista.forEach(function(p,i){
    var pct=Math.round((p.cant/lista[0].cant)*100);
    html+='<div class="card" style="padding:12px 16px;margin-bottom:8px">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'+
        '<div style="font-size:16px;font-weight:800;color:var(--text-muted);min-width:24px">#'+(i+1)+'</div>'+
        '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.nombre)+'</div></div>'+
        '<div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--green);font-weight:600">'+fmt(p.monto)+'</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<div style="flex:1;height:6px;background:var(--surface2);border-radius:3px"><div style="height:6px;border-radius:3px;background:var(--green);width:'+pct+'%"></div></div>'+
        '<div style="font-size:11px;color:var(--text-muted);white-space:nowrap">'+p.cant.toFixed(1)+' uds</div>'+
      '</div>'+
    '</div>';
  });
  el.innerHTML=html;
}

function renderList(tipo){
  if(tipo==='ventas'&&ventaFiltroActual==='ranking'){ renderRankingVentas(); return; }
  var day=getDayData(currentDate);
  var items=day[tipo];
  var el=document.getElementById('lista'+cap(tipo));
  var badge=document.getElementById('badge'+cap(tipo));
  if(badge) badge.textContent=items.length;
  var CATS={pasaje:{label:'Transporte',icon:'🚌',color:'#2563eb'},alimentacion:{label:'Alimentación',icon:'🍽',color:'#c4860a'},alcaldia:{label:'Alcaldía',icon:'🏛',color:'#7c3aed'},electricidad:{label:'Electricidad',icon:'⚡',color:'#d44f2e'},otro:{label:'Operativo',icon:'📋',color:'#666'},pedido:{label:'Pedido',icon:'📦',color:'#e8a020'}};

  // Resumen por categoría (solo gastos)
  if(tipo==='gastos'){
    var porCat={};
    items.forEach(function(it){
      var cat=it.pedidoId?'pedido':(it.categoria||'otro');
      if(!porCat[cat]) porCat[cat]=0;
      porCat[cat]+=it.monto;
    });
    var resEl=document.getElementById('gastosCatResumen');
    if(resEl){
      if(Object.keys(porCat).length){
        var rh='<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-sub);margin-bottom:8px">Resumen por categoría</div>';
        rh+='<div style="display:flex;flex-wrap:wrap;gap:8px">';
        Object.keys(porCat).forEach(function(c){
          var ci=CATS[c]||CATS.otro;
          rh+='<div style="flex:1;min-width:80px;background:var(--surface2);border-radius:var(--r-sm);padding:8px;border-left:3px solid '+ci.color+'">'+
            '<div style="font-size:10px;color:var(--text-muted)">'+ci.icon+' '+ci.label+'</div>'+
            '<div style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;color:'+ci.color+'">'+fmt(porCat[c])+'</div></div>';
        });
        rh+='</div>';
        resEl.innerHTML=rh;
        resEl.style.display='block';
      } else { resEl.style.display='none'; }
    }
  }

  if(!items.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">'+(tipo==='ventas'?'💰':'📋')+'</div><div class="empty-text">No hay '+tipo+' registradas hoy.<br>Toca <strong>+</strong> para agregar.</div></div>';
    return;
  }
  var html='<div class="tx-list">';
  items.forEach(function(it){
    var isV=tipo==='ventas';
    var bg=isV?'#e8f7f1':'#fdeee9';
    var color=isV?'var(--green)':'var(--red)';
    var meta='Cant: '+it.cant+' &middot; '+esc(it.hora);
    if(isV&&it.productoNombre) meta+=' &middot; 📦 '+esc(it.productoNombre);
    // Category badge for gastos
    var catBadge='';
    if(!isV){
      var cat=it.pedidoId?'pedido':(it.categoria||'otro');
      var ci=CATS[cat]||CATS.otro;
      catBadge='<span style="font-size:9px;font-weight:600;color:'+ci.color+';background:'+ci.color+'18;border-radius:4px;padding:2px 5px;margin-left:4px">'+ci.icon+' '+ci.label+'</span>';
    }
    var verBtn='<button onclick="verDetalle(\''+tipo+'\','+it.id+')" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:3px 9px;font-size:11px;font-family:'Inter',sans-serif;cursor:pointer;color:var(--text-sub);margin-right:4px;flex-shrink:0">Ver</button>';
    html+='<div class="tx-item">'+
      '<div class="tx-icon" style="background:'+bg+'">'+(isV?'💰':(it.pedidoId?'📦':'📋'))+'</div>'+
      '<div class="tx-info"><div class="tx-name">'+esc(it.desc)+catBadge+'</div><div class="tx-meta">'+meta+'</div></div>'+
      '<div style="display:flex;align-items:center">'+verBtn+
      '<div class="tx-amount" style="color:'+color+'">'+(isV?'+':'-')+fmt(it.monto)+'</div>'+
      '</div>'+
      '<button class="tx-del" onclick="deleteRecord(\''+tipo+'\','+it.id+')">&#215;</button>'+
    '</div>';
  });
  html+='</div>';
  el.innerHTML=html;
}

function verDetalle(tipo, id){
  var day=getDayData(currentDate);
  var it=day[tipo].find(function(x){return x.id===id;});
  if(!it) return;
  var isV=tipo==='ventas';
  var CATS2={pasaje:'🚌 Pasajes/Transporte',alimentacion:'🍽 Alimentación',alcaldia:'🏛 Impuesto Alcaldía',electricidad:'⚡ Energía Eléctrica',otro:'📋 Gasto operativo',pedido:'📦 Pedido completado'};
  var html='<div style="padding:4px 0">';
  if(!isV&&(it.categoria||it.pedidoId)){
    var cat=it.pedidoId?'pedido':(it.categoria||'otro');
    html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Categoría</span><strong>'+(CATS2[cat]||cat)+'</strong></div>';
  }
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Hora</span><strong>'+esc(it.hora)+'</strong></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Descripción</span><strong style="text-align:right;max-width:65%">'+esc(it.desc)+'</strong></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Cantidad</span><strong>'+it.cant+'</strong></div>';
  if(isV&&it.productoNombre) html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Producto</span><strong>'+esc(it.productoNombre)+'</strong></div>';
  if(it.pedidoId) html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Origen</span><strong>📦 Pedido completado</strong></div>';
  if(it.items&&it.items.length){
    html+='<div style="border-top:1px solid var(--border);margin:10px 0 8px;padding-top:8px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted)">Productos incluidos</div>';
    it.items.forEach(function(x){
      html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">'+
        '<div><div style="font-size:13px;font-weight:500">'+esc(x.desc)+'</div>'+
        '<div style="font-size:11px;color:var(--text-muted)">Cant: '+x.cant+(x.productoNombre?' · '+esc(x.productoNombre):'')+'</div></div>'+
        '<div style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:'+(isV?'var(--green)':'var(--red)')+'">'+fmt(x.monto)+'</div>'+
      '</div>';
    });
  }
  var color=isV?'var(--green)':'var(--red)';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:2px solid var(--border)">'+
    '<strong>Total</strong><span style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;color:'+color+'">'+fmt(it.monto)+'</span></div>';
  html+='</div>';
  document.getElementById('detalleVentaBody').innerHTML=html;
  document.getElementById('detalleVentaModal').classList.add('open');
}

function renderPedidos(){
  var el=document.getElementById('listaPedidos');

  // Calcular total del día (solo pendientes y completados)
  var todayKey=dateKey(currentDate);
  var pedidosHoy=pedidosGlobal.filter(function(p){return p.fecha===todayKey&&p.estado!=='cancelado';});
  var totalHoy=pedidosHoy.reduce(function(a,p){return a+p.monto;},0);
  var totalHoyEl=document.getElementById('pedidosDiaTotal');
  var cntHoyEl=document.getElementById('pedidosDiaCnt');
  if(totalHoyEl) totalHoyEl.textContent=fmt(totalHoy);
  if(cntHoyEl) cntHoyEl.textContent=pedidosHoy.length+' pedido'+(pedidosHoy.length!==1?'s':'')+' activo'+(pedidosHoy.length!==1?'s':'');
  // Totales por proveedor del día
  ['Pollo Rico','Pollo Indio','Sello de Oro'].forEach(function(t,i){
    var ids=['pedDiaPR','pedDiaPI','pedDiaSO'];
    var tot=pedidosHoy.filter(function(p){return p.tipo===t;}).reduce(function(a,p){return a+p.monto;},0);
    var el2=document.getElementById(ids[i]); if(el2) el2.textContent=fmt(tot);
  });

  // Filtrar pedidos globales por tab
  var items=pedidosGlobal.filter(function(p){return p.estado===pedidoTab;});
  // Ordenar más reciente primero
  items=items.slice().sort(function(a,b){return b.id-a.id;});

  if(!items.length){
    var msgs={pendiente:'No hay pedidos pendientes.<br>Toca <strong>+</strong> para crear uno.',completado:'No hay pedidos completados aún.',cancelado:'No hay pedidos cancelados.'};
    el.innerHTML='<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">'+msgs[pedidoTab]+'</div></div>';
    return;
  }

  var colores={'Pollo Rico':'#e8a020','Pollo Indio':'#d44f2e','Sello de Oro':'#c4860a'};
  var html='';
  items.forEach(function(it){
    var color=colores[it.tipo]||'#888';
    var prod=it.productoId?getProducto(it.productoId):null;
    var prodInfo=prod?'Producto a recibir: <strong>'+esc(prod.nombre)+'</strong>':'Sin producto asignado al stock';
    var statusClass='ped-status-'+(it.estado==='pendiente'?'pending':it.estado==='completado'?'done':'cancelled');
    var statusLabel=it.estado==='pendiente'?'⏳ Pendiente':it.estado==='completado'?'✅ Completado':'❌ Cancelado';
    var fechaDisplay=it.fecha?it.fecha.split('-').reverse().join('/'):'-';
    var fechaComp=it.fechaCompletado?(' &middot; Entregado: '+it.fechaCompletado.split('-').reverse().join('/')):'';

    html+='<div class="ped-card">'+
      '<div class="ped-card-top">'+
        '<div class="ped-card-info">'+
          '<div class="ped-card-name" style="color:'+color+'">'+esc(it.tipo)+'</div>'+
          '<div class="ped-card-meta">'+
            esc(it.desc)+' &middot; Cant: '+it.cant+' &middot; '+esc(it.hora)+'<br>'+
            'Pedido: '+fechaDisplay+fechaComp+'<br>'+
            prodInfo+
          '</div>'+
          '<span class="ped-status '+statusClass+'">'+statusLabel+'</span>'+
        '</div>'+
        '<div class="ped-card-amount" style="color:'+color+'">'+fmt(it.monto)+'</div>'+
      '</div>';

    if(it.estado==='pendiente'){
      html+='<div class="ped-actions">'+
        '<button class="ped-btn ped-btn-del" onclick="eliminarPedidoGlobal('+it.id+')">Eliminar</button>'+
        '<button class="ped-btn ped-btn-cancel" onclick="cancelarPedido('+it.id+')">Cancelar</button>'+
        '<button class="ped-btn" onclick="verDetallePedido('+it.id+')" style="background:var(--surface2);border:1px solid var(--border);color:var(--text-sub)">Ver</button>'+
        '<button class="ped-btn ped-btn-complete" onclick="completarPedido('+it.id+')">✓ Completar</button>'+
      '</div>';
    } else {
      html+='<div class="ped-actions">'+
        '<button class="ped-btn ped-btn-del" onclick="eliminarPedidoGlobal('+it.id+')">Eliminar</button>'+
        '<button class="ped-btn" onclick="verDetallePedido('+it.id+')" style="background:var(--surface2);border:1px solid var(--border);color:var(--text-sub)">Ver</button>'+
      '</div>';
    }
    html+='</div>';
  });
  el.innerHTML=html;
}

function verDetallePedido(id){
  var ped=getPedido(id);
  if(!ped) return;
  var color={'Pollo Rico':'#e8a020','Pollo Indio':'#d44f2e','Sello de Oro':'#c4860a'}[ped.tipo]||'#888';
  var html='<div style="padding:4px 0">';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Proveedor</span><strong style="color:'+color+'">'+esc(ped.tipo)+'</strong></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Fecha pedido</span><strong>'+(ped.fecha?ped.fecha.split('-').reverse().join('/'):'—')+'</strong></div>';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Hora</span><strong>'+esc(ped.hora)+'</strong></div>';
  var estadoLabel=ped.estado==='pendiente'?'⏳ Pendiente':ped.estado==='completado'?'✅ Completado':'❌ Cancelado';
  html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Estado</span><strong>'+estadoLabel+'</strong></div>';
  if(ped.fechaCompletado) html+='<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-size:12px;color:var(--text-muted)">Completado</span><strong>'+ped.fechaCompletado.split('-').reverse().join('/')+'</strong></div>';

  if(ped.items&&ped.items.length){
    html+='<div style="border-top:1px solid var(--border);margin:10px 0 8px;padding-top:8px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--text-muted)">Productos pedidos</div>';
    ped.items.forEach(function(it){
      html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">'+
        '<div>'+
          '<div style="font-size:13px;font-weight:500">'+esc(it.desc)+'</div>'+
          '<div style="font-size:11px;color:var(--text-muted)">Cant: '+it.cant+' '+esc(it.unidad||'')+(it.productoNombre?' · '+esc(it.productoNombre):'')+'</div>'+
        '</div>'+
        '<div style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:var(--amber)">'+fmt(it.monto)+'</div>'+
      '</div>';
    });
  } else {
    html+='<div style="border-top:1px solid var(--border);margin:10px 0 8px;padding-top:8px;font-size:12px;color:var(--text-muted)">'+esc(ped.desc)+' · Cant: '+ped.cant+'</div>';
  }
  html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:2px solid var(--border)">'+
    '<strong>Total</strong><span style="font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;color:var(--amber)">'+fmt(ped.monto)+'</span></div>';
  html+='</div>';
  document.getElementById('detalleVentaBody').innerHTML=html;
  document.getElementById('detalleVentaModal').classList.add('open');
}
function setInvFiltro(f){
  invFiltroActual=f;
  ['Todos','Alto','Medio','Bajo'].forEach(function(x){
    var el=document.getElementById('invFiltro'+x); if(el) el.classList.remove('active');
  });
  var actEl=document.getElementById('invFiltro'+f.charAt(0).toUpperCase()+f.slice(1));
  if(actEl) actEl.classList.add('active');
  renderInventario();
}

function renderInventario(){
  var el=document.getElementById('listaInventario');
  if(!productos.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">No tienes productos en inventario.<br>Toca <strong>+ Producto</strong> para agregar.</div></div>';
    return;
  }
  // Total invertido
  var totalInv=productos.reduce(function(a,p){return a+p.precioCosto*p.cantidad;},0);
  var totalInvEl=document.getElementById('invTotalInvertido');
  var cntEl=document.getElementById('invProductosCnt');
  if(totalInvEl) totalInvEl.textContent=fmt(totalInv);
  if(cntEl) cntEl.textContent=productos.length+' productos';

  // Filtro
  var filtrados=productos.filter(function(p){
    if(invFiltroActual==='bajo') return p.cantidad<=5;
    if(invFiltroActual==='medio') return p.cantidad>5&&p.cantidad<=20;
    if(invFiltroActual==='alto') return p.cantidad>20;
    return true;
  });
  if(!filtrados.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">🔍</div><div class="empty-text">Sin productos en este rango de stock.</div></div>';
    return;
  }
  var html='';
  filtrados.forEach(function(p){
    var sc=p.cantidad<=0?'stock-out':p.cantidad<=5?'stock-low':'stock-ok';
    var sl=p.cantidad<=0?'Sin stock':p.cantidad<=5?'Stock bajo':'En stock';
    var fd='';if(p.fecha){var fp=p.fecha.split('-');fd=fp[2]+'/'+fp[1]+'/'+fp[0];}
    var margen=p.precioCosto>0?((p.precioVenta-p.precioCosto)/p.precioCosto*100).toFixed(0):'--';
    html+='<div class="inv-card">'+
      '<div class="inv-card-header">'+
        '<div><div class="inv-card-name">'+esc(p.nombre)+'</div><div class="inv-card-date">Ingreso: '+esc(fd)+(p.notas?' &middot; '+esc(p.notas):'')+'</div></div>'+
        '<span class="stock-badge '+sc+'">'+sl+'</span>'+
      '</div>'+
      '<div class="inv-card-body">'+
        '<div class="inv-stat"><div class="inv-stat-label">Stock</div><div class="inv-stat-value">'+p.cantidad+'<span style="font-size:10px;color:var(--text-muted)"> '+esc(p.unidad)+'</span></div></div>'+
        '<div class="inv-stat"><div class="inv-stat-label">Costo</div><div class="inv-stat-value" style="color:var(--red)">'+fmt(p.precioCosto)+'</div></div>'+
        '<div class="inv-stat"><div class="inv-stat-label">Venta</div><div class="inv-stat-value" style="color:var(--green)">'+fmt(p.precioVenta)+'</div></div>'+
      '</div>'+
      '<div style="padding:0 16px 12px;font-size:11px;color:var(--text-muted)">Margen: <strong style="color:var(--primary)">'+(margen!=='--'?margen+'%':'--')+'</strong> &nbsp;|&nbsp; Valor stock: <strong style="color:var(--text)">'+fmt(p.cantidad*p.precioCosto)+'</strong></div>'+
      '<div class="inv-card-footer">'+
        '<button class="inv-btn inv-btn-danger" onclick="eliminarProducto('+p.id+')">Eliminar</button>'+
        '<button class="inv-btn" onclick="openStockModal('+p.id+')">Ajustar stock</button>'+
        '<button class="inv-btn inv-btn-primary" onclick="openProductoModal('+p.id+')">Editar</button>'+
      '</div>'+
    '</div>';
  });
  el.innerHTML=html;
}

function renderHistorial(){
  var el=document.getElementById('listaHistorial');
  var keys=Object.keys(data).sort().reverse();
  if(!keys.length){el.innerHTML='<div class="empty"><div class="empty-icon">📊</div><div class="empty-text">Aún no hay registros históricos.</div></div>';return;}
  var html='';
  keys.forEach(function(k){
    var d=data[k];
    if(!d.ventas.length&&!d.gastos.length&&!d.pedidos.length)return;
    var tv=d.ventas.reduce(function(a,x){return a+x.monto;},0);
    var tg=d.gastos.reduce(function(a,x){return a+x.monto;},0);
    var tp=d.pedidos.reduce(function(a,x){return a+x.monto;},0);
    var p2=k.split('-');
    var fo=new Date(parseInt(p2[0]),parseInt(p2[1])-1,parseInt(p2[2]));
    var fecha=fo.toLocaleDateString('es-SV',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    var balColor=(tv-tg)>=0?'#0f6e56':'#993c1d';
    var balBg=(tv-tg)>=0?'#e8f7f1':'#fdeee9';
    html+='<div class="hist-day"><div class="hist-day-header">'+fecha+'</div><div class="tx-list">';
    d.ventas.forEach(function(it){
      var meta=it.hora+(it.productoNombre?' &middot; 📦 '+esc(it.productoNombre):'');
      html+='<div class="tx-item"><div class="tx-icon" style="background:rgba(30,186,130,0.12)">💰</div><div class="tx-info"><div class="tx-name">'+esc(it.desc)+'</div><div class="tx-meta">'+meta+'</div></div><div class="tx-amount" style="color:var(--green)">+'+fmt(it.monto)+'</div></div>';
    });
    d.gastos.forEach(function(it){
      html+='<div class="tx-item"><div class="tx-icon" style="background:rgba(240,88,88,0.10)">📋</div><div class="tx-info"><div class="tx-name">'+esc(it.desc)+'</div><div class="tx-meta">'+esc(it.hora)+'</div></div><div class="tx-amount" style="color:var(--red)">-'+fmt(it.monto)+'</div></div>';
    });
    d.pedidos.forEach(function(it){
      var c2={'Pollo Rico':'#e8a020','Pollo Indio':'#d44f2e','Sello de Oro':'#c4860a'}[it.tipo]||'#888';
      // buscar estado en pedidosGlobal
      var gped=getPedido(it.id);
      var estadoLabel=gped?(gped.estado==='completado'?' ✅':gped.estado==='cancelado'?' ❌':' ⏳'):'';
      html+='<div class="tx-item"><div class="tx-icon" style="background:rgba(240,168,50,0.08)">📦</div><div class="tx-info"><div class="tx-name" style="color:'+c2+'">'+esc(it.tipo)+estadoLabel+'</div><div class="tx-meta">'+esc(it.desc)+' &middot; '+esc(it.hora)+'</div></div><div class="tx-amount" style="color:'+c2+'">'+fmt(it.monto)+'</div></div>';
    });
    html+='</div><div class="hist-summary">'+
      '<span class="hist-chip" style="background:rgba(30,186,130,0.12);color:#0f6e56">Ventas: '+fmt(tv)+'</span>'+
      '<span class="hist-chip" style="background:rgba(240,88,88,0.10);color:#993c1d">Gastos: '+fmt(tg)+'</span>'+
      '<span class="hist-chip" style="background:rgba(240,168,50,0.10);color:#854f0b">Pedidos: '+fmt(tp)+'</span>'+
      '<span class="hist-chip" style="background:'+balBg+';color:'+balColor+';margin-left:auto">Bal: '+fmt(tv-tg)+'</span>'+
    '</div></div>';
  });
  el.innerHTML=html||'<div class="empty"><div class="empty-icon">📊</div><div class="empty-text">Sin registros aún.</div></div>';
}

// ══════════════════════════════════════════
//  ENCARGOS
// ══════════════════════════════════════════
function openEncargoModal(id){
  document.getElementById('encargoId').value=id||'';
  if(id){
    var e=encargos.find(function(x){return x.id===id;});
    if(!e)return;
    document.getElementById('encargoModalTitle').textContent='Editar encargo';
    document.getElementById('encargoCliente').value=e.cliente;
    document.getElementById('encargoProductos').value=e.productos;
    document.getElementById('encargoFecha').value=e.fecha;
    document.getElementById('encargoCosto').value=e.costo;
    document.getElementById('encargoAnticipo').value=e.anticipo||0;
    document.getElementById('encargoEstado').value=e.estado;
    document.getElementById('encargoNotas').value=e.notas||'';
  } else {
    document.getElementById('encargoModalTitle').textContent='Nuevo encargo';
    document.getElementById('encargoCliente').value='';
    document.getElementById('encargoProductos').value='';
    document.getElementById('encargoFecha').value=dateKey(currentDate);
    document.getElementById('encargoCosto').value='';
    document.getElementById('encargoAnticipo').value='';
    document.getElementById('encargoEstado').value='pendiente';
    document.getElementById('encargoNotas').value='';
  }
  document.getElementById('encargoModal').classList.add('open');
}

function saveEncargo(){
  var cliente=document.getElementById('encargoCliente').value.trim();
  var productos2=document.getElementById('encargoProductos').value.trim();
  var fecha=document.getElementById('encargoFecha').value;
  var costo=parseFloat(document.getElementById('encargoCosto').value)||0;
  var anticipo=parseFloat(document.getElementById('encargoAnticipo').value)||0;
  var estado=document.getElementById('encargoEstado').value;
  var notas=document.getElementById('encargoNotas').value.trim();
  var idExist=document.getElementById('encargoId').value;
  if(!cliente){toast('⚠ Ingresa el nombre del cliente');return;}
  if(!fecha){toast('⚠ Selecciona la fecha de entrega');return;}
  if(!productos2){toast('⚠ Ingresa el tipo de productos');return;}

  var estadoAnterior=null;

  if(idExist){
    var idx=encargos.findIndex(function(x){return x.id===parseInt(idExist);});
    if(idx!==-1){
      estadoAnterior=encargos[idx].estado;
      encargos[idx]={id:encargos[idx].id,cliente:cliente,productos:productos2,fecha:fecha,costo:costo,anticipo:anticipo,estado:estado,notas:notas};
    }
  } else {
    encargos.push({id:Date.now(),cliente:cliente,productos:productos2,fecha:fecha,costo:costo,anticipo:anticipo,estado:estado,notas:notas});
  }

  // Si cambió a "entregado" → registrar automáticamente como venta del día
  if(estado==='entregado' && estadoAnterior && estadoAnterior!=='entregado'){
    var hoy=new Date();
    var hora=hoy.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'});
    var day=getDayData(hoy);
    day.ventas.push({
      id:Date.now(),
      monto:costo,
      desc:'Encargo: '+productos2+' — '+cliente,
      cant:1,
      hora:hora,
      encargoId:parseInt(idExist),
      notas:notas
    });
    saveData();
    toast('✓ Encargo entregado — venta de '+fmt(costo)+' registrada automáticamente');
  } else {
    toast('✓ Encargo guardado');
  }

  saveEncargos();
  closeModal('encargoModal');
  renderAll();
}

function eliminarEncargo(id){
  if(!confirm('¿Eliminar este encargo?'))return;
  encargos=encargos.filter(function(e){return e.id!==id;});
  saveEncargos();
  renderEncargos();
  toast('Encargo eliminado');
}

function renderEncargos(){
  var el=document.getElementById('listaEncargos');
  if(!encargos.length){
    el.innerHTML='<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">No hay encargos registrados.<br>Toca <strong>+ Encargo</strong> para agregar.</div></div>';
    return;
  }
  // Ordenar por fecha
  var sorted=encargos.slice().sort(function(a,b){return a.fecha>b.fecha?1:-1;});
  var estadoInfo={pendiente:{label:'⏳ Pendiente',cls:'ped-status-pending'},listo:{label:'✅ Listo',cls:'ped-status-done'},entregado:{label:'📦 Entregado',cls:'ped-status-done'},cancelado:{label:'❌ Cancelado',cls:'ped-status-cancelled'}};
  var html='';
  sorted.forEach(function(e){
    var ei=estadoInfo[e.estado]||{label:e.estado,cls:'ped-status-pending'};
    var saldo=e.costo-(e.anticipo||0);
    var fechaD=e.fecha?e.fecha.split('-').reverse().join('/'):'';
    html+='<div class="ped-card">'+
      '<div class="ped-card-top">'+
        '<div class="ped-card-info">'+
          '<div class="ped-card-name">'+esc(e.cliente)+'</div>'+
          '<div class="ped-card-meta">'+esc(e.productos)+'<br>Entrega: '+fechaD+(e.notas?'<br>'+esc(e.notas):'')+'<br>Anticipo: <strong>'+fmt(e.anticipo||0)+'</strong> &nbsp;|&nbsp; Saldo: <strong style="color:'+(saldo>0?'var(--red)':'var(--green)')+'">'+fmt(saldo)+'</strong></div>'+
          '<span class="ped-status '+ei.cls+'">'+ei.label+'</span>'+
        '</div>'+
        '<div class="ped-card-amount">'+fmt(e.costo)+'</div>'+
      '</div>'+
      '<div class="ped-actions">'+
        '<button class="ped-btn ped-btn-del" onclick="eliminarEncargo('+e.id+')">Eliminar</button>'+
        '<button class="ped-btn ped-btn-complete" onclick="openEncargoModal('+e.id+')">✏ Editar</button>'+
      '</div>'+
    '</div>';
  });
  el.innerHTML=html;
}

// ── MIGRACIÓN DE DATOS ──
function migrarDatos(silencioso){
  var cambios=0;
  // Descriptores conocidos de compras de mercancía registradas manualmente como gastos
  var keywordsMercancia=['pedidos de dia','total de pedidos','pago a abuela por producto',
    'alas búfalo','alas bufalo','bolsa muslo','menudos','alas rojas','pechuga congelada',
    'libras de mollejas','sacos de muslo','bolsas menudo','bolsas de patas','libras de muslo',
    'saco de pollo','saco de pechuga','pedido sello','pedido pollo','compra de'];

  Object.keys(data).forEach(function(k){
    (data[k].gastos||[]).forEach(function(g){
      // Ya marcado como pedido del sistema — ok
      if(g.pedidoId && g.pedidoId!=='legacy') return;

      var descLow=(g.desc||'').toLowerCase();

      // Marcar como mercancía si coincide con keywords O empieza con "Pedido:"
      var esMercancia = (g.desc&&g.desc.indexOf('Pedido:')===0) ||
        keywordsMercancia.some(function(kw){ return descLow.indexOf(kw)!==-1; });

      if(esMercancia && !g.pedidoId){
        g.pedidoId='legacy';
        g.categoria='pedido_mercancia';
        cambios++;
      }

      // Asignar categoría a gastos operativos sin categoría
      if(!g.pedidoId && (!g.categoria||g.categoria==='otro'||g.categoria==='SIN_CAT')){
        if(/pasaje|bus|transporte/.test(descLow)) g.categoria='pasaje';
        else if(/desayuno|almuerzo|cena|café|cafe|comida|atole|mango|fruta/.test(descLow)) g.categoria='alimentacion';
        else if(/alcald|impuesto|municipal/.test(descLow)) g.categoria='alcaldia';
        else if(/luz|electric|energ/.test(descLow)) g.categoria='electricidad';
        else g.categoria='otro';
        cambios++;
      }
    });
  });

  _lsSave('cvd_data', data);
  _fbWrite(); // siempre escribir a Firebase para que la migración persista
  if(!silencioso) toast(cambios>0?('✓ '+cambios+' registros clasificados'):'✓ Datos verificados');
  renderAll();
}

// ── EXPORTAR / IMPORTAR ──
function exportarDatos(){
  var backup={
    cvd_data: localStorage.getItem('cvd_data'),
    cvd_productos: localStorage.getItem('cvd_productos'),
    cvd_pedidos: localStorage.getItem('cvd_pedidos'),
    cvd_encargos: localStorage.getItem('cvd_encargos'),
    cvd_fondos: localStorage.getItem('cvd_fondos'),
    exportado: new Date().toISOString()
  };
  var blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='backup_negocio_'+dateKey(new Date())+'.json';
  a.click();
  toast('✓ Datos exportados correctamente');
}

function importarDatos(event){
  var file=event.target.files[0];
  if(!file) return;
  if(!confirm('⚠ Esto reemplazará TODOS tus datos actuales con los del archivo. ¿Continuar?')){event.target.value='';return;}
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var backup=JSON.parse(e.target.result);
      if(backup.cvd_data) localStorage.setItem('cvd_data',backup.cvd_data);
      if(backup.cvd_productos) localStorage.setItem('cvd_productos',backup.cvd_productos);
      if(backup.cvd_pedidos) localStorage.setItem('cvd_pedidos',backup.cvd_pedidos);
      if(backup.cvd_encargos) localStorage.setItem('cvd_encargos',backup.cvd_encargos);
      if(backup.cvd_fondos) localStorage.setItem('cvd_fondos',backup.cvd_fondos);
      loadData();
      renderAll();
      _fbWrite(); // sincronizar datos restaurados a Firebase
      toast('✓ Datos restaurados correctamente');
    } catch(err){
      toast('⚠ Archivo inválido, no se pudo importar');
    }
    event.target.value='';
  };
  reader.readAsText(file);
}

// ── PEDIDO MULTI-PRODUCTO ──
function onPedidoProductoChange(){
  var pid=parseInt(document.getElementById('pedidoProductoSel').value);
  var info=document.getElementById('pedidoStockInfo');
  if(!pid){info.style.display='none';return;}
  var p=getProducto(pid);
  if(!p){info.style.display='none';return;}
  info.style.display='block';
  info.innerHTML='Costo: <strong>'+fmt(p.precioCosto)+'</strong> &nbsp;|&nbsp; Stock actual: <strong>'+p.cantidad+' '+p.unidad+'</strong>';
  // Pre-rellenar descripción y monto con precio de costo
  document.getElementById('fDesc').value=p.nombre;
  document.getElementById('fMonto').value=p.precioCosto>0?p.precioCosto:'';
  onCantChange();
}

function agregarItemPedido(){
  var pid=parseInt(document.getElementById('pedidoProductoSel').value);
  var cant=parseFloat(document.getElementById('fCant').value)||1;
  var monto=parseFloat(document.getElementById('fMonto').value)||0;
  var desc=document.getElementById('fDesc').value.trim();
  if(cant<=0){toast('⚠ Ingresa una cantidad válida');return;}
  if(monto<=0){toast('⚠ Ingresa un monto válido');return;}
  if(!desc) desc='Producto';
  var prod=pid?getProducto(pid):null;
  pedidoItems.push({
    productoId:prod?prod.id:null,
    productoNombre:prod?prod.nombre:null,
    desc:desc, cant:cant, monto:monto,
    unidad:prod?prod.unidad:'unidad'
  });
  // reset campos
  document.getElementById('pedidoProductoSel').value='';
  document.getElementById('pedidoStockInfo').style.display='none';
  document.getElementById('fDesc').value='';
  document.getElementById('fCant').value='1';
  document.getElementById('fMonto').value='';
  renderPedidoItems();
}

function removePedidoItem(i){
  pedidoItems.splice(i,1);
  renderPedidoItems();
}

function renderPedidoItems(){
  var el=document.getElementById('pedidoItemsList');
  if(!el) return;
  if(!pedidoItems.length){
    el.innerHTML='<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:8px;background:var(--surface2);border-radius:var(--r-sm)">Selecciona un producto y presiona <strong>+ Agregar</strong>, o registra el pedido manualmente abajo.</div>';
    return;
  }
  var total=pedidoItems.reduce(function(a,x){return a+x.monto;},0);
  var html='';
  pedidoItems.forEach(function(it,i){
    html+='<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border-radius:var(--r-sm);border:1px solid var(--border)">'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:13px;font-weight:500">'+esc(it.desc)+'</div>'+
        '<div style="font-size:11px;color:var(--text-muted)">Cant: '+it.cant+' '+it.unidad+(it.productoNombre?' · '+esc(it.productoNombre):'')+'</div>'+
      '</div>'+
      '<div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--amber);font-weight:500">'+fmt(it.monto)+'</div>'+
      '<button onclick="removePedidoItem('+i+')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:18px;padding:2px 4px;line-height:1">×</button>'+
    '</div>';
  });
  html+='<div style="text-align:right;font-size:13px;font-weight:700;color:var(--amber);padding:4px 2px">Total: '+fmt(total)+'</div>';
  el.innerHTML=html;
}
function toast(msg){
  var n=document.getElementById('notif');
  n.textContent=msg;
  n.classList.add('show');
  clearTimeout(n._t);
  n._t=setTimeout(function(){n.classList.remove('show');},2600);
}

// ══════════════════════════════════════════
//  MOTOR DE REPORTES PDF
// ══════════════════════════════════════════

function fmtPDF(n){ return '$'+Number(n).toFixed(2); }
function fmtDate(k){ var p=k.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function fmtDateObj(d){ return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); }

function rptHeader(titulo, subtitulo){
  var now = new Date();
  return '<div class="rpt-wrap">'+
    '<div class="rpt-header">'+
      '<div class="rpt-logo-area">'+
        '<div class="rpt-logo-box">JR</div>'+
        '<div><div class="rpt-biz-name">Control de Negocio</div><div class="rpt-biz-sub">Ventas Diarias</div></div>'+
      '</div>'+
      '<div class="rpt-meta">Generado: '+fmtDateObj(now)+'<br>'+now.toLocaleTimeString('es-SV',{hour:'2-digit',minute:'2-digit'})+'</div>'+
    '</div>'+
    '<div class="rpt-title">'+titulo+'</div>'+
    '<div class="rpt-subtitle">'+subtitulo+'</div>';
}

function rptFooter(){
  return '<div class="rpt-footer"><span>Control de Ventas — Reporte generado automáticamente</span><span>Datos almacenados localmente en este dispositivo</span></div></div>';
}

function rptKPI(label, value, sub, color){
  return '<div class="rpt-kpi"><div class="rpt-kpi-label">'+label+'</div><div class="rpt-kpi-value" style="color:'+(color||'#0a3d2e')+'">'+value+'</div>'+(sub?'<div class="rpt-kpi-sub">'+sub+'</div>':'')+'</div>';
}

// ─── REPORTE DIARIO ───
function buildReporteDiario(){
  var day = getDayData(currentDate);
  var k = dateKey(currentDate);
  var fechaLabel = currentDate.toLocaleDateString('es-SV',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});

  var tv = day.ventas.reduce(function(a,x){return a+x.monto;},0);
  var tg = day.gastos.reduce(function(a,x){return a+x.monto;},0);
  // Solo pedidos no cancelados
  var tp = day.pedidos.filter(function(p){var gp=getPedido(p.id);return !gp||(gp.estado!=='cancelado');}).reduce(function(a,x){return a+x.monto;},0);
  var bal = tv - tg;

  // Ganancia mensual para el reporte
  var mesKey=dateKey(currentDate).substring(0,7);
  var ganMes=0; var gastosMes=0;
  Object.keys(data).forEach(function(dk){
    if(dk.substring(0,7)!==mesKey) return;
    var dd=data[dk];
    (dd.ventas||[]).forEach(function(v){
      var items=v.items||[{productoId:v.productoId,cant:v.cant,monto:v.monto}];
      items.forEach(function(it){
        if(it.productoId){var prod=getProducto(it.productoId);if(prod&&prod.precioCosto>0) ganMes+=it.monto-(prod.precioCosto*it.cant);}
      });
    });
    (dd.gastos||[]).forEach(function(g){
      var esDePedido=g.pedidoId||(g.desc&&g.desc.indexOf('Pedido:')===0);
      if(!esDePedido) gastosMes+=g.monto;
    });
  });
  var ganNetaMes=ganMes-gastosMes;

  var html = rptHeader('Reporte Diario', fechaLabel);
  html += '<div class="rpt-section"><div class="rpt-section-title">Resumen del día</div>';
  html += '<div class="rpt-kpi-row rpt-kpi-row-4">';
  html += rptKPI('Ventas totales', fmtPDF(tv), day.ventas.length+' transacciones', '#1d9e75');
  html += rptKPI('Gastos totales', fmtPDF(tg), day.gastos.length+' egresos', '#d44f2e');
  html += rptKPI('Pedidos especiales', fmtPDF(tp), day.pedidos.length+' pedidos', '#e8a020');
  html += rptKPI('Balance neto', fmtPDF(bal), bal>=0?'Positivo':'Negativo', bal>=0?'#1d9e75':'#d44f2e');
  html += '</div></div>';
  html += '<div class="rpt-section"><div class="rpt-section-title">Ganancias del mes en curso</div>';
  html += '<div class="rpt-kpi-row">';
  html += rptKPI('Ganancia Bruta Mes', fmtPDF(ganMes), 'Venta − costo producto', '#c4860a');
  html += rptKPI('Ganancia Neta Mes', fmtPDF(ganNetaMes), 'Bruta − gastos operativos', ganNetaMes>=0?'#1d9e75':'#d44f2e');
  html += '</div></div>';

  // Ventas
  html += '<div class="rpt-section no-break"><div class="rpt-section-title">Ventas del día</div>';
  if(day.ventas.length){
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Hora</th><th>Descripción</th><th>Producto</th><th class="center">Cant.</th><th>Monto</th></tr></thead><tbody>';
    day.ventas.forEach(function(v){
      html += '<tr><td>'+esc(v.hora)+'</td><td>'+esc(v.desc)+'</td><td>'+(v.productoNombre?esc(v.productoNombre):'-')+'</td><td class="center">'+v.cant+'</td><td class="num" style="color:#1d9e75">'+fmtPDF(v.monto)+'</td></tr>';
    });
    html += '<tr><td colspan="4" style="font-weight:700;text-align:right;background:#f0f0f0">TOTAL VENTAS</td><td class="num" style="font-weight:700;color:#1d9e75;background:#f0f0f0">'+fmtPDF(tv)+'</td></tr>';
    html += '</tbody></table></div></div>';
  } else { html += '<p style="font-size:12px;color:#aaa">Sin ventas registradas.</p>'; }
  html += '</div>';

  // Gastos
  html += '<div class="rpt-section no-break"><div class="rpt-section-title">Gastos del día</div>';
  if(day.gastos.length){
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Hora</th><th>Descripción</th><th class="center">Cant.</th><th>Monto</th></tr></thead><tbody>';
    day.gastos.forEach(function(g){
      html += '<tr><td>'+esc(g.hora)+'</td><td>'+esc(g.desc)+'</td><td class="center">'+g.cant+'</td><td class="num" style="color:#d44f2e">'+fmtPDF(g.monto)+'</td></tr>';
    });
    html += '<tr><td colspan="3" style="font-weight:700;text-align:right;background:#f0f0f0">TOTAL GASTOS</td><td class="num" style="font-weight:700;color:#d44f2e;background:#f0f0f0">'+fmtPDF(tg)+'</td></tr>';
    html += '</tbody></table></div></div>';
  } else { html += '<p style="font-size:12px;color:#aaa">Sin gastos registrados.</p>'; }
  html += '</div>';

  // Pedidos especiales del día
  html += '<div class="rpt-section no-break"><div class="rpt-section-title">Pedidos especiales del día</div>';
  if(day.pedidos.length){
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Tipo</th><th>Descripción</th><th class="center">Cant.</th><th>Estado</th><th>Monto</th></tr></thead><tbody>';
    day.pedidos.forEach(function(p){
      var gped=getPedido(p.id);
      var estado=gped?gped.estado:'pendiente';
      var estadoClass=estado==='completado'?'rpt-tag-green':estado==='cancelado'?'rpt-tag-red':'rpt-tag-yellow';
      var estadoTxt=estado==='completado'?'Completado':estado==='cancelado'?'Cancelado':'Pendiente';
      html += '<tr><td>'+esc(p.tipo)+'</td><td>'+esc(p.desc)+'</td><td class="center">'+p.cant+'</td><td><span class="rpt-tag '+estadoClass+'">'+estadoTxt+'</span></td><td class="num" style="color:#e8a020">'+fmtPDF(p.monto)+'</td></tr>';
    });
    html += '<tr><td colspan="4" style="font-weight:700;text-align:right;background:#f0f0f0">TOTAL PEDIDOS</td><td class="num" style="font-weight:700;color:#e8a020;background:#f0f0f0">'+fmtPDF(tp)+'</td></tr>';
    html += '</tbody></table></div></div>';
  } else { html += '<p style="font-size:12px;color:#aaa">Sin pedidos especiales.</p>'; }
  html += '</div>';

  // Inventario del día
  html += '<div class="rpt-section no-break"><div class="rpt-section-title">Estado del inventario al cierre del día</div>';
  if(productos.length){
    html += '<div class="rpt-inv-row header"><div>Producto</div><div>Stock</div><div>Unidad</div><div>Costo unit.</div><div>Venta unit.</div><div>Margen</div><div>Valor stock</div></div>';
    productos.forEach(function(p){
      var margen=p.precioCosto>0?((p.precioVenta-p.precioCosto)/p.precioCosto*100).toFixed(0)+'%':'--';
      var sc=p.cantidad<=0?'rpt-tag-red':p.cantidad<=5?'rpt-tag-yellow':'rpt-tag-green';
      html += '<div class="rpt-inv-row"><div>'+esc(p.nombre)+'</div><div><span class="rpt-tag '+sc+'">'+p.cantidad+'</span></div><div>'+esc(p.unidad)+'</div><div style="font-family:Courier New;font-weight:600">'+fmtPDF(p.precioCosto)+'</div><div style="font-family:Courier New;font-weight:600">'+fmtPDF(p.precioVenta)+'</div><div>'+margen+'</div><div style="font-family:Courier New;font-weight:600">'+fmtPDF(p.cantidad*p.precioCosto)+'</div></div>';
    });
    var totalValor=productos.reduce(function(a,p){return a+p.cantidad*p.precioCosto;},0);
    html += '<div class="rpt-inv-row" style="font-weight:700;background:#f0ede7"><div>TOTAL</div><div></div><div></div><div></div><div></div><div></div><div style="font-family:Courier New">'+fmtPDF(totalValor)+'</div></div>';
  } else { html += '<p style="font-size:12px;color:#aaa">Sin productos en inventario.</p>'; }
  html += '</div>';

  html += rptFooter();
  return html;
}

// ─── REPORTE SEMANAL ───
function buildReporteSemanal(){
  var days = getWeekDays(currentDate);
  var lun = days[0]; var dom = days[6];
  var rango = fmtDateObj(lun)+' — '+fmtDateObj(dom);
  var DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

  var semV=0,semG=0,semP=0;
  var dayRows=[];
  days.forEach(function(d,i){
    var dd=getDayData(d);
    var v=dd.ventas.reduce(function(a,x){return a+x.monto;},0);
    var g=dd.gastos.reduce(function(a,x){return a+x.monto;},0);
    var p=dd.pedidos.filter(function(x){var gp=getPedido(x.id);return !gp||(gp.estado!=='cancelado');}).reduce(function(a,x){return a+x.monto;},0);
    semV+=v; semG+=g; semP+=p;
    dayRows.push({dia:DIAS[i],k:dateKey(d),v:v,g:g,p:p,bal:v-g,nv:dd.ventas.length,ng:dd.gastos.length,np:dd.pedidos.length});
  });

  var html = rptHeader('Reporte Semanal', 'Semana del '+rango);

  // KPIs semana
  html += '<div class="rpt-section"><div class="rpt-section-title">Totales de la semana</div>';
  html += '<div class="rpt-kpi-row rpt-kpi-row-4">';
  html += rptKPI('Ventas semana', fmtPDF(semV), '', '#1d9e75');
  html += rptKPI('Gastos semana', fmtPDF(semG), '', '#d44f2e');
  html += rptKPI('Pedidos semana', fmtPDF(semP), '', '#e8a020');
  html += rptKPI('Balance semana', fmtPDF(semV-semG), (semV-semG)>=0?'Positivo':'Negativo', (semV-semG)>=0?'#1d9e75':'#d44f2e');
  html += '</div></div>';

  // Tabla por día
  html += '<div class="rpt-section no-break"><div class="rpt-section-title">Ventas y gastos por día</div>';
  html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Día</th><th>Fecha</th><th># Ventas</th><th>Ventas $</th><th># Gastos</th><th>Gastos $</th><th>Pedidos $</th><th>Balance</th></tr></thead><tbody>';
  dayRows.forEach(function(r){
    html += '<tr><td>'+r.dia+'</td><td>'+fmtDate(r.k)+'</td><td class="center">'+r.nv+'</td><td class="num" style="color:#1d9e75">'+fmtPDF(r.v)+'</td><td class="center">'+r.ng+'</td><td class="num" style="color:#d44f2e">'+fmtPDF(r.g)+'</td><td class="num" style="color:#e8a020">'+fmtPDF(r.p)+'</td><td class="num" style="color:'+(r.bal>=0?'#1d9e75':'#d44f2e')+'">'+fmtPDF(r.bal)+'</td></tr>';
  });
  html += '<tr style="background:#f0ede7;font-weight:700"><td colspan="3">TOTALES</td><td class="num" style="color:#1d9e75">'+fmtPDF(semV)+'</td><td></td><td class="num" style="color:#d44f2e">'+fmtPDF(semG)+'</td><td class="num" style="color:#e8a020">'+fmtPDF(semP)+'</td><td class="num" style="color:'+(semV-semG>=0?'#1d9e75':'#d44f2e')+'">'+fmtPDF(semV-semG)+'</td></tr>';
  html += '</tbody></table></div></div>';

  // Detalle ventas por día de la semana
  html += '<div class="rpt-section"><div class="rpt-section-title">Detalle de ventas por día</div>';
  days.forEach(function(d,i){
    var dd=getDayData(d);
    if(!dd.ventas.length) return;
    html += '<div class="no-break" style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;color:#555;margin-bottom:6px;">'+DIAS[i]+' '+fmtDate(dateKey(d))+'</div>';
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Hora</th><th>Descripción</th><th>Producto</th><th class="center">Cant.</th><th>Monto</th></tr></thead><tbody>';
    dd.ventas.forEach(function(v){
      html += '<tr><td>'+esc(v.hora)+'</td><td>'+esc(v.desc)+'</td><td>'+(v.productoNombre?esc(v.productoNombre):'-')+'</td><td class="center">'+v.cant+'</td><td class="num" style="color:#1d9e75">'+fmtPDF(v.monto)+'</td></tr>';
    });
    html += '</tbody></table></div></div>';
  });
  html += '</div>';

  // Pedidos por proveedor
  html += '<div class="rpt-section"><div class="rpt-section-title">Pedidos especiales — agrupados por proveedor</div>';
  var semKeys = days.map(function(d){return dateKey(d);});
  var pedsSem = pedidosGlobal.filter(function(p){ return semKeys.indexOf(p.fecha)!==-1; });

  if(pedsSem.length){
    // Agrupar por tipo (proveedor)
    var byProv = {};
    pedsSem.forEach(function(p){
      if(!byProv[p.tipo]) byProv[p.tipo]={peds:[],total:0,completados:0,cancelados:0,pendientes:0};
      byProv[p.tipo].peds.push(p);
      byProv[p.tipo].total+=p.monto;
      byProv[p.tipo][p.estado+'s']++;
    });
    Object.keys(byProv).forEach(function(prov){
      var g=byProv[prov];
      html += '<div class="rpt-prov-block no-break">'+
        '<div class="rpt-prov-name">'+esc(prov)+' — Total: '+fmtPDF(g.total)+
        ' &nbsp;|&nbsp; <span style="color:#1d9e75">✓ '+g.completados+'</span>'+
        ' &nbsp;<span style="color:#e8a020">⏳ '+g.pendientes+'</span>'+
        ' &nbsp;<span style="color:#d44f2e">✗ '+g.cancelados+'</span></div>'+
        '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Fecha pedido</th><th>Descripción</th><th>Cant.</th><th>Producto stock</th><th>Estado</th><th>Monto</th></tr></thead><tbody>';
      g.peds.forEach(function(p){
        var prodN=p.productoId?(getProducto(p.productoId)?getProducto(p.productoId).nombre:'—'):'—';
        var estadoClass=p.estado==='completado'?'rpt-tag-green':p.estado==='cancelado'?'rpt-tag-red':'rpt-tag-yellow';
        var estadoTxt=p.estado==='completado'?'Completado':p.estado==='cancelado'?'Cancelado':'Pendiente';
        html += '<tr><td>'+fmtDate(p.fecha)+'</td><td>'+esc(p.desc)+'</td><td class="center">'+p.cant+'</td><td>'+esc(prodN)+'</td><td><span class="rpt-tag '+estadoClass+'">'+estadoTxt+'</span></td><td class="num" style="color:#e8a020">'+fmtPDF(p.monto)+'</td></tr>';
      });
      html += '</tbody></table></div></div>';
    });
  } else {
    html += '<p style="font-size:12px;color:#aaa">Sin pedidos especiales esta semana.</p>';
  }
  html += '</div>';

  // Inventario estado semanal
  html += '<div class="rpt-section no-break"><div class="rpt-section-title">Estado del inventario (semana)</div>';
  if(productos.length){
    html += '<div class="rpt-inv-row header"><div>Producto</div><div>Stock actual</div><div>Unidad</div><div>Costo unit.</div><div>Precio venta</div><div>Margen %</div><div>Valor en stock</div></div>';
    var totalV=0;
    productos.forEach(function(p){
      var margen=p.precioCosto>0?((p.precioVenta-p.precioCosto)/p.precioCosto*100).toFixed(0)+'%':'--';
      var sc=p.cantidad<=0?'rpt-tag-red':p.cantidad<=5?'rpt-tag-yellow':'rpt-tag-green';
      var vs=p.cantidad*p.precioCosto; totalV+=vs;
      html += '<div class="rpt-inv-row"><div>'+esc(p.nombre)+'</div><div><span class="rpt-tag '+sc+'">'+p.cantidad+'</span></div><div>'+esc(p.unidad)+'</div><div style="font-family:Courier New;font-weight:600">'+fmtPDF(p.precioCosto)+'</div><div style="font-family:Courier New;font-weight:600">'+fmtPDF(p.precioVenta)+'</div><div>'+margen+'</div><div style="font-family:Courier New;font-weight:600">'+fmtPDF(vs)+'</div></div>';
    });
    html += '<div class="rpt-inv-row" style="font-weight:700;background:#f0ede7"><div>TOTAL</div><div></div><div></div><div></div><div></div><div></div><div style="font-family:Courier New">'+fmtPDF(totalV)+'</div></div>';
  } else { html += '<p style="font-size:12px;color:#aaa">Sin productos en inventario.</p>'; }
  html += '</div>';

  html += rptFooter();
  return html;
}

// ─── REPORTE MENSUAL ───
function buildReporteMensual(){
  var year = currentDate.getFullYear();
  var month = currentDate.getMonth();
  var mesNombre = currentDate.toLocaleDateString('es-SV',{month:'long',year:'numeric'});
  var totalDias = new Date(year, month+1, 0).getDate();

  var mV=0,mG=0,mP=0;
  var dayRows=[];
  for(var d=1;d<=totalDias;d++){
    var dd=new Date(year,month,d);
    var k=dateKey(dd);
    var dayD=data[k]||{ventas:[],gastos:[],pedidos:[]};
    var v=dayD.ventas.reduce(function(a,x){return a+x.monto;},0);
    var g=dayD.gastos.reduce(function(a,x){return a+x.monto;},0);
    var p=dayD.pedidos.filter(function(x){var gp=getPedido(x.id);return !gp||(gp.estado!=='cancelado');}).reduce(function(a,x){return a+x.monto;},0);
    if(v||g||p) dayRows.push({k:k,d:d,v:v,g:g,p:p,bal:v-g,nv:dayD.ventas.length});
    mV+=v; mG+=g; mP+=p;
  }

  var diasConVentas = dayRows.filter(function(r){return r.v>0;}).length;
  var promDiario = diasConVentas>0 ? mV/diasConVentas : 0;

  var html = rptHeader('Reporte Mensual', cap(mesNombre));

  html += '<div class="rpt-section"><div class="rpt-section-title">Totales del mes</div>';
  html += '<div class="rpt-kpi-row rpt-kpi-row-4">';
  html += rptKPI('Ventas mes', fmtPDF(mV), diasConVentas+' días con ventas', '#1d9e75');
  html += rptKPI('Gastos mes', fmtPDF(mG), '', '#d44f2e');
  html += rptKPI('Pedidos mes', fmtPDF(mP), '', '#e8a020');
  html += rptKPI('Balance mes', fmtPDF(mV-mG), (mV-mG)>=0?'Positivo':'Negativo', (mV-mG)>=0?'#1d9e75':'#d44f2e');
  html += '</div>';
  html += '<div class="rpt-kpi-row" style="grid-template-columns:1fr 1fr;margin-top:8px">';
  // Calcular ganancia bruta y neta del mes
  var ganMesRpt=0; var gastosMesRpt=0;
  dayRows.forEach(function(r){
    var dd2=data[r.k]||{ventas:[],gastos:[]};
    (dd2.ventas||[]).forEach(function(v){
      var items=v.items||[{productoId:v.productoId,cant:v.cant,monto:v.monto}];
      items.forEach(function(it){
        if(it.productoId){var prod=getProducto(it.productoId);if(prod&&prod.precioCosto>0) ganMesRpt+=it.monto-(prod.precioCosto*it.cant);}
      });
    });
    (dd2.gastos||[]).forEach(function(g){
      var esDePedido=g.pedidoId||(g.desc&&g.desc.indexOf('Pedido:')===0);
      if(!esDePedido) gastosMesRpt+=g.monto;
    });
  });
  var ganNetaMesRpt=ganMesRpt-gastosMesRpt;

  html += rptKPI('Promedio diario (días con ventas)', fmtPDF(promDiario), '', '#0a3d2e');
  html += rptKPI('Meta diaria ($500) — días alcanzados', dayRows.filter(function(r){return r.v>=META;}).length+' / '+diasConVentas, '', '#c4860a');
  html += '</div>';
  html += '<div class="rpt-kpi-row" style="grid-template-columns:1fr 1fr;margin-top:8px">';
  html += rptKPI('Ganancia Bruta Mes', fmtPDF(ganMesRpt), 'Venta − costo producto', '#c4860a');
  html += rptKPI('Ganancia Neta Mes', fmtPDF(ganNetaMesRpt), 'Bruta − gastos operativos', ganNetaMesRpt>=0?'#1d9e75':'#d44f2e');
  html += '</div></div>';

  // Tabla diaria del mes
  html += '<div class="rpt-section no-break"><div class="rpt-section-title">Detalle por día del mes</div>';
  if(dayRows.length){
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Fecha</th><th class="center"># Tx</th><th>Ventas</th><th>Gastos</th><th>Pedidos</th><th>Balance día</th></tr></thead><tbody>';
    dayRows.forEach(function(r){
      html += '<tr><td>'+fmtDate(r.k)+'</td><td class="center">'+r.nv+'</td><td class="num" style="color:#1d9e75">'+fmtPDF(r.v)+'</td><td class="num" style="color:#d44f2e">'+fmtPDF(r.g)+'</td><td class="num" style="color:#e8a020">'+fmtPDF(r.p)+'</td><td class="num" style="color:'+(r.bal>=0?'#1d9e75':'#d44f2e')+'">'+fmtPDF(r.bal)+'</td></tr>';
    });
    html += '<tr style="background:#f0ede7;font-weight:700"><td colspan="2">TOTALES</td><td class="num" style="color:#1d9e75">'+fmtPDF(mV)+'</td><td class="num" style="color:#d44f2e">'+fmtPDF(mG)+'</td><td class="num" style="color:#e8a020">'+fmtPDF(mP)+'</td><td class="num" style="color:'+(mV-mG>=0?'#1d9e75':'#d44f2e')+'">'+fmtPDF(mV-mG)+'</td></tr>';
    html += '</tbody></table></div></div>';
  } else { html += '<p style="font-size:12px;color:#aaa">Sin datos registrados este mes.</p>'; }
  html += '</div>';

  // Pedidos del mes por proveedor
  html += '<div class="rpt-section"><div class="rpt-section-title">Pedidos especiales del mes — por proveedor</div>';
  var monthKeys=[];
  for(var d2=1;d2<=totalDias;d2++) monthKeys.push(dateKey(new Date(year,month,d2)));
  var pedsMes=pedidosGlobal.filter(function(p){return monthKeys.indexOf(p.fecha)!==-1;});
  if(pedsMes.length){
    var byProvM={};
    pedsMes.forEach(function(p){
      if(!byProvM[p.tipo]) byProvM[p.tipo]={peds:[],total:0,completados:0,cancelados:0,pendientes:0};
      byProvM[p.tipo].peds.push(p);
      byProvM[p.tipo].total+=p.monto;
      byProvM[p.tipo][p.estado+'s']++;
    });
    Object.keys(byProvM).forEach(function(prov){
      var g=byProvM[prov];
      html += '<div class="rpt-prov-block no-break">'+
        '<div class="rpt-prov-name">'+esc(prov)+' — Total mes: '+fmtPDF(g.total)+
        ' &nbsp;|&nbsp; <span style="color:#1d9e75">✓ '+g.completados+' completados</span>'+
        ' &nbsp;<span style="color:#e8a020">⏳ '+g.pendientes+' pendientes</span>'+
        ' &nbsp;<span style="color:#d44f2e">✗ '+g.cancelados+' cancelados</span></div>'+
        '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Fecha</th><th>Descripción</th><th class="center">Cant.</th><th>Estado</th><th>Monto</th></tr></thead><tbody>';
      g.peds.forEach(function(p){
        var estadoClass=p.estado==='completado'?'rpt-tag-green':p.estado==='cancelado'?'rpt-tag-red':'rpt-tag-yellow';
        var estadoTxt=p.estado==='completado'?'Completado':p.estado==='cancelado'?'Cancelado':'Pendiente';
        html += '<tr><td>'+fmtDate(p.fecha)+'</td><td>'+esc(p.desc)+'</td><td class="center">'+p.cant+'</td><td><span class="rpt-tag '+estadoClass+'">'+estadoTxt+'</span></td><td class="num" style="color:#e8a020">'+fmtPDF(p.monto)+'</td></tr>';
      });
      html += '</tbody></table></div></div>';
    });
  } else { html += '<p style="font-size:12px;color:#aaa">Sin pedidos especiales este mes.</p>'; }
  html += '</div>';

  // Inventario
  html += '<div class="rpt-section no-break"><div class="rpt-section-title">Estado del inventario al cierre del mes</div>';
  if(productos.length){
    html += '<div class="rpt-inv-row header"><div>Producto</div><div>Stock</div><div>Unidad</div><div>Costo unit.</div><div>Precio venta</div><div>Margen</div><div>Valor stock</div></div>';
    var totalValM=0;
    productos.forEach(function(p){
      var mg=p.precioCosto>0?((p.precioVenta-p.precioCosto)/p.precioCosto*100).toFixed(0)+'%':'--';
      var sc=p.cantidad<=0?'rpt-tag-red':p.cantidad<=5?'rpt-tag-yellow':'rpt-tag-green';
      var vs=p.cantidad*p.precioCosto; totalValM+=vs;
      html += '<div class="rpt-inv-row"><div>'+esc(p.nombre)+'</div><div><span class="rpt-tag '+sc+'">'+p.cantidad+'</span></div><div>'+esc(p.unidad)+'</div><div style="font-family:Courier New;font-weight:600">'+fmtPDF(p.precioCosto)+'</div><div style="font-family:Courier New;font-weight:600">'+fmtPDF(p.precioVenta)+'</div><div>'+mg+'</div><div style="font-family:Courier New;font-weight:600">'+fmtPDF(vs)+'</div></div>';
    });
    html += '<div class="rpt-inv-row" style="font-weight:700;background:#f0ede7"><div>TOTAL VALOR INVENTARIO</div><div></div><div></div><div></div><div></div><div></div><div style="font-family:Courier New">'+fmtPDF(totalValM)+'</div></div>';
  } else { html += '<p style="font-size:12px;color:#aaa">Sin productos en inventario.</p>'; }
  html += '</div>';

  html += rptFooter();
  return html;
}

// ─── REPORTE INVENTARIO ───
function buildReporteInventario(){
  var html = rptHeader('Estado de Inventario', 'Fecha de corte: '+fmtDateObj(currentDate));

  var totalValor=0, totalCosto=0;
  var sinStock=[], stockBajo=[], stockOk=[];
  productos.forEach(function(p){
    if(p.cantidad<=0) sinStock.push(p);
    else if(p.cantidad<=5) stockBajo.push(p);
    else stockOk.push(p);
    totalValor+=p.cantidad*p.precioCosto;
    totalCosto+=p.precioCosto;
  });

  // KPIs
  html += '<div class="rpt-section"><div class="rpt-section-title">Resumen de inventario</div>';
  html += '<div class="rpt-kpi-row rpt-kpi-row-4">';
  html += rptKPI('Total productos', productos.length+' items', '', '#0a3d2e');
  html += rptKPI('Valor en stock', fmtPDF(totalValor), 'a precio de costo', '#1d9e75');
  html += rptKPI('Stock bajo / sin stock', stockBajo.length+' / '+sinStock.length, 'requieren atención', '#d44f2e');
  html += rptKPI('En stock normal', stockOk.length+' productos', '', '#1d9e75');
  html += '</div></div>';

  // Tabla completa
  html += '<div class="rpt-section"><div class="rpt-section-title">Inventario completo</div>';
  if(productos.length){
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Producto</th><th>Fecha ingreso</th><th class="center">Stock</th><th>Unidad</th><th>Costo unit.</th><th>Precio venta</th><th>Margen</th><th>Valor stock</th><th>Estado</th></tr></thead><tbody>';
    productos.forEach(function(p){
      var mg=p.precioCosto>0?((p.precioVenta-p.precioCosto)/p.precioCosto*100).toFixed(0)+'%':'--';
      var sc=p.cantidad<=0?'rpt-tag-red':p.cantidad<=5?'rpt-tag-yellow':'rpt-tag-green';
      var sl=p.cantidad<=0?'Sin stock':p.cantidad<=5?'Stock bajo':'En stock';
      var fd=''; if(p.fecha){var fp=p.fecha.split('-');fd=fp[2]+'/'+fp[1]+'/'+fp[0];}
      html += '<tr><td><strong>'+esc(p.nombre)+'</strong>'+(p.notas?'<br><span style="font-size:10px;color:#888">'+esc(p.notas)+'</span>':'')+'</td><td>'+fd+'</td><td class="center"><strong>'+p.cantidad+'</strong></td><td>'+esc(p.unidad)+'</td><td class="num">'+fmtPDF(p.precioCosto)+'</td><td class="num" style="color:#1d9e75">'+fmtPDF(p.precioVenta)+'</td><td class="center">'+mg+'</td><td class="num" style="font-weight:700">'+fmtPDF(p.cantidad*p.precioCosto)+'</td><td><span class="rpt-tag '+sc+'">'+sl+'</span></td></tr>';
      totalValor+=0; // already counted
    });
    var totalV2=productos.reduce(function(a,p){return a+p.cantidad*p.precioCosto;},0);
    html += '<tr style="background:#f0ede7;font-weight:700"><td colspan="7">VALOR TOTAL EN STOCK</td><td class="num">'+fmtPDF(totalV2)+'</td><td></td></tr>';
    html += '</tbody></table></div></div>';
  } else { html += '<p style="font-size:12px;color:#aaa">Sin productos en inventario.</p>'; }
  html += '</div>';

  // Alertas
  if(sinStock.length||stockBajo.length){
    html += '<div class="rpt-section no-break"><div class="rpt-section-title">⚠ Alertas de stock</div>';
    if(sinStock.length){
      html += '<div style="background:rgba(240,88,88,0.10);border-radius:8px;padding:12px;margin-bottom:10px;border-left:3px solid #d44f2e"><div style="font-size:11px;font-weight:700;color:#993c1d;margin-bottom:6px">SIN STOCK — Requieren reposición urgente</div>';
      sinStock.forEach(function(p){html+='<div style="font-size:12px;padding:3px 0;color:#333">• '+esc(p.nombre)+' — 0 '+esc(p.unidad)+'</div>';});
      html += '</div>';
    }
    if(stockBajo.length){
      html += '<div style="background:#fef9e7;border-radius:8px;padding:12px;border-left:3px solid #e8a020"><div style="font-size:11px;font-weight:700;color:#b7791f;margin-bottom:6px">STOCK BAJO — Considerar reposición pronto</div>';
      stockBajo.forEach(function(p){html+='<div style="font-size:12px;padding:3px 0;color:#333">• '+esc(p.nombre)+' — '+p.cantidad+' '+esc(p.unidad)+' disponibles</div>';});
      html += '</div>';
    }
    html += '</div>';
  }

  // Pedidos pendientes que afectan inventario
  var pendStk = pedidosGlobal.filter(function(p){return p.estado==='pendiente'&&p.productoId;});
  if(pendStk.length){
    html += '<div class="rpt-section no-break"><div class="rpt-section-title">Pedidos pendientes con impacto en inventario</div>';
    html += '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Proveedor</th><th>Descripción</th><th>Producto a recibir</th><th class="center">Cant. esperada</th><th>Fecha pedido</th></tr></thead><tbody>';
    pendStk.forEach(function(p){
      var prod=getProducto(p.productoId);
      html += '<tr><td>'+esc(p.tipo)+'</td><td>'+esc(p.desc)+'</td><td>'+(prod?esc(prod.nombre):'-')+'</td><td class="center">'+p.cant+'</td><td>'+fmtDate(p.fecha)+'</td></tr>';
    });
    html += '</tbody></table></div></div>';
  }

  html += rptFooter();
  return html;
}

// ─── REPORTE VENTAS DIARIO ───
function buildReporteVentasDiario(){
  var day=getDayData(currentDate);
  var fechaLabel=currentDate.toLocaleDateString('es-SV',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  var tv=day.ventas.reduce(function(a,x){return a+x.monto;},0);
  var html=rptHeader('Reporte de Ventas — Diario',fechaLabel);
  html+='<div class="rpt-section"><div class="rpt-section-title">Resumen de ventas</div>';
  html+='<div class="rpt-kpi-row">';
  html+=rptKPI('Total ventas',fmtPDF(tv),day.ventas.length+' transacciones','#1d9e75');
  html+=rptKPI('Promedio por venta',day.ventas.length?fmtPDF(tv/day.ventas.length):'$0.00','','#0a3d2e');
  html+=rptKPI('Meta diaria ($'+META+')',Math.round((tv/META)*100)+'%',tv>=META?'✓ Alcanzada':'Pendiente',tv>=META?'#1d9e75':'#d44f2e');
  html+='</div></div>';
  html+='<div class="rpt-section no-break"><div class="rpt-section-title">Detalle de ventas</div>';
  if(day.ventas.length){
    html+='<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Hora</th><th>Descripción</th><th>Producto</th><th class="center">Cant.</th><th>Monto</th></tr></thead><tbody>';
    day.ventas.forEach(function(v){html+='<tr><td>'+esc(v.hora)+'</td><td>'+esc(v.desc)+'</td><td>'+(v.productoNombre?esc(v.productoNombre):'-')+'</td><td class="center">'+v.cant+'</td><td class="num" style="color:#1d9e75">'+fmtPDF(v.monto)+'</td></tr>';});
    html+='<tr><td colspan="4" style="font-weight:700;text-align:right;background:#f0f0f0">TOTAL</td><td class="num" style="font-weight:700;color:#1d9e75;background:#f0f0f0">'+fmtPDF(tv)+'</td></tr>';
    html+='</tbody></table></div></div>';
  } else { html+='<p style="font-size:12px;color:#aaa">Sin ventas registradas.</p>'; }
  html+='</div>';
  html+=rptFooter(); return html;
}

// ─── REPORTE VENTAS SEMANAL ───
function buildReporteVentasSemanal(){
  var days=getWeekDays(currentDate);
  var DIAS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  var semV=0; var dayRows=[];
  days.forEach(function(d,i){
    var dd=getDayData(d);
    var v=dd.ventas.reduce(function(a,x){return a+x.monto;},0);
    semV+=v;
    dayRows.push({dia:DIAS[i],k:dateKey(d),v:v,nv:dd.ventas.length,ventas:dd.ventas});
  });
  var html=rptHeader('Reporte de Ventas — Semanal','Semana del '+fmtDateObj(days[0])+' al '+fmtDateObj(days[6]));
  html+='<div class="rpt-section"><div class="rpt-section-title">Resumen semanal de ventas</div>';
  html+='<div class="rpt-kpi-row">';
  html+=rptKPI('Total ventas semana',fmtPDF(semV),'','#1d9e75');
  var diasConV=dayRows.filter(function(r){return r.v>0;}).length;
  html+=rptKPI('Días con ventas',diasConV+' días','','#0a3d2e');
  html+=rptKPI('Promedio diario',diasConV?fmtPDF(semV/diasConV):'$0.00','','#2563eb');
  html+='</div></div>';
  html+='<div class="rpt-section no-break"><div class="rpt-section-title">Ventas por día</div>';
  html+='<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Día</th><th>Fecha</th><th class="center"># Ventas</th><th>Total Ventas</th></tr></thead><tbody>';
  dayRows.forEach(function(r){html+='<tr><td>'+r.dia+'</td><td>'+fmtDate(r.k)+'</td><td class="center">'+r.nv+'</td><td class="num" style="color:#1d9e75">'+fmtPDF(r.v)+'</td></tr>';});
  html+='<tr style="background:#f0ede7;font-weight:700"><td colspan="3">TOTAL</td><td class="num" style="color:#1d9e75">'+fmtPDF(semV)+'</td></tr>';
  html+='</tbody></table></div></div>';
  dayRows.forEach(function(r){
    if(!r.ventas.length) return;
    html+='<div class="rpt-section no-break"><div class="rpt-section-title">'+r.dia+' '+fmtDate(r.k)+'</div>';
    html+='<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Hora</th><th>Descripción</th><th>Producto</th><th class="center">Cant.</th><th>Monto</th></tr></thead><tbody>';
    r.ventas.forEach(function(v){html+='<tr><td>'+esc(v.hora)+'</td><td>'+esc(v.desc)+'</td><td>'+(v.productoNombre?esc(v.productoNombre):'-')+'</td><td class="center">'+v.cant+'</td><td class="num" style="color:#1d9e75">'+fmtPDF(v.monto)+'</td></tr>';});
    html+='</tbody></table></div></div>';
  });
  html+=rptFooter(); return html;
}

// ─── REPORTE VENTAS MENSUAL ───
function buildReporteVentasMensual(){
  var year=currentDate.getFullYear(),month=currentDate.getMonth();
  var mesNombre=currentDate.toLocaleDateString('es-SV',{month:'long',year:'numeric'});
  var totalDias=new Date(year,month+1,0).getDate();
  var mV=0; var dayRows=[];
  for(var d=1;d<=totalDias;d++){
    var dd=new Date(year,month,d); var k=dateKey(dd);
    var dayD=data[k]||{ventas:[],gastos:[],pedidos:[]};
    var v=dayD.ventas.reduce(function(a,x){return a+x.monto;},0);
    if(v) dayRows.push({k:k,d:d,v:v,nv:dayD.ventas.length}); mV+=v;
  }
  var html=rptHeader('Reporte de Ventas — Mensual',mesNombre.charAt(0).toUpperCase()+mesNombre.slice(1));
  var diasConV=dayRows.length;
  html+='<div class="rpt-section"><div class="rpt-section-title">Resumen mensual</div>';
  html+='<div class="rpt-kpi-row rpt-kpi-row-4">';
  html+=rptKPI('Total ventas mes',fmtPDF(mV),'','#1d9e75');
  html+=rptKPI('Días con ventas',diasConV,'','#0a3d2e');
  html+=rptKPI('Promedio diario',diasConV?fmtPDF(mV/diasConV):'$0.00','','#2563eb');
  html+=rptKPI('Días meta alcanzada',dayRows.filter(function(r){return r.v>=META;}).length+'/'+diasConV,'','#c4860a');
  html+='</div></div>';
  html+='<div class="rpt-section no-break"><div class="rpt-section-title">Detalle por día</div>';
  if(dayRows.length){
    html+='<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Fecha</th><th class="center"># Tx</th><th>Ventas</th></tr></thead><tbody>';
    dayRows.forEach(function(r){html+='<tr><td>'+fmtDate(r.k)+'</td><td class="center">'+r.nv+'</td><td class="num" style="color:#1d9e75">'+fmtPDF(r.v)+'</td></tr>';});
    html+='<tr style="background:#f0ede7;font-weight:700"><td colspan="2">TOTAL MES</td><td class="num" style="color:#1d9e75">'+fmtPDF(mV)+'</td></tr>';
    html+='</tbody></table></div></div>';
  } else { html+='<p style="font-size:12px;color:#aaa">Sin ventas este mes.</p>'; }
  html+='</div>';
  html+=rptFooter(); return html;
}

// ─── REPORTE PEDIDOS DIARIO ───
function buildReportePedidosDiario(){
  var day=getDayData(currentDate);
  var fechaLabel=currentDate.toLocaleDateString('es-SV',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  var pedActivos=day.pedidos.filter(function(p){var gp=getPedido(p.id);return !gp||(gp.estado!=='cancelado');});
  var tp=pedActivos.reduce(function(a,x){return a+x.monto;},0);
  var html=rptHeader('Reporte de Pedidos — Diario',fechaLabel);
  html+='<div class="rpt-section"><div class="rpt-section-title">Resumen de pedidos del día</div>';
  html+='<div class="rpt-kpi-row rpt-kpi-row-4">';
  html+=rptKPI('Total pedidos',fmtPDF(tp),pedActivos.length+' activos','#e8a020');
  var cancelados=day.pedidos.length-pedActivos.length;
  html+=rptKPI('Cancelados',cancelados+' pedidos','No incluidos en total','#d44f2e');
  ['Pollo Rico','Pollo Indio','Sello de Oro'].forEach(function(tipo){
    var t=pedActivos.filter(function(p){return p.tipo===tipo;}).reduce(function(a,p){return a+p.monto;},0);
    html+=rptKPI(tipo,fmtPDF(t),'','#c4860a');
  });
  html+='</div></div>';
  html+='<div class="rpt-section no-break"><div class="rpt-section-title">Detalle de pedidos</div>';
  if(day.pedidos.length){
    html+='<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Tipo</th><th>Descripción</th><th class="center">Cant.</th><th>Estado</th><th>Monto</th></tr></thead><tbody>';
    day.pedidos.forEach(function(p){
      var gped=getPedido(p.id); var estado=gped?gped.estado:'pendiente';
      var ec=estado==='completado'?'rpt-tag-green':estado==='cancelado'?'rpt-tag-red':'rpt-tag-yellow';
      var et=estado==='completado'?'Completado':estado==='cancelado'?'Cancelado':'Pendiente';
      var rowStyle=estado==='cancelado'?' style="opacity:0.5;text-decoration:line-through"':'';
      html+='<tr'+rowStyle+'><td>'+esc(p.tipo)+'</td><td>'+esc(p.desc)+'</td><td class="center">'+p.cant+'</td><td><span class="rpt-tag '+ec+'">'+et+'</span></td><td class="num" style="color:#e8a020">'+fmtPDF(p.monto)+'</td></tr>';
    });
    html+='<tr><td colspan="4" style="font-weight:700;text-align:right;background:#f0f0f0">TOTAL ACTIVOS</td><td class="num" style="font-weight:700;color:#e8a020;background:#f0f0f0">'+fmtPDF(tp)+'</td></tr>';
    html+='</tbody></table></div></div>';
  } else { html+='<p style="font-size:12px;color:#aaa">Sin pedidos registrados.</p>'; }
  html+='</div>';
  html+=rptFooter(); return html;
}

// ─── REPORTE PEDIDOS SEMANAL ───
function buildReportePedidosSemanal(){
  var days=getWeekDays(currentDate);
  var semKeys=days.map(function(d){return dateKey(d);});
  var pedsSem=pedidosGlobal.filter(function(p){return semKeys.indexOf(p.fecha)!==-1;});
  var pedActivos=pedsSem.filter(function(p){return p.estado!=='cancelado';});
  var tp=pedActivos.reduce(function(a,p){return a+p.monto;},0);
  var html=rptHeader('Reporte de Pedidos — Semanal','Semana del '+fmtDateObj(days[0])+' al '+fmtDateObj(days[6]));
  html+='<div class="rpt-section"><div class="rpt-section-title">Resumen semanal</div>';
  html+='<div class="rpt-kpi-row rpt-kpi-row-4">';
  html+=rptKPI('Total pedidos semana',fmtPDF(tp),pedActivos.length+' activos','#e8a020');
  html+=rptKPI('Cancelados',pedsSem.filter(function(p){return p.estado==='cancelado';}).length+' pedidos','No incluidos','#d44f2e');
  html+=rptKPI('Completados',pedActivos.filter(function(p){return p.estado==='completado';}).length+' pedidos','','#1d9e75');
  html+=rptKPI('Pendientes',pedActivos.filter(function(p){return p.estado==='pendiente';}).length+' pedidos','','#c4860a');
  html+='</div></div>';
  if(pedsSem.length){
    var byProv={};
    pedsSem.forEach(function(p){
      if(!byProv[p.tipo]) byProv[p.tipo]={peds:[],total:0,completados:0,cancelados:0,pendientes:0};
      byProv[p.tipo].peds.push(p);
      if(p.estado!=='cancelado') byProv[p.tipo].total+=p.monto;
      byProv[p.tipo][p.estado+'s']=(byProv[p.tipo][p.estado+'s']||0)+1;
    });
    html+='<div class="rpt-section"><div class="rpt-section-title">Pedidos por proveedor</div>';
    Object.keys(byProv).forEach(function(prov){
      var g=byProv[prov];
      html+='<div class="rpt-prov-block no-break"><div class="rpt-prov-name">'+esc(prov)+' — Total: '+fmtPDF(g.total)+
        ' &nbsp;|&nbsp; <span style="color:#1d9e75">✓ '+(g.completados||0)+'</span>'+
        ' &nbsp;<span style="color:#e8a020">⏳ '+(g.pendientes||0)+'</span>'+
        ' &nbsp;<span style="color:#d44f2e">✗ '+(g.cancelados||0)+'</span></div>'+
        '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Fecha</th><th>Descripción</th><th class="center">Cant.</th><th>Estado</th><th>Monto</th></tr></thead><tbody>';
      g.peds.forEach(function(p){
        var ec=p.estado==='completado'?'rpt-tag-green':p.estado==='cancelado'?'rpt-tag-red':'rpt-tag-yellow';
        var et=p.estado==='completado'?'Completado':p.estado==='cancelado'?'Cancelado':'Pendiente';
        var rs=p.estado==='cancelado'?' style="opacity:0.5;text-decoration:line-through"':'';
        html+='<tr'+rs+'><td>'+fmtDate(p.fecha)+'</td><td>'+esc(p.desc)+'</td><td class="center">'+p.cant+'</td><td><span class="rpt-tag '+ec+'">'+et+'</span></td><td class="num">'+fmtPDF(p.monto)+'</td></tr>';
      });
      html+='</tbody></table></div></div>';
    });
    html+='</div>';
  } else { html+='<p style="font-size:12px;color:#aaa">Sin pedidos esta semana.</p>'; }
  html+=rptFooter(); return html;
}

// ─── REPORTE PEDIDOS MENSUAL ───
function buildReportePedidosMensual(){
  var year=currentDate.getFullYear(),month=currentDate.getMonth();
  var mesNombre=currentDate.toLocaleDateString('es-SV',{month:'long',year:'numeric'});
  var totalDias=new Date(year,month+1,0).getDate();
  var monthKeys=[];
  for(var d2=1;d2<=totalDias;d2++) monthKeys.push(dateKey(new Date(year,month,d2)));
  var pedsMes=pedidosGlobal.filter(function(p){return monthKeys.indexOf(p.fecha)!==-1;});
  var pedActivos=pedsMes.filter(function(p){return p.estado!=='cancelado';});
  var tp=pedActivos.reduce(function(a,p){return a+p.monto;},0);
  var html=rptHeader('Reporte de Pedidos — Mensual',mesNombre.charAt(0).toUpperCase()+mesNombre.slice(1));
  html+='<div class="rpt-section"><div class="rpt-section-title">Resumen mensual</div>';
  html+='<div class="rpt-kpi-row rpt-kpi-row-4">';
  html+=rptKPI('Total pedidos mes',fmtPDF(tp),pedActivos.length+' activos','#e8a020');
  html+=rptKPI('Cancelados',pedsMes.filter(function(p){return p.estado==='cancelado';}).length+'','No incluidos','#d44f2e');
  html+=rptKPI('Completados',pedActivos.filter(function(p){return p.estado==='completado';}).length+'','','#1d9e75');
  html+=rptKPI('Pendientes',pedActivos.filter(function(p){return p.estado==='pendiente';}).length+'','','#c4860a');
  html+='</div></div>';
  if(pedsMes.length){
    var byProvM={};
    pedsMes.forEach(function(p){
      if(!byProvM[p.tipo]) byProvM[p.tipo]={peds:[],total:0,completados:0,cancelados:0,pendientes:0};
      byProvM[p.tipo].peds.push(p);
      if(p.estado!=='cancelado') byProvM[p.tipo].total+=p.monto;
      byProvM[p.tipo][p.estado+'s']=(byProvM[p.tipo][p.estado+'s']||0)+1;
    });
    html+='<div class="rpt-section"><div class="rpt-section-title">Pedidos por proveedor</div>';
    Object.keys(byProvM).forEach(function(prov){
      var g=byProvM[prov];
      html+='<div class="rpt-prov-block no-break"><div class="rpt-prov-name">'+esc(prov)+' — Total mes: '+fmtPDF(g.total)+
        ' &nbsp;|&nbsp; <span style="color:#1d9e75">✓ '+(g.completados||0)+' completados</span>'+
        ' &nbsp;<span style="color:#e8a020">⏳ '+(g.pendientes||0)+' pendientes</span>'+
        ' &nbsp;<span style="color:#d44f2e">✗ '+(g.cancelados||0)+' cancelados</span></div>'+
        '<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Fecha</th><th>Descripción</th><th class="center">Cant.</th><th>Estado</th><th>Monto</th></tr></thead><tbody>';
      g.peds.forEach(function(p){
        var ec=p.estado==='completado'?'rpt-tag-green':p.estado==='cancelado'?'rpt-tag-red':'rpt-tag-yellow';
        var et=p.estado==='completado'?'Completado':p.estado==='cancelado'?'Cancelado':'Pendiente';
        var rs=p.estado==='cancelado'?' style="opacity:0.5;text-decoration:line-through"':'';
        html+='<tr'+rs+'><td>'+fmtDate(p.fecha)+'</td><td>'+esc(p.desc)+'</td><td class="center">'+p.cant+'</td><td><span class="rpt-tag '+ec+'">'+et+'</span></td><td class="num">'+fmtPDF(p.monto)+'</td></tr>';
      });
      html+='</tbody></table></div></div>';
    });
    html+='</div>';
  } else { html+='<p style="font-size:12px;color:#aaa">Sin pedidos este mes.</p>'; }
  html+=rptFooter(); return html;
}

// ─── REPORTE INVENTARIO SEMANAL ───
function buildReporteInventarioSemanal(){
  var days=getWeekDays(currentDate);
  var html=rptHeader('Reporte de Inventario — Semanal','Semana del '+fmtDateObj(days[0])+' al '+fmtDateObj(days[6]));
  // Ventas de inventario en la semana (productos vendidos)
  var ventasProd={};
  days.forEach(function(d){
    var dd=getDayData(d);
    dd.ventas.forEach(function(v){
      if(v.productoId){
        if(!ventasProd[v.productoId]) ventasProd[v.productoId]={cant:0,monto:0};
        ventasProd[v.productoId].cant+=v.cant;
        ventasProd[v.productoId].monto+=v.monto;
      }
    });
  });
  html+='<div class="rpt-section no-break"><div class="rpt-section-title">Estado actual del inventario</div>';
  if(productos.length){
    html+='<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Producto</th><th class="center">Stock actual</th><th>Unidad</th><th>Vendido semana</th><th>Ingresado semana</th><th>Estado</th><th>Valor stock</th></tr></thead><tbody>';
    productos.forEach(function(p){
      var vend=ventasProd[p.id]||{cant:0,monto:0};
      // pedidos completados que afectan este producto esta semana
      var semKeys=days.map(function(d){return dateKey(d);});
      var ingresado=pedidosGlobal.filter(function(ped){return ped.productoId===p.id&&ped.estado==='completado'&&semKeys.indexOf(ped.fecha)!==-1;}).reduce(function(a,ped){return a+ped.cant;},0);
      var sc=p.cantidad<=0?'rpt-tag-red':p.cantidad<=5?'rpt-tag-yellow':'rpt-tag-green';
      html+='<tr><td><strong>'+esc(p.nombre)+'</strong></td><td class="center"><span class="rpt-tag '+sc+'">'+p.cantidad+'</span></td><td>'+esc(p.unidad)+'</td><td class="center">'+(vend.cant>0?'-'+vend.cant:'-')+'</td><td class="center">'+(ingresado>0?'+'+ingresado:'-')+'</td><td><span class="rpt-tag '+sc+'">'+(p.cantidad<=0?'Sin stock':p.cantidad<=5?'Bajo':'OK')+'</span></td><td class="num">'+fmtPDF(p.cantidad*p.precioCosto)+'</td></tr>';
    });
    html+='</tbody></table></div></div>';
  } else { html+='<p style="font-size:12px;color:#aaa">Sin productos.</p>'; }
  html+='</div>';
  html+=rptFooter(); return html;
}

// ─── REPORTE INVENTARIO MENSUAL ───
function buildReporteInventarioMensual(){
  var year=currentDate.getFullYear(),month=currentDate.getMonth();
  var mesNombre=currentDate.toLocaleDateString('es-SV',{month:'long',year:'numeric'});
  var totalDias=new Date(year,month+1,0).getDate();
  var monthDays=[];
  for(var d=1;d<=totalDias;d++) monthDays.push(new Date(year,month,d));
  var monthKeys=monthDays.map(function(d){return dateKey(d);});
  var html=rptHeader('Reporte de Inventario — Mensual',mesNombre.charAt(0).toUpperCase()+mesNombre.slice(1));
  var totalValor=productos.reduce(function(a,p){return a+p.cantidad*p.precioCosto;},0);
  var sinStock=productos.filter(function(p){return p.cantidad<=0;});
  var stockBajo=productos.filter(function(p){return p.cantidad>0&&p.cantidad<=5;});
  html+='<div class="rpt-section"><div class="rpt-section-title">Resumen mensual de inventario</div>';
  html+='<div class="rpt-kpi-row rpt-kpi-row-4">';
  html+=rptKPI('Total productos',productos.length+' items','','#0a3d2e');
  html+=rptKPI('Valor en stock',fmtPDF(totalValor),'precio de costo','#1d9e75');
  html+=rptKPI('Sin stock',sinStock.length+' productos','Requieren reposición','#d44f2e');
  html+=rptKPI('Stock bajo',stockBajo.length+' productos','Revisar pronto','#c4860a');
  html+='</div></div>';
  // Movimientos del mes por producto
  var ventasProd={};
  monthDays.forEach(function(d){
    var dd=getDayData(d);
    dd.ventas.forEach(function(v){
      if(v.productoId){
        if(!ventasProd[v.productoId]) ventasProd[v.productoId]={cant:0,monto:0};
        ventasProd[v.productoId].cant+=v.cant;
        ventasProd[v.productoId].monto+=v.monto;
      }
    });
  });
  html+='<div class="rpt-section no-break"><div class="rpt-section-title">Inventario completo con movimientos del mes</div>';
  if(productos.length){
    html+='<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Producto</th><th class="center">Stock</th><th>Unidad</th><th>Vendido mes</th><th>Ingresos mes</th><th>Costo unit.</th><th>Valor stock</th><th>Estado</th></tr></thead><tbody>';
    productos.forEach(function(p){
      var vend=ventasProd[p.id]||{cant:0,monto:0};
      var ingresado=pedidosGlobal.filter(function(ped){return ped.productoId===p.id&&ped.estado==='completado'&&monthKeys.indexOf(ped.fecha)!==-1;}).reduce(function(a,ped){return a+ped.cant;},0);
      var sc=p.cantidad<=0?'rpt-tag-red':p.cantidad<=5?'rpt-tag-yellow':'rpt-tag-green';
      var sl=p.cantidad<=0?'Sin stock':p.cantidad<=5?'Bajo':'OK';
      html+='<tr><td><strong>'+esc(p.nombre)+'</strong></td><td class="center">'+p.cantidad+'</td><td>'+esc(p.unidad)+'</td><td class="center">'+(vend.cant>0?vend.cant:'-')+'</td><td class="center">'+(ingresado>0?ingresado:'-')+'</td><td class="num">'+fmtPDF(p.precioCosto)+'</td><td class="num" style="font-weight:700">'+fmtPDF(p.cantidad*p.precioCosto)+'</td><td><span class="rpt-tag '+sc+'">'+sl+'</span></td></tr>';
    });
    html+='<tr style="background:#f0ede7;font-weight:700"><td colspan="6">VALOR TOTAL</td><td class="num">'+fmtPDF(totalValor)+'</td><td></td></tr>';
    html+='</tbody></table></div></div>';
  } else { html+='<p style="font-size:12px;color:#aaa">Sin productos en inventario.</p>'; }
  html+='</div>';
  html+=rptFooter(); return html;
}

// ─── DISPARAR REPORTE ───
function generarReporte(tipo){
  var html='';
  if(tipo==='diario') html=buildReporteDiario();
  else if(tipo==='semanal') html=buildReporteSemanal();
  else if(tipo==='mensual') html=buildReporteMensual();
  else if(tipo==='inventario') html=buildReporteInventario();
  else if(tipo==='ventasDiario') html=buildReporteVentasDiario();
  else if(tipo==='ventasSemanal') html=buildReporteVentasSemanal();
  else if(tipo==='ventasMensual') html=buildReporteVentasMensual();
  else if(tipo==='pedidosDiario') html=buildReportePedidosDiario();
  else if(tipo==='pedidosSemanal') html=buildReportePedidosSemanal();
  else if(tipo==='pedidosMensual') html=buildReportePedidosMensual();
  else if(tipo==='inventarioSemanal') html=buildReporteInventarioSemanal();
  else if(tipo==='inventarioMensual') html=buildReporteInventarioMensual();

  // Abrir ventana de impresión con el reporte
  var win = window.open('','_blank');
  if(!win){ toast('⚠ Permite ventanas emergentes para generar el PDF'); return; }
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte</title><style>');
  win.document.write('*{margin:0;padding:0;box-sizing:border-box}');
  win.document.write('body{background:#fff;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a}');
  // Copiar todos los estilos de reporte
  var styleSheets = document.styleSheets;
  for(var i=0;i<styleSheets.length;i++){
    try{
      var rules = styleSheets[i].cssRules||styleSheets[i].rules;
      for(var j=0;j<rules.length;j++){
        var rule = rules[j].cssText||'';
        if(rule.indexOf('rpt-')!==-1||rule.indexOf('no-break')!==-1){
          win.document.write(rule+'\n');
        }
      }
    }catch(e){}
  }
  win.document.write('@media print{.no-print{display:none}.no-break{page-break-inside:avoid}}');
  win.document.write('</style></head><body>');
  win.document.write('<div class="no-print" style="background:#0a3d2e;color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:99">');
  win.document.write('<span style="font-size:14px;font-weight:600">Vista previa del reporte</span>');
  win.document.write('<button onclick="window.print()" style="background:#e8a020;color:#fff;border:none;padding:9px 20px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">⬇ Guardar como PDF</button>');
  win.document.write('</div>');
  win.document.write(html);
  win.document.write('</body></html>');
  win.document.close();
  toast('✓ Reporte generado');
}

// ── INIT ──
loadData();
updateHeaderDate();
updateFondoLabel();
renderAll();
_fbLoad(); // carga desde Firebase y sincroniza
