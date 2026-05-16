// Self-contained admin page (no build step, no deps). Served at GET /admin.
// The admin token is held only in sessionStorage and sent as a request
// header — never placed in the URL. The server still enforces auth.
export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Hummusapiens — Orders</title>
<style>
  :root{--bg:#fbf6ec;--ink:#1f2516;--muted:#6b7163;--line:#e7ddc9;
        --olive:#5b7341;--surface:#fff;--terra:#c2683d}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--ink);
       font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
       padding:2rem 1.25rem;max-width:1080px;margin:0 auto}
  h1{font-size:1.5rem;margin-bottom:.25rem}
  .sub{color:var(--muted);margin-bottom:1.5rem}
  .bar{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin-bottom:1.5rem}
  input{padding:.6rem .8rem;border:1px solid var(--line);border-radius:10px;
        background:var(--surface);min-width:240px}
  button{padding:.6rem 1.1rem;border:0;border-radius:999px;background:var(--olive);
         color:#fff;font-weight:600;cursor:pointer}
  button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
  .msg{color:var(--terra);margin-bottom:1rem;min-height:1.2em}
  table{width:100%;border-collapse:collapse;background:var(--surface);
        border:1px solid var(--line);border-radius:14px;overflow:hidden}
  th,td{padding:.7rem .85rem;text-align:left;border-bottom:1px solid var(--line);
        font-size:.92rem;vertical-align:top}
  th{background:#f3ead9;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;
     color:var(--muted)}
  tr:last-child td{border-bottom:0}
  .pill{display:inline-block;padding:.2rem .6rem;border-radius:999px;font-size:.74rem;
        font-weight:700}
  .paid{background:rgba(91,115,65,.15);color:var(--olive)}
  .created{background:rgba(194,104,61,.15);color:var(--terra)}
  .empty{color:var(--muted);padding:2rem;text-align:center}
  .totals{margin:1rem 0;color:var(--muted)}
  .stock-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
              gap:.6rem}
  .stock-grid label{display:flex;justify-content:space-between;align-items:center;
              gap:.5rem;background:var(--surface);border:1px solid var(--line);
              border-radius:10px;padding:.5rem .75rem;font-size:.9rem}
  .stock-grid input{width:74px;text-align:right;padding:.35rem .5rem;
              border:1px solid var(--line);border-radius:8px}
</style>
</head>
<body>
  <h1>Hummusapiens — Orders</h1>
  <p class="sub">Paid &amp; pending orders. Token stays in this tab only.</p>
  <div class="bar">
    <input id="tok" type="password" placeholder="Admin token" autocomplete="off" />
    <button id="go">Load orders</button>
    <button id="out" class="ghost" type="button">Forget token</button>
    <button id="ref" class="ghost" type="button">Refresh</button>
  </div>
  <div class="msg" id="msg"></div>

  <h2 style="font-size:1.1rem;margin:.5rem 0">Stock</h2>
  <div id="stockwrap" class="stock-grid"></div>
  <div style="margin:.6rem 0 2rem">
    <button id="savestock" type="button">Save stock</button>
    <span id="stockmsg" style="color:var(--olive);margin-left:.6rem"></span>
  </div>

  <h2 style="font-size:1.1rem;margin:.5rem 0">Orders</h2>
  <div class="totals" id="totals"></div>
  <div id="wrap"></div>

<script>
  var K='ha_admin_tok';
  var $=function(id){return document.getElementById(id)};
  function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML}
  function inr(p){return '\\u20B9'+(Number(p||0)/100).toFixed(0)}

  function load(){
    var t=$('tok').value.trim();
    if(!t){$('msg').textContent='Enter the admin token.';return}
    sessionStorage.setItem(K,t);
    $('msg').textContent='Loading…';
    fetch('/api/orders',{headers:{'x-admin-token':t}})
      .then(function(r){return r.json().then(function(j){return {s:r.status,j:j}})})
      .then(function(o){
        if(o.s!==200){$('msg').textContent=o.j.error||('Error '+o.s);$('wrap').innerHTML='';$('totals').textContent='';return}
        $('msg').textContent='';
        render(o.j.orders||[]);
      })
      .catch(function(){$('msg').textContent='Network error.'});
  }

  function render(rows){
    if(!rows.length){$('wrap').innerHTML='<div class="empty">No orders yet.</div>';$('totals').textContent='';return}
    var paid=rows.filter(function(o){return o.status==='paid'});
    var pre=rows.filter(function(o){return o.status==='preorder'});
    var rev=paid.reduce(function(n,o){return n+Number(o.amount||0)},0);
    var prev=pre.reduce(function(n,o){return n+Number(o.amount||0)},0);
    $('totals').textContent=rows.length+' total · '+pre.length+' preorders ('+inr(prev)+' intended) · '+paid.length+' paid · revenue '+inr(rev);
    var h='<table><thead><tr><th>Order</th><th>Status</th><th>Items</th><th>Amount</th><th>Created</th><th>Paid</th><th>Payment ID</th></tr></thead><tbody>';
    rows.forEach(function(o){
      var items=(o.items||[]).map(function(i){return esc(i.qty+'× '+i.name)}).join('<br>');
      var cls=o.status==='paid'?'paid':'created';
      h+='<tr><td>'+esc(o.orderId)+'</td>'+
         '<td><span class="pill '+cls+'">'+esc(o.status)+'</span></td>'+
         '<td>'+items+'</td>'+
         '<td>'+inr(o.amount)+'</td>'+
         '<td>'+esc((o.createdAt||'').replace('T',' ').slice(0,16))+'</td>'+
         '<td>'+esc(o.paidAt?o.paidAt.replace('T',' ').slice(0,16):'—')+'</td>'+
         '<td>'+esc(o.paymentId||'—')+'</td></tr>';
    });
    $('wrap').innerHTML=h+'</tbody></table>';
  }

  function loadStock(){
    fetch('/api/stock').then(function(r){return r.json()}).then(function(d){
      var s=d.stock||{};
      var h='';
      Object.keys(s).forEach(function(name){
        h+='<label><span>'+esc(name)+'</span>'+
           '<input type="number" min="0" data-name="'+esc(name)+'" value="'+
           Number(s[name])+'"></label>';
      });
      $('stockwrap').innerHTML=h||'<div class="empty">No stock data.</div>';
    }).catch(function(){$('stockwrap').innerHTML='<div class="empty">Could not load stock.</div>'});
  }

  function saveStock(){
    var t=sessionStorage.getItem(K);
    if(!t){$('stockmsg').textContent='Load with a token first.';return}
    var map={};
    [].forEach.call(document.querySelectorAll('#stockwrap input'),function(i){
      map[i.getAttribute('data-name')]=Number(i.value);
    });
    $('stockmsg').textContent='Saving…';
    fetch('/api/stock',{method:'POST',
      headers:{'Content-Type':'application/json','x-admin-token':t},
      body:JSON.stringify({stock:map})})
      .then(function(r){return r.json().then(function(j){return{s:r.status,j:j}})})
      .then(function(o){
        $('stockmsg').textContent=o.s===200?'Saved.':(o.j.error||('Error '+o.s));
        if(o.s===200)loadStock();
      })
      .catch(function(){$('stockmsg').textContent='Network error.'});
  }

  $('savestock').onclick=saveStock;
  loadStock();

  $('go').onclick=load;
  $('ref').onclick=load;
  $('tok').addEventListener('keydown',function(e){if(e.key==='Enter')load()});
  $('out').onclick=function(){sessionStorage.removeItem(K);$('tok').value='';$('wrap').innerHTML='';$('totals').textContent='';$('msg').textContent='Token cleared.'};
  var saved=sessionStorage.getItem(K);
  if(saved){$('tok').value=saved;load()}
</script>
</body>
</html>`;
