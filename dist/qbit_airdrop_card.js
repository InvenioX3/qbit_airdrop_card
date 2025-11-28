// /config/www/qbit_airdrop_card.js
// Qbit Airdrop submit card v1

(function () {
  const TAG = "qbit-airdrop-submit-card";
  if (customElements.get(TAG)) return;

  const safe = (o,p,f)=>{try{let v=o;for(let i=0;i<p.length;i++){if(v==null)return f;v=v[p[i]]}return v==null?f:v}catch(e){return f}};

  // dn parser & category inference
  function getDisplayName(magnet){
    const q=String(magnet||"").split("?")[1]||"";
    const params=new URLSearchParams(q);
    const dn=params.get("dn");
    return (dn?decodeURIComponent(dn):String(magnet||"")).replace(/[+]/g," ").trim();
  }
  function inferCategory(magnet){
    const name=getDisplayName(magnet);
    const tok=/S\d{1,2}E\d{1,3}\b/i.exec(name);
    if(!tok)return"";
    let end=tok.index;
    while(end>0){
      const ch=name.charAt(end-1);
      if(ch===" "||ch==="."||ch==="_"||ch==="-" ) end--; else break;
    }
    return name.slice(0,end).replace(/[._]+/g," ").replace(/[ \._\-]+$/g,"").trim();
  }

  // Name truncation: keep through first SxxEyy or Sxx; remove year tokens like "2020" / "(2020)" and anything after
  function cleanTitle(nameRaw){
    const name=String(nameRaw||"");
    if(!name) return name;

    const se=/\bS\d{1,2}E\d{1,3}\b/i.exec(name);
    const s =/\bS\d{1,2}\b/i.exec(name);
    const yr=/\b(?:19|20)\d{2}\b/.exec(name);

    let token=null;
    if (se && (!s || se.index<=s.index) && (!yr || se.index<=yr.index)) {
      token=se;
    } else if (s && (!yr || s.index<=yr.index)) {
      token=s;
    } else if (yr) {
      token=yr;
    }

    let cut=name.length;
    if (token) {
      if (token === yr) {
        // Year case: walk backwards to drop any separator before the year,
        // so we remove " 2020", " (2020)", ".2020", etc.
        let start = token.index;
        while (start > 0) {
          const ch = name.charAt(start - 1);
          if (ch === " " || ch === "." || ch === "_" || ch === "-" || ch === "(") {
            start--;
          } else {
            break;
          }
        }
        cut = start;
      } else {
        // SxxEyy / Sxx: keep inclusive, as before
        cut = token.index + token[0].length;
      }
    }

    const kept=name.slice(0,cut);
    const trimmed=kept.replace(/[ ._-]+$/g,"");
    return trimmed.replace(/\./g," ").replace(/\s{2,}/g," ").trim();
  }

function displayStatus(percentRaw,stateRaw){
  const st = String(stateRaw || "").toLowerCase();

  // Force stalled torrents to show "Stalled" regardless of percent


  const pct = Number(percentRaw);
  if (Number.isFinite(pct) && pct < 100 && st != "stalleddl") return `${pct}%`;

  if (st === "stalleddl") return "←←←←←←";
  if (st === "stalledup") return "Complete";
  if (st === "uploading") return "Seeding";
  if (st === "metadl") return "Meta DL";
  if (st === "moving") return "Moving";
  if (st === "downloading") return "Meta DL";

  return String(stateRaw ?? "");
}

  function formatSize(bytesRaw){
    const b=Number(bytesRaw);
    if(!Number.isFinite(b)||b<0) return "";
    const GB=1024*1024*1024, MB=1024*1024;
    return b>=GB?`${(b/GB).toFixed(1)} GB`:`${(b/MB).toFixed(1)} MB`;
  }

// dlspeed formatter: show e.g. "↓3.8MB" or "↓768KB"
function formatDown(bps){
  const s = Number(bps);
  if (!Number.isFinite(s) || s <= 0) return "";

  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;

  if (s >= GB) {
    return `↓${(s / GB).toFixed(1)}GB`;
  }
  if (s >= MB) {
    return `↓${(s / MB).toFixed(1)}MB`;
  }
  if (s >= KB) {
    return `↓${Math.round(s / KB)}KB`;
  }

  return `↓${Math.round(s)}B`;
}

// upspeed formatter: same formatting as dlspeed but with ↑
function formatUp(bps){
  const s = Number(bps);
  if (!Number.isFinite(s) || s <= 0) return "";

  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;

  if (s >= GB) {
    return `↑${(s / GB).toFixed(1)}GB`;
  }
  if (s >= MB) {
    return `↑${(s / MB).toFixed(1)}MB`;
  }
  if (s >= KB) {
    return `↑${Math.round(s / KB)}KB`;
  }

  return `↑${Math.round(s)}B`;
}

  class Card extends HTMLElement{
    constructor(){
      super();
      this._built = false;
      this._hass = null;
      this._els = {};
      this._statusTimer = null;
      this._armAuto = false;
      this._valueAtFocus = "";
      this._submitting = false;
      this._confirmDelete = false;  // new: integration-level delete confirmation flag
      this._pendingDelete = null;   // { hash, title, type: "full" } when dialog is shown
    }
    setConfig(cfg){
      if(!cfg) throw new Error("qbit-airdrop-submit-card: config is required");
      this._cfg=Object.assign({refresh_label:"Refresh"},cfg);
      if(!this._built) this._build();
    }
    set hass(h){this._hass=h; this._loadActive();}
    getCardSize(){return 6;}

    _build(){
      this._built=true;
      const c=document.createElement("ha-card");
      c.innerHTML=`
        <div class="wrap">
          <div class="row row-input">
            <input id="mag" placeholder="" />
            <div
              id="refresh"
              class="refresh-btn"
              role="button"
              tabindex="0"
              aria-label="${this._cfg.refresh_label || "Refresh"}"
              title="${this._cfg.refresh_label || "Refresh"}"
            >
              ⟳
            </div>
          </div>

          <div class="bar">
            <div class="bar-cell center">
              <div id="status" class="status" role="status" aria-live="polite"></div>
            </div>
          </div>

        <ul id="list" class="list"></ul>

                  <!-- Delete confirmation overlay -->
                  <div id="qa-confirm-overlay" class="qa-confirm-overlay" hidden>
                    <div class="qa-confirm-dialog">
                      <div class="qa-confirm-text"></div>
                      <div class="qa-confirm-buttons">
                        <button type="button" class="qa-confirm-cancel">Cancel</button>
                        <button type="button" class="qa-confirm-ok">Delete</button>
                      </div>
                    </div>
                  </div>
                </div>

                <style>
          .wrap{padding:10px;display:grid;grid-row-gap:12px}
          .row{display:block}
          .row-input{position:relative}

          input{
            width:100%;
            box-sizing:border-box;
            padding:30px 30px;
            border:none;
            border-radius:30px;
            background:var(--card-background-color);
            color:var(--primary-text-color);

            /* image placeholder using magnet.png */
            background-image:url("/local/community/qbit_airdrop_card/magnet.png");
            background-repeat:no-repeat;
            background-position:left;
            background-size:375px 160px;
            padding-left:4px;

            /* make room for overlay refresh button (~40px + padding) */
            padding-right:40px;
          }

          /* Overlay refresh button inside the input pill */
          .refresh-btn{
            position:absolute;
            top:50%;
            right:12px;
            transform:translateY(-50%);
            width:65px;
            height:45px;

            display:flex;
            align-items:center;
            justify-content:center;

            border-radius:50%;
            border:none;
            background:transparent;
            color:var(--secondary-text-color);

            cursor:pointer;
            font-size:0.8rem;
            line-height:1;
            user-select:none;
          }
          .refresh-btn:hover{
            filter:brightness(1.1);
          }

          .bar{display:grid;grid-template-columns:1fr;align-items:center}
          .bar-cell{display:flex;align-items:center;justify-content:center}
          .status{height:1.6em;line-height:1.6em;text-align:center;color:var(--secondary-text-color);overflow:hidden;white-space:nowrap;text-overflow:clip}

          .list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
          .item{
            padding:6px 2px;
            border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);
            display:grid;

            /* ORDER: State(60px) | Down(38px) | Size(7ch) | Name(1fr) */
            grid-template-columns:60px 38px 7ch minmax(0,1fr);

            column-gap:4px; row-gap:0; align-items:center;
          }

          /* Down column (green glyph) */
          .down{
            text-align:right;
            font-variant-numeric: tabular-nums;
            font-size:calc(1em - 3pt);
            color:#16ba3f;
            white-space:nowrap; overflow:hidden; text-overflow:clip;
          }

          /* State column (unchanged behavior; deletes with files) */
          .mid{
            text-align:right;
            font-weight:400;
            font-size:calc(1em - 1pt);
            line-height:1.2;
            align-self:center;
            color:#ebbf10;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:clip;
            cursor:pointer;
			padding:5px;
          }
          .mid.muted{opacity:.45;cursor:default}

          /* Size: clickable remove, colored #12c5de */
          .size{
            margin:0;
			padding-right: 3px;
            text-align:right;
            font-variant-numeric:tabular-nums;
            font-size:calc(1em - 2pt);
            line-height:1.2; align-self:center;
            color:#12c5de;
            white-space:nowrap; overflow:hidden; text-overflow:clip;
            cursor:pointer;
          }
          .size.muted{opacity:.45;cursor:default}

          .title{text-overflow:ellipsis;overflow:clip;white-space:nowrap}

          /* Shimmering gradient text effect for titles */
		  .loading-text {
			background: linear-gradient(90deg, #14c714, #f2f7f2, #f2f7f2, #f2f7f2, #f2f7f2, #f2f7f2, #f2f7f2) -100% / 200%;
			-webkit-background-clip: text;
					background-clip: text;
			color: transparent;
			animation: shimmer 2s linear infinite;
		  }
			.loading-text-uploading {
			  background: linear-gradient(270deg, #14c714, #f2f7f2, #f2f7f2) -100% / 200%;
			  -webkit-background-clip: text;
					  background-clip: text;
			  color: transparent;
			  /* same keyframes, but run them in reverse so motion is opposite */
			  animation: shimmer 2s linear infinite reverse;
			}

          /* Chevron shimmer: same timing on all four cells when applied together */
          .chevron-shimmer {
                      background: linear-gradient(90deg, #0a0a0a, #c77e12, #c77e12, #544444, #544444, #544444) -100% / 200%;
                      -webkit-background-clip: text;
                              background-clip: text;
                      color: transparent;
                      animation: shimmer 2s linear infinite;
                    }

          		/* availability === 0 override: only change the gradient, not the clip */
          		.title-unavailable.loading-text {
          		  background-image: linear-gradient(90deg, #0a0a0a, #c77e12, #c77e12, #544444, #544444, #544444);
          		}

                    /* Delete confirmation dialog overlay */
                    .qa-confirm-overlay[hidden] {
                      display: none;
                    }
                    .qa-confirm-overlay {
                      position: fixed;
                      inset: 0;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      background: rgba(0,0,0,0.45);
                      z-index: 1000;
                    }
                    .qa-confirm-dialog {
                      max-width: 420px;
                      width: 90%;
                      padding: 12px 14px;
                      border-radius: 12px;
                      background: var(--card-background-color);
                      color: var(--primary-text-color);
                      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
                      display: flex;
                      flex-direction: column;
                      gap: 10px;
                    }
                    .qa-confirm-text {
                      font-size: calc(1em - 1pt);
                      line-height: 1.4;
                      max-height: 4.2em;
                      overflow: hidden;
                      white-space: pre-line;
                    }
                    .qa-confirm-buttons {
                      display: flex;
                      justify-content: flex-end;
                      gap: 6px;
                    }
                    .qa-confirm-buttons button {
                      padding: 3px 10px;
                      border-radius: 999px;
                      border: 1px solid var(--divider-color);
                      background: var(--secondary-background-color);
                      color: var(--primary-text-color);
                      font-size: calc(1em - 2pt);
                      cursor: pointer;
                    }
                    .qa-confirm-buttons button:hover {
                      filter: brightness(1.1);
                    }
                    .qa-confirm-ok {
                      border-color: var(--error-color, #b00020);
                      color: var(--error-color, #b00020);
                    }

                    @keyframes shimmer{
                      to{background-position:100%}
                    }
        </style>
      `;
      this.appendChild(c);

      this._els={
        mag:     c.querySelector("#mag"),
        refresh: c.querySelector("#refresh"),
        status:  c.querySelector("#status"),
        list:    c.querySelector("#list"),
      };
      this._els.confirmOverlay = c.querySelector("#qa-confirm-overlay");
      this._els.confirmText    = c.querySelector(".qa-confirm-text");
      this._els.confirmCancel  = c.querySelector(".qa-confirm-cancel");
      this._els.confirmOk      = c.querySelector(".qa-confirm-ok");

      if (this._els.confirmCancel && this._els.confirmOk) {
        this._els.confirmCancel.addEventListener("click", () => {
          this._pendingDelete = null;
          this._updateConfirmOverlay();
        });

        this._els.confirmOk.addEventListener("click", () => {
          const p = this._pendingDelete;
          if (!p) {
            this._updateConfirmOverlay();
            return;
          }
          if (p.type === "full") {
            this._deleteFully(p.hash, p.title || "");
          }
          this._pendingDelete = null;
          this._updateConfirmOverlay();
        });
      }

      const bind=(el,fn)=>{
        el.addEventListener("click",fn);
        el.addEventListener("keydown",(e)=>{
          const k=e.key||e.code;
          if(k==="Enter"||k===" "||k==="Spacebar"||k==="Space"){
            e.preventDefault();fn();
          }
        });
      };
      bind(this._els.refresh,()=>this._onRefresh());

      // Android auto-submit
      this._armAuto=false; this._valueAtFocus="";
      const arm=()=>{ this._armAuto=true; this._valueAtFocus=String(this._els.mag.value||""); };
      const maybe=()=>{
        if(!this._armAuto) return;

        const beforeEmpty = !this._valueAtFocus.trim();
        const now = String(this._els.mag.value || "").trim();

        if (beforeEmpty && now) {
          if (/^magnet:\?/i.test(now)) {
            this._armAuto = false;
            this._onSubmit();
            return;
          } else {
            this._els.mag.value = "";
            this._els.mag.blur();
            this._setStatus("No magnet link found. . .", false, 2000);
            this._armAuto = false;
            this._valueAtFocus = "";
            return;
          }
        }

        this._armAuto = false;
      };
      this._els.mag.addEventListener("focus",arm);
      this._els.mag.addEventListener("pointerdown",arm,{passive:true});
      this._els.mag.addEventListener("touchstart",arm,{passive:true});
      this._els.mag.addEventListener("mousedown",arm,{passive:true});
      this._els.mag.addEventListener("beforeinput",()=>setTimeout(maybe,0));
      this._els.mag.addEventListener("input",()=>setTimeout(maybe,0));
    }

    _setStatus(msg, ok=true, ms=1200){
      const el=this._els.status;
      el.textContent=msg||"";
      el.style.color= ok ? "var(--secondary-text-color)" : "var(--error-color,#b00020)";
      if(this._statusTimer) clearTimeout(this._statusTimer);
      if(msg && ms>0){
        this._statusTimer=setTimeout(()=>{
          el.textContent="";
          this._statusTimer=null;
        }, ms);
      }
    }
    _updateConfirmOverlay(){
      const ov  = this._els.confirmOverlay;
      const txt = this._els.confirmText;
      if (!ov || !txt) return;

      if (!this._pendingDelete) {
        ov.hidden = true;
        return;
      }

      const p = this._pendingDelete;
      const title = p.title || "";
      txt.textContent = title
        ? `Delete torrent and files?\n${title}`
        : "Delete torrent and files?";

      ov.hidden = false;
    }

    async _loadActive(){
      if(!this._hass||!this._els?.list) return;
      try{
        const data = await this._hass.callApi("GET","qbit_airdrop/active");

        // New: read confirm_delete flag from backend; default false if missing
        this._confirmDelete = !!(data && data.confirm_delete);

        const raw = (data && data.ok && Array.isArray(data.items)) ? data.items : [];
                const items=raw.map(r=>{
          if(r&&typeof r==="object"){
            const avRaw = safe(r,["availability"], null);
            const avNum = Number(avRaw);
            const availability = (avRaw == null || !Number.isFinite(avNum)) ? null : avNum;

            return {
              dlspeed: Number(safe(r,["dlspeed"], 0)),
              upspeed: Number(safe(r,["upspeed"], 0)),
              title: cleanTitle(String(safe(r,["title"],"")||"")),
              percent: (typeof safe(r,["percent"],null) === "number" ? safe(r,["percent"],null) : null),
              hash: String(safe(r,["hash"],"") || ""),
              state: String(safe(r,["state"],"") || ""),
              size: safe(r,["size"], null),
              availability: availability
            };
          }
          return {
            dlspeed: 0,
            upspeed: 0,
            title: cleanTitle(String(r || "")),
            percent: null,
            hash: "",
            state: "",
            size: null,
            availability: null
          };
        });
        items.sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:"base"}));
        this._render(items);
      }catch{
        this._render([]);
      }
    }

    _render(items){
      const ul=this._els.list; ul.innerHTML="";
      if(!items.length){
        const li=document.createElement("li"); li.className="item";
        li.innerHTML=
          `<div class="mid muted">—</div>`+
          `<div class="down"></div>`+
          `<div class="size muted">—</div>`+
          `<div class="title">No torrents</div>`;
        ul.appendChild(li); return;
      }
      for(const it of items){
        const li=document.createElement("li"); li.className="item";

        // State first (far left)
        const m=document.createElement("div");
        m.className="mid";
        m.textContent=displayStatus(it.percent,it.state);
        m.title="Delete torrent and files";
        if (it.hash) {
          const doDelete = () => {
            if (!this._confirmDelete) {
              // No confirm: behave exactly as before
              this._deleteFully(it.hash, it.title || "");
              return;
            }

            // Confirm enabled: show custom overlay dialog
            this._pendingDelete = {
              hash:  it.hash,
              title: it.title || "",
              type:  "full",
            };
            this._updateConfirmOverlay();
          };

          m.addEventListener("click", () => doDelete());
          m.addEventListener("keydown", (e) => {
            const k = e.key || e.code;
            if (k === "Enter" || k === " " || k === "Spacebar" || k === "Space") {
              e.preventDefault();
              doDelete();
            }
          });
        } else {
          m.classList.add("muted");
        }

        // Down
        const d = document.createElement("div");
        d.className = "down";
        const stLower = String(it.state || "").toLowerCase();
        if (stLower === "stalleddl") {
          d.textContent = "←←←←←←";
        } else if (stLower === "uploading") {
          // Show upspeed, formatted the same way as dlspeed, with an up-arrow glyph
          d.textContent = formatUp(it.upspeed); // blank when <= 0
        } else {
          d.textContent = formatDown(it.dlspeed); // blank when <= 0
        }

        // Size
        const s=document.createElement("div");
        s.className="size";
        if (stLower === "stalleddl") {
          s.textContent = "←←←←←←";
        } else {
          s.textContent = formatSize(it.size);
        }
        s.title="Remove (keep files)";
        if(it.hash){
          s.addEventListener("click",()=>this._removeOnly(it.hash,it.title||""));
        } else {
          s.classList.add("muted");
        }


        // Title (name)
        // - availability === 0  => orange shimmer (existing rule, preserved)
        // - else if state === "downloading" => green shimmer
        // - else => no shimmer
        const t=document.createElement("div");
        t.className="title";
        t.textContent=it.title||"";

        // NEW: if state is "stalledup", tint the title gray
        if (stLower === "stalledup") {
          t.style.color = "#828282";
        }

        if (it.availability === 0 || it.state === "stalleddl" ) {
          // Orange shimmer for unavailable items
          t.classList.add("loading-text","title-unavailable");

          if (stLower === "stalleddl" || stLower === "metadl") {
            m.textContent = "←←←←←←";
            d.textContent = "←←←←←←";
            s.textContent = "←←←←←←";

            // Remove any previous green shimmer classes
            t.classList.remove("loading-text","loading-text-uploading");
            m.classList.remove("loading-text","loading-text-uploading");
            d.classList.remove("loading-text","loading-text-uploading");
            s.classList.remove("loading-text","loading-text-uploading");

            // Apply the same chevron shimmer class to all four cells
            t.classList.add("chevron-shimmer");
            m.classList.add("chevron-shimmer");
            d.classList.add("chevron-shimmer");
            s.classList.add("chevron-shimmer");
          }
        } else if (stLower === "downloading") {
          // Downloading shimmer (existing behavior)
          t.classList.add("loading-text");
        } else if (stLower === "uploading") {
          // Uploading shimmer, using the 270deg variant
          t.classList.add("loading-text-uploading");
        }

        li.appendChild(m);
        li.appendChild(d);
        li.appendChild(s);
        li.appendChild(t);
        ul.appendChild(li);
      }
    }

    async _removeOnly(hash,title){
      if(!hash) return;
      this._setStatus(title?`Removing: ${title}`:"Removing…");
      try{
        await this._hass.callApi("POST","qbit_airdrop/delete",{hash,deleteFiles:false});
        this._setStatus("Removed");
      }catch{
        this._setStatus("Remove failed",false,2000);
      }
      setTimeout(()=>{ this._loadActive(); },600);
    }

    async _deleteFully(hash,title){
      if(!hash) return;
      this._setStatus(title?`Deleting (files): ${title}`:"Deleting…");
      try{
        await this._hass.callApi("POST","qbit_airdrop/delete",{hash,deleteFiles:true});
        this._setStatus("Deleted");
      }catch{
        this._setStatus("Delete failed",false,2000);
      }
      setTimeout(()=>{ this._loadActive(); },900);
    }

    async _onSubmit(){
      if(this._submitting) return; this._submitting=true;
      const magnet=(this._els.mag.value||"").trim();
      if(!magnet){
        this._setStatus("Paste a magnet link",false,1600);
        this._submitting=false;
        return;
      }
      const category=inferCategory(magnet);
      try{
        const payload=category?{magnet,category}:{magnet};
        await this._hass.callService("qbit_airdrop","add_magnet",payload);
        this._els.mag.value="";
        this._els.mag.blur();
        this._setStatus("Submitted");
      }catch{
        this._setStatus("Submit failed",false,2000);
      }finally{
        this._submitting=false;
      }
      setTimeout(()=>{ this._loadActive(); },900);
    }

    async _onRefresh(){
      this._setStatus("Refreshing…");
      try{
        await this._hass.callService("qbit_airdrop","reload_entry",{});
      }catch{}
      setTimeout(()=>{
        this._loadActive();
        this._setStatus("Updated");
      },900);
    }
  }

  customElements.define(TAG, Card);
})();
