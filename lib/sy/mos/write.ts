import { zipSync, strToU8 } from 'fflate';
import { a1, colName, colNo } from './read';
import type { BookSpec, ChartSpec, St } from './types';

// MOS コース: 配る練習用ファイル（.xlsx）を作る。Excel 本体は使わない（XML を組んで zip にする）。
//   入るもの: 値・数式・かんたんな書式・列幅・結合・ウィンドウ枠の固定・テーブル・グラフ（縦棒／横棒／折れ線／円）・条件付き書式・リンク・名前の定義・プロパティ
//   ・数式は 計算結果を入れずに書く（開いた時に Excel が計算する＝fullCalcOnLoad）
//   ・どのレッスンのファイルかは 隠した名前 _bdsh に入れる（本人がファイル名を変えても分かる）
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const BUILTIN: Record<string, number> = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, 'yyyy/m/d': 14, '@': 49 };

export function cellsIn(range: string): string[] {
  const [s, e] = range.split(':'); const a = a1(s), b = a1(e || s); if (!a || !b) return [];
  const out: string[] = []; for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) out.push(colName(c) + r);
  return out;
}

export function makeXlsx(book: BookSpec, marker = ''): Uint8Array {
  const files: Record<string, string> = {};
  const xfs: string[] = ['{}']; const fmts: string[] = [];
  const xfOf = (st: St | undefined) => { const k = JSON.stringify(st || {}); let i = xfs.indexOf(k); if (i < 0) { xfs.push(k); i = xfs.length - 1; } return i; };
  const dxfs: string[] = [];
  let nTable = 0, nDraw = 0, nChart = 0;
  const types: string[] = [];

  book.sheets.forEach((sh, si) => {
    const n = si + 1; const stOf: Record<string, St> = {};
    for (const [range, st] of Object.entries(sh.styles || {})) for (const c of cellsIn(range)) stOf[c] = { ...stOf[c], ...st };
    const rows: string[] = []; const nRows = Math.max(sh.grid.length, ...Object.keys(stOf).map((c) => a1(c)!.r));
    for (let r = 1; r <= nRows; r++) {
      const line = sh.grid[r - 1] || []; const cs: string[] = []; const nCols = Math.max(line.length, ...Object.keys(stOf).filter((c) => a1(c)!.r === r).map((c) => a1(c)!.c), 0);
      for (let c = 1; c <= nCols; c++) {
        const ref = colName(c) + r; const v = line[c - 1]; const s = stOf[ref] ? ` s="${xfOf(stOf[ref])}"` : '';
        if (v === null || v === undefined || v === '') { if (s) cs.push(`<c r="${ref}"${s}/>`); }
        else if (typeof v === 'number') cs.push(`<c r="${ref}"${s}><v>${v}</v></c>`);
        else if (v.startsWith('=')) cs.push(`<c r="${ref}"${s}><f>${esc(v.slice(1))}</f></c>`);
        else cs.push(`<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`);
      }
      if (cs.length) rows.push(`<row r="${r}">${cs.join('')}</row>`);
    }
    const rels: string[] = []; const rid = (type: string, target: string, ext = false) => { rels.push(`<Relationship Id="rId${rels.length + 1}" Type="${REL}/${type}" Target="${esc(target)}"${ext ? ' TargetMode="External"' : ''}/>`); return `rId${rels.length}`; };
    const cols = Object.entries(sh.widths || {}).sort((a, b) => colNo(a[0]) - colNo(b[0])).map(([c, w]) => `<col min="${colNo(c)}" max="${colNo(c)}" width="${w}" customWidth="1"/>`).join('');
    const fz = sh.freeze; const pane = fz && (fz.rows || fz.cols) ? `<pane${fz.cols ? ` xSplit="${fz.cols}"` : ''}${fz.rows ? ` ySplit="${fz.rows}"` : ''} topLeftCell="${colName(fz.cols + 1)}${fz.rows + 1}" activePane="${fz.rows && fz.cols ? 'bottomRight' : fz.rows ? 'bottomLeft' : 'topRight'}" state="frozen"/>` : '';
    const cf = (sh.cf || []).map((c, k) => { dxfs.push(`<dxf><fill><patternFill><bgColor rgb="FF${c.fill}"/></patternFill></fill></dxf>`); return `<conditionalFormatting sqref="${c.ref}"><cfRule type="cellIs" dxfId="${dxfs.length - 1}" priority="${k + 1}" operator="${c.op}">${c.val.split(',').map((v) => `<formula>${esc(v)}</formula>`).join('')}</cfRule></conditionalFormatting>`; }).join('');
    const links = (sh.links || []).map((l) => `<hyperlink ref="${l.ref}" r:id="${rid('hyperlink', l.url, true)}"/>`).join('');
    let drawing = '', tables = '';
    if (sh.charts?.length) {
      nDraw++; const dRels: string[] = [];
      const anchors = sh.charts.map((c, k) => {
        nChart++; files[`xl/charts/chart${nChart}.xml`] = chartXml(c); types.push(`<Override PartName="/xl/charts/chart${nChart}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        dRels.push(`<Relationship Id="rId${k + 1}" Type="${REL}/chart" Target="../charts/chart${nChart}.xml"/>`);
        const [c1, r1, c2, r2] = c.anchor; const pt = (col: number, row: number) => `<xdr:col>${col - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
        return `<xdr:twoCellAnchor><xdr:from>${pt(c1, r1)}</xdr:from><xdr:to>${pt(c2, r2)}</xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="グラフ ${k + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
      }).join('');
      files[`xl/drawings/drawing${nDraw}.xml`] = `${HEAD}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}">${anchors}</xdr:wsDr>`;
      files[`xl/drawings/_rels/drawing${nDraw}.xml.rels`] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${dRels.join('')}</Relationships>`;
      types.push(`<Override PartName="/xl/drawings/drawing${nDraw}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      drawing = `<drawing r:id="${rid('drawing', `../drawings/drawing${nDraw}.xml`)}"/>`;
    }
    if (sh.table) {
      nTable++; const [s, e] = sh.table.ref.split(':'); const a = a1(s)!, b = a1(e)!;
      const heads = Array.from({ length: b.c - a.c + 1 }, (_, k) => String(sh.grid[a.r - 1]?.[a.c - 1 + k] ?? `列${k + 1}`));
      files[`xl/tables/table${nTable}.xml`] = `${HEAD}<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${nTable}" name="${esc(sh.table.name)}" displayName="${esc(sh.table.name)}" ref="${sh.table.ref}" totalsRowShown="0"><autoFilter ref="${sh.table.ref}"/><tableColumns count="${heads.length}">${heads.map((h, k) => `<tableColumn id="${k + 1}" name="${esc(h)}"/>`).join('')}</tableColumns><tableStyleInfo name="${sh.table.style || 'TableStyleMedium2'}" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;
      types.push(`<Override PartName="/xl/tables/table${nTable}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`);
      tables = `<tableParts count="1"><tablePart r:id="${rid('table', `../tables/table${nTable}.xml`)}"/></tableParts>`;
    }
    const merges = sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    files[`xl/worksheets/sheet${n}.xml`] = `${HEAD}<worksheet ${NS}>${sh.tabColor ? `<sheetPr><tabColor rgb="FF${sh.tabColor}"/></sheetPr>` : ''}<sheetViews><sheetView workbookViewId="0"${si === 0 ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18.75"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows.join('')}</sheetData>${merges}${cf}${links ? `<hyperlinks>${links}</hyperlinks>` : ''}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${sh.landscape ? '<pageSetup paperSize="9" orientation="landscape"/>' : ''}${drawing}${tables}</worksheet>`;
    if (rels.length) files[`xl/worksheets/_rels/sheet${n}.xml.rels`] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
  });

  // 書式（使った組み合わせだけ）
  const fonts = ['<font><sz val="11"/><name val="游ゴシック"/><family val="3"/><charset val="128"/></font>']; const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>'];
  const idx = (list: string[], x: string) => { let i = list.indexOf(x); if (i < 0) { list.push(x); i = list.length - 1; } return i; };
  const xfXml = xfs.map((k) => {
    const st = JSON.parse(k) as St;
    const font = idx(fonts, `<font>${st.b ? '<b/>' : ''}${st.i ? '<i/>' : ''}<sz val="${st.sz || 11}"/>${st.color ? `<color rgb="FF${st.color}"/>` : ''}<name val="游ゴシック"/><family val="3"/><charset val="128"/></font>`);
    const fill = st.fill ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${st.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    let fmt = 0; if (st.fmt) { fmt = BUILTIN[st.fmt] ?? -1; if (fmt < 0) fmt = 164 + idx(fmts, st.fmt); }
    const al = st.h || st.wrap ? `<alignment${st.h ? ` horizontal="${st.h}"` : ''}${st.wrap ? ' wrapText="1"' : ''}/>` : '';
    return `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${st.border ? 1 : 0}" xfId="0"${fmt ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${fill ? ' applyFill="1"' : ''}${st.border ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1"' : ''}>${al}</xf>`;
  });
  files['xl/styles.xml'] = `${HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fmts.length ? `<numFmts count="${fmts.length}">${fmts.map((f, k) => `<numFmt numFmtId="${164 + k}" formatCode="${esc(f)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfXml.length}">${xfXml.join('')}</cellXfs><cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles><dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs></styleSheet>`;

  const q = (name: string) => (/^[A-Za-z0-9_]+$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`); void q;
  const names = [...Object.entries(book.names || {}).map(([k, v]) => `<definedName name="${esc(k)}">${esc(v)}</definedName>`), ...(marker ? [`<definedName name="_bdsh" hidden="1">"${esc(marker)}"</definedName>`] : [])].join('');
  files['xl/workbook.xml'] = `${HEAD}<workbook ${NS}><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${book.sheets.map((s, k) => `<sheet name="${esc(s.name)}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('')}</sheets>${names ? `<definedNames>${names}</definedNames>` : ''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${book.sheets.map((_, k) => `<Relationship Id="rId${k + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join('')}<Relationship Id="rId${book.sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`;
  const p = book.props || {};
  files['docProps/core.xml'] = `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${p.title ? `<dc:title>${esc(p.title)}</dc:title>` : ''}${p.subject ? `<dc:subject>${esc(p.subject)}</dc:subject>` : ''}<dc:creator>${esc(p.creator || 'bdsh')}</dc:creator>${p.keywords ? `<cp:keywords>${esc(p.keywords)}</cp:keywords>` : ''}${p.description ? `<dc:description>${esc(p.description)}</dc:description>` : ''}${p.category ? `<cp:category>${esc(p.category)}</cp:category>` : ''}</cp:coreProperties>`;
  files['docProps/app.xml'] = `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>`;
  files['_rels/.rels'] = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  files['[Content_Types].xml'] = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${book.sheets.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${types.join('')}</Types>`;
  // [Content_Types].xml を先頭に（Excel は順番を気にしないが、ほかの道具のため）
  const order = ['[Content_Types].xml', ...Object.keys(files).filter((k) => k !== '[Content_Types].xml')];
  return zipSync(Object.fromEntries(order.map((k) => [k, strToU8(files[k])])), { level: 6 });
}

function chartXml(c: ChartSpec): string {
  const C = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const ser = c.series.map((s, k) => `<c:ser><c:idx val="${k}"/><c:order val="${k}"/><c:tx><c:strRef><c:f>${esc(s.name)}</c:f></c:strRef></c:tx>${c.type === 'line' ? '<c:marker><c:symbol val="none"/></c:marker>' : ''}<c:cat><c:strRef><c:f>${esc(c.cats)}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${esc(s.vals)}</c:f></c:numRef></c:val></c:ser>`).join('');
  const ax = '<c:axId val="111111111"/><c:axId val="222222222"/>';
  const axes = `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${c.type === 'bar' ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="222222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${c.type === 'bar' ? 'b' : 'l'}"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="111111111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  const plot = c.type === 'pie' ? `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>`
    : c.type === 'line' ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${ser}<c:marker val="1"/>${ax}</c:lineChart>${axes}`
    : `<c:barChart><c:barDir val="${c.type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:gapWidth val="219"/>${ax}</c:barChart>${axes}`;
  const title = c.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ja-JP"/><a:t>${esc(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  const legend = c.legend === 'none' ? '' : `<c:legend><c:legendPos val="${c.legend || 'r'}"/><c:overlay val="0"/></c:legend>`;
  return `${HEAD}<c:chartSpace ${C}><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}
