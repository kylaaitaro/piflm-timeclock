
const btn=document.getElementById("timeClockButton");
const msg=document.getElementById("configurationMessage");
const install=document.getElementById("installButton");
const ok=typeof GOOGLE_FORM_URL==="string"&&GOOGLE_FORM_URL.startsWith("https://")&&!GOOGLE_FORM_URL.includes("PASTE_YOUR");
if(ok){btn.href=GOOGLE_FORM_URL}else{btn.addEventListener("click",e=>e.preventDefault());msg.hidden=false}
let deferredPrompt;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;install.hidden=false});
install.addEventListener("click",async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;install.hidden=true});
if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js"))}
