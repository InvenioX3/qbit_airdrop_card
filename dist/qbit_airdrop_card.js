// /config/www/qbit_airdrop_card.js
// Qbit Airdrop submit card v1

(function () {
  const TAG = "qbit-airdrop-submit-card";
  if (customElements.get(TAG)) return;

  const safe = (o,p,f)=>{try{let v=o;for(let i=0;i<p.length;i++){if(v==null)return f;v=v[p[i]]}return v==null?f:v}catch(e){return f}};

  // Some non-English tracker sites prepend a duplicate title in the
  // torrent's native script before the actual (Latin-script) release title,
  // separated by a run of extra whitespace — e.g. "Дорога, дорога домой
  // The Way Way Back (2013) BDRip...". Strip that leading segment when it
  // contains no Latin letters at all, so category/rename inference runs on
  // the real title instead.
  function stripForeignPrefix(nameRaw){
    const name = String(nameRaw || "");
    const m = /^(.*?)\s{2,}(\S.*)$/.exec(name);
    if (!m) return name;
    const lead = m[1];
    if (/[a-z]/i.test(lead)) return name;
    if (!/[^\x00-\x7f]/.test(lead)) return name;
    return m[2];
  }

  // dn parser, shared title analysis, title cleaning, and category inference
  function getDisplayName(magnet){
    const q = String(magnet || "").split("?")[1] || "";
    const params = new URLSearchParams(q);
    const dn = params.get("dn");
	const name = (dn ? decodeURIComponent(dn) : String(magnet || ""))
	  .replace(/[+]/g, " ")
	  .replace(/&amp;/gi, "&")
	  .trim();
	return stripForeignPrefix(name);
  }

  // Shared title analysis
  function analyzeTitle(nameRaw){
    const name = String(nameRaw || "");
    if (!name) {
      return {
        name: "",
        token: null,
        tokenIndex: 0,
        tokenLength: 0,
        tokenType: null,
      };
    }

	const se      = /\bS\d{1,2}E\d{1,3}\b/i.exec(name);
	const s		  = /\bS\d{1,2}\b(?!-\d)/i.exec(name);
	const season  = /\bSeason\s+(\d+)(?:\s*-\s*(\d+))?\b/i.exec(name);
	const complete= /\b(?:Complete\s+Series|Complete\s+Season|Complete)\b/i.exec(name);
	const yr = /\(?\b(?:19|20)\d{2}\b\)?/.exec(name);

	// A season range ("Season 1-9") or a list of distinct season tokens
	// ("S01 S02 S03...") indicates a complete/multi-season release, not a
	// single season — even though the bare regexes above would otherwise
	// match just the first token.
	const seasonIsRange = !!(season && season[2]);
	const multipleSeasonTokens =
		((name.match(/\bS\d{1,2}\b(?!-\d)/gi) || []).length) >= 2;

	let token = null;
	let tokenType = null;

	if (se) {
		token = se;
		tokenType = "se";
	}
	else if (complete || seasonIsRange || multipleSeasonTokens) {
		tokenType = "complete";
		// Redundant season notation (e.g. "S02 Season 2 COMPLETE") can put
		// multiple season-related markers in the title — cut at whichever
		// occurs first so category inference clears all of them, not just
		// the one that triggered "complete" classification.
		token = [complete, season, s]
			.filter(Boolean)
			.reduce((earliest, c) => (!earliest || c.index < earliest.index) ? c : earliest, null);
	}
	else if (s && season) {
		// Redundant season notation in the same title (e.g. "Season 01 S01")
		// — use whichever occurs first so category inference cuts before
		// both, instead of picking by type-priority and leaving the earlier
		// one stuck in the category string.
		if (s.index <= season.index) {
			token = s;
			tokenType = "s";
		} else {
			token = season;
			tokenType = "season";
		}
	}
	else if (s) {
		token = s;
		tokenType = "s";
	}
	else if (season) {
		token = season;
		tokenType = "season";
	}
	else if (yr) {
		token = yr;
		tokenType = "year";
	}

    return {
      name,
      token,
      tokenIndex: token ? token.index : name.length,
      tokenLength: token ? token[0].length : 0,
      tokenType,
    };
  }

	function detectAudio(nameRaw) {
	  const name = String(nameRaw || "");

		const formats = [
		  { name: "Atmos",     re: /\batmos\b/i },
		  { name: "TrueHD",    re: /\btruehd\b/i },
		  { name: "DTS-HD MA", re: /\bdts[\s.-]?hd[\s.-]?ma\b/i },
		  { name: "DTS-HD",    re: /\bdts[\s.-]?hd\b/i },
		  { name: "DTS:X",     re: /\bdts[:\s-]?x\b/i },
		  { name: "DDP",       re: /\bddp(?:\d(?:\.\d)?)?\b/i },
		  { name: "DTS",       re: /\bdts\b/i },
		  { name: "DD",        re: /\bdd(?:\d(?:\.\d)?)?\b/i },
		  { name: "AC3",       re: /\bac3\b/i },
		  { name: "AAC",       re: /\baac(?:\d(?:\.\d)?)?\b/i }
		];

	for (const f of formats) {
	  if (f.re.test(name)) {
		return f.name;
	  }
	}

	return "";
	}

  function analyzeMedia(nameRaw){
	const name = String(nameRaw || "");

	let res = "";

	const r =
	  /\b(2160p|1080p|720p|480p)\b/i.exec(name);

	if (r) {
	  res = r[1];
	}

	let codec = "";

	if (/\b(x265|h[\.\s]?265|hevc)\b/i.test(name)) {
	  codec = "H265";
	}
	else if (/\b(x264|h[\.\s]?264|avc)\b/i.test(name)) {
	  codec = "H264";
	}

	const audio = detectAudio(name);

	return {
	  res,
	  codec,
	  audio
	};
  }

  // Name truncation. Pass a pre-computed `infoParam` (from analyzeTitle) to
  // avoid re-running the analysis when the caller already has it.
  function cleanTitle(nameRaw, infoParam){
	const info = infoParam || analyzeTitle(nameRaw);
	const name = info.name;
	if (!name) return name;

	let normalized = name
	  .replace(/&amp;/gi, "&")
	  .replace(/&quot;/gi, '"')
	  .replace(/&#39;/gi, "'")
	  .replace(/&apos;/gi, "'");

	if (info.tokenType === "year") {
	  const m = /\(?\b((?:19|20)\d{2})\b\)?/.exec(normalized);

	  if (m) {
		const yearDigits = m[1];
		const prefix = normalized
		  .slice(0, m.index)
		  .replace(/[()]/g, "")
		  .replace(/[<>:"/\\|?*]/g, "")
		  .replace(/\./g, " ")
		  .replace(/\s{2,}/g, " ")
		  .trim();
		return prefix ? `${prefix} (${yearDigits})` : `(${yearDigits})`;
	  }
	}

	let cut = name.length;

	if (info.token) {
	  cut = info.tokenIndex + info.tokenLength;
	}

	const kept = normalized.slice(0, cut);

	let trimmed = kept
	  .replace(/[ ._\-\[\]{}()]+$/g, "")
	  .replace(/[()\[\]{}]/g, "");

	if (
	  info.tokenType === "se" ||
	  info.tokenType === "s" ||
	  info.tokenType === "season" ||
	  info.tokenType === "complete"
	) {
	  trimmed = trimmed.replace(
		/\b(?:19|20)\d{2}(?=\s+(?:S\d{1,2}(?:E\d{1,3})?|Season\b))/i,
		""
	  );
	}

	trimmed = trimmed.replace(/[<>:"/\\|?*]/g, "");
	return trimmed
	  .replace(/\./g, " ")
	  .replace(/\s{2,}/g, " ")
	  .trim();
  }

  // Category inference: takes the already-computed display name and
  // analyzeTitle() result so callers don't have to redo that analysis.
  function inferCategory(name, info){
    if (!name || !info.token) {

      return "";
    }

    if (info.tokenType === "year") {
      return "";
    }

    let cut = info.tokenIndex;
    if (cut <= 0) {
      return "";
    }

	const base = name
	  .slice(0, cut)
	  .replace(/[._]+/g, " ")
	  .replace(/[ ._\-\[\]{}()]+$/g, "")
	  .replace(/\(?\b(?:19|20)\d{2}\b\)?\s*$/,"")
	  .trim();

	return base;
  }

function displayStatus(stateRaw, inQueue){
  const st = String(stateRaw || "").toLowerCase();

  if (st === "stalleddl") return "Stalled";
  if (st === "forceddl") return "[F] Downloading";
  if (st === "stalledup" || st === "forcedup") return "Complete";
  if (st === "uploading") return "Seeding";
  if (st === "metadl") return "Meta DL";
  if (st === "moving") return "Moving";
  if (st === "downloading") return "Downloading";
  if (st === "stoppeddl") return inQueue ? "Parsing metadata . . ." : "Stopped";

  return String(stateRaw ?? "");
}

  function formatSize(bytesRaw){
    const b=Number(bytesRaw);
    if(!Number.isFinite(b)||b<0) return "";
    const GB=1024*1024*1024, MB=1024*1024;
    return b>=GB?`${(b/GB).toFixed(1)} GB`:`${(b/MB).toFixed(1)} MB`;
  }

// Speed formatter shared by download/upload: e.g. "↓3.8MB" or "↑768KB"
function formatSpeed(bps, arrow){
  const s = Number(bps);
  if (!Number.isFinite(s) || s <= 0) return "";

  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;

  if (s >= GB) {
    return `${arrow}${(s / GB).toFixed(1)}GB`;
  }
  if (s >= MB) {
    return `${arrow}${(s / MB).toFixed(1)}MB`;
  }
  if (s >= KB) {
    return `${arrow}${Math.round(s / KB)}KB`;
  }

  return `${arrow}${Math.round(s)}B`;
}

// seeds formatter
function formatSeeds(num_seeds, num_complete){
  const s = Number(num_seeds);
  const c = Number(num_complete);

  if (!Number.isFinite(s) || !Number.isFinite(c))
    return "";

  return `${s}(${c})`;
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
      this._confirmDelete = false;
      this._pendingDelete = null;
    }
    setConfig(cfg){
      if(!cfg) throw new Error("qbit-airdrop-submit-card: config is required");
      this._cfg=Object.assign({refresh_label:"Refresh"},cfg);
      if(!this._built) this._build();
    }
    set hass(h){this._hass=h; this._loadActive(); this._loadStats();}
    getCardSize(){return 6;}

    _build(){
      this._built=true;
      const c=document.createElement("ha-card");
      c.innerHTML=`
        <div class="wrap">
          <div class="row row-stats">
            <span class="stat-label">IP:</span>
            <span id="stat-ip" class="stat-value">—</span>
            <span class="stat-label">Free space:</span>
            <span id="stat-free" class="stat-value">—</span>
            <span class="stat-label">D/L:</span>
            <span id="stat-dl" class="stat-value">—</span>
          </div>

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
          .row-stats{
            display:flex;
            flex-wrap:nowrap;
            gap:4px;
			padding:0px 6px 0px 6px;
            font-size:calc(1em - 3pt);
            color:var(--secondary-text-color);
            overflow-x:auto;
          }
          .row-stats .stat-label{
            white-space:nowrap;
            flex-shrink:0;
			padding:0px 0px 0px 10px;
			align-items:right;
          }
          .row-stats .stat-value{
            color:var(--primary-text-color);
            margin-right:8px;
            text-align:end;
            font-variant-numeric:tabular-nums;
            white-space:nowrap;
            flex-shrink:0;
          }
          #stat-ip{ width:70px; }
          #stat-free{ width:50px; }
          #stat-dl{ width:60px; }

          input{
            width:100%;
            box-sizing:border-box;
            padding:30px 30px;
            border:none;
            border-radius:30px;
            background:var(--card-background-color);
            color:var(--primary-text-color);

            /* image placeholder using magnet.png */
            background-image:url("/local/community/qbit_airdrop_card/qbit.gif");
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

          .list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
          .item{
			  padding:4px 0px 6px 8px;
			  border:1px solid var(--divider-color);
			  border-radius:20px;
			  background:var(--card-background-color);
			  row-gap:0px;
			  display:grid;
			  grid-template-columns:32px auto 80px 70px 70px;
			  grid-template-rows:auto auto auto;
          }
          .item.complete{
			  border-color:#65F527;
          }

          /* Trash column (delete torrent + files) */
          .trash{
            display:flex;
            align-items:center;
            justify-content:center;
            color:#ebbf10;
            cursor:pointer;
          }
          .trash.muted{opacity:.45;cursor:default}

          /* Down column (green glyph) */
          .down{
            text-align:right;
            font-variant-numeric: tabular-nums;
            font-size:calc(1em - 2pt);
			line-height:1.2;
			padding:0px 0px 1px;
            color:#16ba3f;
            white-space:nowrap; overflow:hidden; text-overflow:clip;
          }

          /* State column (display only, colored to match size) */
          .mid{
            text-align:left;
            font-weight:400;
            font-size:calc(1em - 2pt);
            line-height:1.2;
			padding:1px 10px 0px 5px;
            color:#12c5de;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:clip;
          }

          /* Percent column — separated out from state, anchored to the
             bottom edge of its cell. */
          .pct{
            display:flex;
            align-items:flex-end;
            justify-content:flex-start;
            font-variant-numeric:tabular-nums;
            font-size:calc(1em - 2pt);
            line-height:1;
            color:var(--secondary-text-color);
            white-space:nowrap;
            overflow:hidden;
          }

		  /* Seeds column: clickable, triggers setForceStart */
		  .seed{
			text-align:left;
			font-variant-numeric:tabular-nums;
			font-size:calc(1em - 2pt);
			line-height:1.2;
			padding:1px 0px 0px 5px;
			color:#b0b0b0;
			white-space:nowrap;
			overflow:hidden;
			text-overflow:clip;
			cursor:pointer;
		  }
          .seed.muted{opacity:.45;cursor:default}

          /* Size: clickable remove, colored #12c5de */
          .size{
            margin:0;
            text-align:left;
            font-variant-numeric:tabular-nums;
            font-size:calc(1em - 2pt);
            line-height:1.2;
			padding-left:6px;
            color:#12c5de;
            white-space:nowrap; overflow:hidden; text-overflow:clip;
            cursor:pointer;
          }
          .size.muted{opacity:.45;cursor:default}

          .title{
			  grid-column:1 / -1;
			  font-size:1.2rem;
			  padding:0px 5px 0px 5px;
			  font-weight:500;
			  white-space:nowrap;
			  overflow:hidden;
			  text-overflow:ellipsis;
			}
		  .media{
			  grid-column:1 / 4;
			  grid-row:2;
			  font-size:calc(1em - 2pt);
			  padding:0px 0px 12px 28px;
			  line-height:1;
			  color:var(--secondary-text-color);
			  white-space:nowrap;
			  overflow:hidden;
			  text-overflow:ellipsis;
			}
			.pct{
			  grid-column:4 / -1;
			  grid-row:2;
			  justify-content:flex-end;
			  padding:0px 25px 0px 0px;
			}
			.trash{
			  grid-column:1;
			  grid-row:3;
			}

			.mid{
			  grid-column:2;
			  grid-row:3;
			}

			.seed{
			  grid-column:3;
			  grid-row:3;
			}

			.down{
			  grid-column:4;
			  grid-row:3;
			}

			.size{
			  grid-column:5;
			  grid-row:3;
			}

          /* Shimmering gradient text effect for titles */
		  .loading-text {
			background: linear-gradient(90deg, #14c714, #f2f7f2, #f2f7f2, #f2f7f2, #f2f7f2, #f2f7f2, #f2f7f2) -100% / 200%;
			-webkit-background-clip: text;
					background-clip: text;
			color: transparent;
			animation: shimmer 5s linear infinite;
		  }
			.loading-text-uploading {
			  background: linear-gradient(270deg, #14c714, #f2f7f2, #f2f7f2) -100% / 200%;
			  -webkit-background-clip: text;
					  background-clip: text;
			  color: transparent;
			  /* same keyframes, but run them in reverse so motion is opposite */
			  animation: shimmer 5s linear infinite reverse;
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
        mag:       c.querySelector("#mag"),
        refresh:   c.querySelector("#refresh"),
        status:    c.querySelector("#status"),
        list:      c.querySelector("#list"),
        statIp:    c.querySelector("#stat-ip"),
        statFree:  c.querySelector("#stat-free"),
        statDl:    c.querySelector("#stat-dl"),
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
            this._delete(p.hash, p.title || "", true);
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

    async _loadStats(){
      if(!this._hass||!this._els?.statFree||!this._els?.statDl||!this._els?.statIp) return;
      try{
        const data = await this._hass.callApi("GET","qbit_airdrop/stats");
        if(!data || !data.ok){
          this._els.statIp.textContent = "—";
          this._els.statFree.textContent = "—";
          this._els.statDl.textContent = "—";
          return;
        }

        this._els.statIp.textContent = data.external_ip ? String(data.external_ip) : "—";

        const freeBytes = Number(data.free_space);
        this._els.statFree.textContent = Number.isFinite(freeBytes)
          ? formatSize(freeBytes)
          : "—";

        const dlBps = Number(data.dl_speed);
        this._els.statDl.textContent = Number.isFinite(dlBps)
          ? `${(dlBps / (1024 * 1024)).toFixed(2)} MB/s`
          : "—";
      }catch{
        this._els.statIp.textContent = "—";
        this._els.statFree.textContent = "—";
        this._els.statDl.textContent = "—";
      }
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
			
			const rawTitle = stripForeignPrefix(String(safe(r,["title"],"") || ""));
			const media = analyzeMedia(rawTitle);
			
            return {
              dlspeed: Number(safe(r,["dlspeed"], 0)),
              upspeed: Number(safe(r,["upspeed"], 0)),
			  num_seeds: Number(safe(r,["num_seeds"], 0)),
			  num_complete: Number(safe(r,["num_complete"], 0)),
			  title: cleanTitle(rawTitle),
			  res: media.res,
              codec: media.codec,
              audio: media.audio,
              percent: (typeof safe(r,["percent"],null) === "number"
			  ? safe(r,["percent"],null)
			  : null),
			  
              hash: String(safe(r,["hash"],"") || ""),
              state: String(safe(r,["state"],"") || ""),
              size: safe(r,["size"], null),
              inQueue: !!safe(r,["in_queue"], false),
              availability: availability
            };
          }
          return {
            dlspeed: 0,
            upspeed: 0,
			num_seeds: 0,
			num_complete: 0,
            title: cleanTitle(String(r || "")),
            percent: null,
            hash: "",
            state: "",
            size: null,
            inQueue: false,
            availability: null
          };
        });
        const _COMPLETE_STATES = new Set(["uploading","stalledup","forcedup"]);
        items.sort((a,b)=>{
          const aDone = _COMPLETE_STATES.has(String(a.state||"").toLowerCase()) ? 0 : 1;
          const bDone = _COMPLETE_STATES.has(String(b.state||"").toLowerCase()) ? 0 : 1;
          if (aDone !== bDone) return aDone - bDone;
          return a.title.localeCompare(b.title,undefined,{numeric:true,sensitivity:"base"});
        });
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
		  `<div class="media"></div>`+
          `<div class="pct"></div>`+
          `<div class="trash muted"></div>`+
          `<div class="mid muted">—</div>`+
          `<div class="seed muted"></div>`+
          `<div class="down"></div>`+
          `<div class="size muted">————</div>`+
          `<div class="title">No torrents</div>`;
        ul.appendChild(li); return;
      }
      for(const it of items){
        const li=document.createElement("li"); li.className="item";

        const stLower = String(it.state || "").toLowerCase();
        const forced = stLower === "forceddl" || stLower === "forcedup";
        if (stLower === "uploading" || stLower === "stalledup" || stLower === "forcedup") {
          li.classList.add("complete");
        }

        // Trash (delete torrent + files) — moved off the state column so an
        // empty-space click inside it no longer triggers delete.
        const del = document.createElement("div");
        del.className = "trash";
        del.innerHTML =
          '<svg viewBox="0 0 24 24" width="14" height="17" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
          '<line x1="4" y1="7" x2="20" y2="7"/>'+
          '<path d="M9 7V4h6v3"/>'+
          '<path d="M6 7l1 13h10l1-13"/>'+
          '<line x1="10" y1="11" x2="10" y2="17"/>'+
          '<line x1="14" y1="11" x2="14" y2="17"/>'+
          '</svg>';
        del.title = "Delete torrent and files";
        if (it.hash) {
          const doDelete = () => {
            if (!this._confirmDelete) {
              this._delete(it.hash, it.title || "", true);
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

          del.setAttribute("role","button");
          del.setAttribute("tabindex","0");
          del.addEventListener("click", () => doDelete());
          del.addEventListener("keydown", (e) => {
            const k = e.key || e.code;
            if (k === "Enter" || k === " " || k === "Spacebar" || k === "Space") {
              e.preventDefault();
              doDelete();
            }
          });
        } else {
          del.classList.add("muted");
        }

        // State — display only now; always reflects displayStatus(), never
        // overwritten to hide it behind an "unavailable" indicator.
        const m=document.createElement("div");
        m.className="mid";
        m.textContent=displayStatus(it.state, it.inQueue);

		// Seeds — clickable, toggles setForceStart based on current state.
		const seed = document.createElement("div");
		seed.className = "seed";
		seed.textContent = `Seeds: ${formatSeeds(it.num_seeds, it.num_complete)}`;
		if (it.hash) {
		  const doForceStart = () => this._forceStart(it.hash, it.title || "", forced);
		  seed.setAttribute("role","button");
		  seed.setAttribute("tabindex","0");
		  seed.addEventListener("click", doForceStart);
		  seed.addEventListener("keydown", (e) => {
			const k = e.key || e.code;
			if (k === "Enter" || k === " " || k === "Spacebar" || k === "Space") {
			  e.preventDefault();
			  doForceStart();
			}
		  });
		} else {
		  seed.classList.add("muted");
		}

        // Down — formatSpeed already returns "" for zero/negative, no
        // separate state-based blanking needed.
        const d = document.createElement("div");
        d.className = "down";
        if (stLower === "uploading") {
          d.textContent = formatSpeed(it.upspeed, "↑");
        } else {
          d.textContent = formatSpeed(it.dlspeed, "↓");
        }

        // Size — placeholder only when metadata genuinely hasn't resolved
        // yet (size <= 0); otherwise always show the real value regardless
        // of current state.
        const s=document.createElement("div");
        s.className="size";
        s.textContent = (Number(it.size) > 0) ? formatSize(it.size) : "————";
        s.title="Remove (keep files)";
        if(it.hash){
          s.addEventListener("click",()=>this._delete(it.hash,it.title||"",false));
        } else {
          s.classList.add("muted");
        }


        // Title (name)
		const t = document.createElement("div");
		t.className = "title";

		const meta = document.createElement("div");
		meta.className = "media";

		meta.textContent = [
		  it.res,
		  it.codec,
		  it.audio
		].filter(Boolean).join(" • ");

		// Percent — end of the same row as meta, separate from the state label.
		const pctVal = Number(it.percent);
		const pctEl = document.createElement("div");
		pctEl.className = "pct";
		pctEl.textContent = Number.isFinite(pctVal) ? `${pctVal}%` : "";

		t.textContent = it.title || "";

		// Gray completed uploads, and forced uploads that currently have no upload traffic.
		const upSpeed = Number(it.upspeed) || 0;

		if (
		  stLower === "stalledup" ||
		  (stLower === "forcedup" && upSpeed === 0)
		) {
		  t.style.color = "#828282";
		}

        // Orange shimmer for unavailable items — title-only indicator now;
        // no longer blanks seed/size/speed or overwrites state.
		const unavailable =
			(it.availability >= 0 &&
			it.availability < 1) ||
			stLower === "stalleddl";

		if (unavailable) {
			t.classList.add("loading-text","title-unavailable");
        } else if (stLower === "downloading" || stLower === "forceddl") {

          t.classList.add("loading-text");
        } else if (stLower === "uploading") {

          t.classList.add("loading-text-uploading");
        }

		li.appendChild(t);
		li.appendChild(meta);
		li.appendChild(pctEl);
		li.appendChild(del);
		li.appendChild(m);
		li.appendChild(seed);
		li.appendChild(d);
		li.appendChild(s);

		ul.appendChild(li);
	  }
    }

    async _delete(hash,title,deleteFiles){
      if(!hash) return;
      const verb = deleteFiles ? "Deleting (files)" : "Removing";
      this._setStatus(title?`${verb}: ${title}`:`${verb}…`);
      try{
        await this._hass.callApi("POST","qbit_airdrop/delete",{hash,deleteFiles});
        this._setStatus(deleteFiles ? "Deleted" : "Removed");
      }catch{
        this._setStatus(deleteFiles ? "Delete failed" : "Remove failed",false,2000);
      }
      setTimeout(()=>{ this._loadActive(); }, deleteFiles ? 900 : 600);
    }

    async _forceStart(hash,title,currentlyForced){
      if(!hash) return;
      const value = !currentlyForced;
      const verb = value ? "Forcing start" : "Un-forcing";
      this._setStatus(title?`${verb}: ${title}`:`${verb}…`);
      try{
        await this._hass.callApi("POST","qbit_airdrop/force_start",{hash,value});
        this._setStatus(value ? "Forced" : "Un-forced");
      }catch{
        this._setStatus("Force start failed",false,2000);
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

      // Computed once and reused below, instead of each derived value
      // re-running getDisplayName/analyzeTitle on the same magnet.
      const rawTitle = getDisplayName(magnet);
      const titleInfo = analyzeTitle(rawTitle);
      const media = analyzeMedia(rawTitle);
      const category = inferCategory(rawTitle, titleInfo);
      const cleanedTitle = cleanTitle(rawTitle, titleInfo);

      try{
		const payload = {
		  magnet,
		  category,

		  rename_name:
			titleInfo.tokenType === "year"
			  ? [
				  cleanedTitle,
				  media.res,
				  media.codec,
				  media.audio
				].filter(Boolean).join(" ")
			  : cleanedTitle,

		  token_type: titleInfo.tokenType,

		  season:
			(() => {
			  if (titleInfo.tokenType === "se") {
				return titleInfo.token[0].match(/S\d+/i)?.[0] || "";
			  }

			  if (titleInfo.tokenType === "s") {
				return titleInfo.token[0].toUpperCase();
			  }

			  if (titleInfo.tokenType === "season") {
				const n = titleInfo.token[0].match(/\d+/)?.[0] || "";
				return n ? `S${String(n).padStart(2, "0")}` : "";
			  }

			  return "";
			})(),
		};

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
        await this._hass.callService("qbit_airdrop","flush_orphaned",{});
      }catch{}
      setTimeout(()=>{
        this._loadActive();
        this._setStatus("Updated");
      },900);
    }
  }

  customElements.define(TAG, Card);
})();
