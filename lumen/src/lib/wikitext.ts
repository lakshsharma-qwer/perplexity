/**
 * Minimal wikitext → plain text converter. Keeps the parts that answer questions:
 * prose, infobox fields ("Born: 1949-11-04") and table rows ("1981–82 | Vicenza | Campobasso").
 */

const DROP_TEMPLATES =
  /^(cite|citation|sfn|harvnb|efn|refn|reflist|notelist|citation needed|cn|fact|failed verification|dead link|webarchive|short description|use (dmy|mdy)|good article|featured article|authority control|portal|commons|wikiquote|wiktionary|main|see also|further|about|redirect|distinguish|for|other uses|pp-|infobox\s*$|navbox|sister project|clear|toc|anchor|coord|official website|in lang|lang-x|update|as of|when|clarify|vague|according to whom|by whom|who|which|page needed|better source|primary source|self-published|unreliable|ref|r$|rp|snd|small caps|nbsp|0)/i;
const DATE_TEMPLATES = /^(birth date|death date|birth date and age|death date and age|start date|end date|dts|date|film date|start date and age|birth year and age|death year and age|bda|dda)/i;
const LIST_TEMPLATES = /^(ubl|unbulleted list|plainlist|flatlist|hlist|bulleted list|indented plainlist|collapsible list|enum)/i;
const FIRST_PARAM = /^(lang|nowrap|nobr|small|big|nihongo|transl|abbr|flag|flagcountry|fb|fbw|flagu|sortname|nobold|nowrap begin|tooltip|keypress|ill|interlanguage link|plural|resize|smaller|larger|color|colour|mvar|math|sup|sub|abbrlink|lang-[a-z]+)$/i;

const INR_UNITS: Record<string, string> = { k: "thousand", l: "lakh", c: "crore", lc: "lakh crore", m: "million", b: "billion", t: "trillion" };
const FORMAT_KEYS = /^(lk|link|year|df|mf|sort|sortable|style|class|align|width|color|colour|background|bg|ref|refs|nowrap|abbr|disp|round|sigfig|adj|size|font|border|id|name|lang|script|italic|bold)$/i;

function splitParams(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "[" && body[i + 1] === "[") depth++;
    if (c === "]" && body[i + 1] === "]") depth--;
    if (c === "|" && depth <= 0) {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts;
}

function renderTemplate(inner: string): string {
  const parts = splitParams(inner);
  const name = parts[0].trim().replace(/_/g, " ");
  const params = parts.slice(1);
  const named: [string, string][] = [];
  const positional: string[] = [];
  for (const p of params) {
    const m = p.match(/^\s*([^=\n]{1,40}?)\s*=([\s\S]*)$/);
    if (m && !/[[\]{}<>]/.test(m[1])) named.push([m[1].trim(), m[2].trim()]);
    else positional.push(p.trim());
  }
  if (/^(cite|citation|sfn|harvnb|efn|refn|reflist|notelist|webarchive|authority control|navbox|sister project)/i.test(name)) return "";
  if (/^infobox|^(taxobox|speciesbox|automatic taxobox|chembox|drugbox)/i.test(name) || named.length >= 4) {
    const title = name.replace(/^infobox\s*/i, "");
    const keep = named.filter(([k, v]) => v && !/^(image|logo|caption|alt|signature|module|embed|upright|map|pushpin|coordinates|footnotes)/i.test(k));
    // Long values are nested content (e.g. Episode table's `episodes=` holding every Episode list), not fields.
    const lines = keep.filter(([, v]) => v.length < 600);
    const blocks = keep.filter(([, v]) => v.length >= 600).map(([, v]) => v);
    return `\n${title ? `[${title}]\n` : ""}${lines.map(([k, v]) => `${k.replace(/_/g, " ")}: ${v.replace(/\n+/g, " ")}`).join("\n")}\n${blocks.join("\n\n")}\n`;
  }
  if (DATE_TEMPLATES.test(name)) {
    const nums = positional.filter((p) => /^\d{1,4}$/.test(p)).slice(0, 3);
    return nums.map((n) => n.padStart(2, "0")).join("-");
  }
  if (/^convert$|^cvt$/i.test(name)) return `${positional[0] || ""} ${positional[1] || ""}`.trim();
  if (LIST_TEMPLATES.test(name)) return positional.filter(Boolean).join(", ").replace(/^\s*\*\s*/gm, "");
  if (/^sortname$/i.test(name)) return `${positional[0] || ""} ${positional[1] || ""}`.trim();
  if (/^(flagicon|flag icon|flagdeco)$/i.test(name)) return "";
  if (/^(lang|transl|nihongo)/i.test(name) && positional.length >= 2) return positional[name.toLowerCase() === "nihongo" ? 0 : 1];
  if (FIRST_PARAM.test(name)) return positional[0] || "";
  if (/^(marriage|married)$/i.test(name)) return `${positional[0] || ""} (m. ${positional.slice(1).join("–")})`;
  if (/^(age|death age)/i.test(name)) return "";
  if (/^(US\$|currency|USD|GBP|€|£|\$)$/i.test(name)) return `${name}${positional[0] || ""}`;
  if (/^inrconvert$/i.test(name)) return `₹${positional[0] || ""} ${INR_UNITS[(positional[1] || "").toLowerCase()] || ""}`.trim();
  if (DROP_TEMPLATES.test(name)) return "";
  // Unknown template: keep short content values (e.g. Timeline-event's date/event) and skip formatting switches.
  const content = named.filter(([k, v]) => v && !FORMAT_KEYS.test(k)).map(([, v]) => v);
  const parts2 = [...positional.filter(Boolean), ...content];
  if (parts2.length && parts2.length <= 3 && positional.length <= 2 && parts2.every((p) => p.length < 400)) return parts2.join(content.length ? " — " : " ");
  return "";
}

function stripBalanced(s: string, open: RegExp): string {
  let out = s;
  for (let guard = 0; guard < 200; guard++) {
    const m = open.exec(out);
    if (!m) break;
    let depth = 0;
    let i = m.index;
    for (; i < out.length - 1; i++) {
      if (out[i] === "[" && out[i + 1] === "[") {
        depth++;
        i++;
      } else if (out[i] === "]" && out[i + 1] === "]") {
        depth--;
        i++;
        if (depth === 0) break;
      }
    }
    out = out.slice(0, m.index) + out.slice(i + 1);
  }
  return out;
}

function convertTables(s: string): string {
  const lines = s.split("\n");
  const out: string[] = [];
  let inTable = 0;
  let row: string[] = [];
  const flush = () => {
    const cells = row.map((c) => c.trim()).filter(Boolean);
    if (cells.length) out.push(cells.join(" | "));
    row = [];
  };
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("{|")) {
      inTable++;
      continue;
    }
    if (!inTable) {
      out.push(line);
      continue;
    }
    if (t.startsWith("|}")) {
      flush();
      inTable--;
      out.push("");
      continue;
    }
    if (t.startsWith("|-")) {
      flush();
      continue;
    }
    if (t.startsWith("|+")) {
      out.push(t.slice(2).trim());
      continue;
    }
    if (t.startsWith("|") || t.startsWith("!")) {
      for (let cell of t.slice(1).split(/\|\||!!/)) {
        // Drop leading cell attributes: `style="..." | value`.
        const m = cell.match(/^[^|]*=[^|]*\|(?!\|)([\s\S]*)$/);
        if (m) cell = m[1];
        row.push(cell);
      }
      continue;
    }
    if (row.length) row[row.length - 1] += " " + t;
  }
  flush();
  return out.join("\n");
}

export function wikitextToText(src: string): string {
  let s = src;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<ref[^>]*\/>/gi, "").replace(/<ref[\s\S]*?<\/ref>/gi, "");
  s = stripBalanced(s, /\[\[(File|Image|Category|Media):/i);
  s = s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1");
  for (let guard = 0; guard < 60 && /\{\{/.test(s); guard++) {
    const next = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => renderTemplate(inner));
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\{\{|\}\}/g, "");
  s = s.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, "$1").replace(/\[https?:\/\/[^\]]+\]/g, "");
  s = convertTables(s);
  s = s.replace(/'{2,5}/g, "");
  s = s.replace(/^[*#:;]+\s*/gm, "- ");
  s = s.replace(/^(={2,6})\s*(.+?)\s*\1\s*$/gm, "\n## $2\n");
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[a-z][^>]*>/gi, "");
  s = s.replace(/&nbsp;|&#160;/g, " ").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&amp;/g, "&");
  s = s.replace(/__[A-Z]+__/g, "");
  // Drop trailing reference/link sections.
  s = s.replace(/\n## (See also|References|External links|Notes|Further reading|Sources|Bibliography|Citations|Footnotes)\n[\s\S]*$/i, "");
  return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}
