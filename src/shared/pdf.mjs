import { PDFDocument, StandardFonts, rgb, drawCheckBox } from 'pdf-lib';

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').replace(/\r/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(page, text, opts) {
  const { x, y, width, font, size = 9, lineHeight = 11, maxLines = 999, color = rgb(0,0,0) } = opts;
  const lines = wrapText(text, font, size, width).slice(0, maxLines);
  lines.forEach((line, i) => page.drawText(line, { x, y: y - i * lineHeight, size, font, color }));
  return y - lines.length * lineHeight;
}


function label(page, text, x, y, font, size = 8) {
  page.drawText(text, { x, y, size, font, color: rgb(.15,.15,.15) });
}

function addTextField(form, page, name, x, y, w, h, value, fontSize = 9, multiline = false, font = null) {
  const field = form.createTextField(name);
  field.setText(String(value || ''));
  if (multiline) field.enableMultiline();
  field.addToPage(page, { x, y, width: w, height: h, borderWidth: 0.7, borderColor: rgb(.55,.55,.55), backgroundColor: rgb(1,1,1), ...(font ? { font } : {}) });
  // pdf-lib requires a /DA (default appearance) before setFontSize().
  // addToPage() creates that appearance when a font is supplied.
  field.setFontSize(fontSize);
  return field;
}


function addYesNoChoice(form, page, name, yesX, noX, y) {
  // Keep radio-group semantics (mutually exclusive), but render the options as square check boxes
  // with a check mark instead of circular radio buttons.
  const group = form.createRadioGroup(name);
  const opts = { width: 13, height: 13, borderWidth: 0, backgroundColor: rgb(1,1,1) };
  group.addOptionToPage('yes', page, { x: yesX, y, ...opts });
  group.addOptionToPage('no', page, { x: noX, y, ...opts });
  group.updateAppearances(() => ({
    on: drawCheckBox({ x:0, y:0, width:13, height:13, thickness:1.6, borderWidth:0.9, markColor:rgb(.08,.24,.38), color:rgb(1,1,1), borderColor:rgb(.28,.38,.46), filled:true }),
    off: drawCheckBox({ x:0, y:0, width:13, height:13, thickness:1.6, borderWidth:0.9, markColor:rgb(.08,.24,.38), color:rgb(1,1,1), borderColor:rgb(.28,.38,.46), filled:false })
  }));
  return group;
}

export const PDF_TEXT = {
  no: {
    docTitle:'SJA - SIKKER JOBB-ANALYSE', sjaNo:'SJA nr.', page:'Side', basic:'Grunninfo', participants:'Deltakere', participantsContinued:'Deltakere (fortsetter)', noParticipants:'Ingen deltakere lagt til',
    name:'Navn', department:'Avdeling', role:'Rolle', activityFallback:'Aktivitet', riskBefore:'Risiko før tiltak', residualRisk:'Restrisiko', notAssessed:'Ikke vurdert', veryLow:'Svært Lav', low:'Lav', medium:'Medium', high:'Høy', veryHigh:'Svært Høy',
    workRisk:'Arbeidsoppgaver og risiko', workRiskContinued:'Arbeidsoppgaver og risiko (fortsetter)', hazard:'Fare', consequence:'Mulig konsekvens', measure:'Tiltak', status:'Status', controlDone:'Tiltak utført', controlNotDone:'Tiltak ikke utført', noActivities:'Ingen arbeidsoppgaver lagt til',
    checklist:'Sjekkliste', checklistContinued:'Sjekkliste (fortsetter)', checklistItem:'Sjekkpunkt', yes:'Ja', no:'Nei', comment:'Kommentar', controlsVerification:'Kontroll av tiltak fra risikovurderingen', generalChecklist:'Generelle og arbeidsspesifikke sjekkpunkter', controlQuestion:'Er dette tiltaket på plass og effektivt før arbeidet starter?',
    completion:'Avslutning og signering', completionContinued:'Avslutning og signering (fortsetter)', additionalComments:'Tilleggskommentarer', date:'Dato', signature:'Signatur', workDescription:'Arbeidsbeskrivelse', siteArea:'Kontrakt / sted / område', responsible:'Ansvarlig', riskFactors:'Risikofaktorer', noHazards:'Ingen farer identifisert',
    acknowledgement:'Ved å signere nedenfor bekrefter jeg at jeg har lest og forstått denne SJA-en, inkludert identifiserte farer, tiltak og forutsetninger for arbeidet. Jeg har også gjennomgått sjekklisten og kontrollert tiltakene som skal være på plass før arbeidet starter. Jeg forplikter meg til å følge kravene som er beskrevet i denne analysen.',
    previewTitle:'SJA-forhåndsvisning', saveTitle:'Lagre SJA som PDF'
  },
  en: {
    docTitle:'SJA - SAFE JOB ANALYSIS', sjaNo:'SJA no.', page:'Page', basic:'Basic information', participants:'Participants', participantsContinued:'Participants (continued)', noParticipants:'No participants added',
    name:'Name', department:'Department', role:'Role', activityFallback:'Activity', riskBefore:'Risk before controls', residualRisk:'Residual risk', notAssessed:'Not assessed', veryLow:'Very Low', low:'Low', medium:'Medium', high:'High', veryHigh:'Very High',
    workRisk:'Work activities and risk', workRiskContinued:'Work activities and risk (continued)', hazard:'Hazard', consequence:'Potential consequence', measure:'Control measure', status:'Status', controlDone:'Control completed', controlNotDone:'Control not completed', noActivities:'No work activities added',
    checklist:'Checklist', checklistContinued:'Checklist (continued)', checklistItem:'Checklist item', yes:'Yes', no:'No', comment:'Comment', controlsVerification:'Verification of controls from the risk assessment', generalChecklist:'General and task-specific checklist', controlQuestion:'Is this control in place and effective before work starts?',
    completion:'Completion and signatures', completionContinued:'Completion and signatures (continued)', additionalComments:'Additional comments', date:'Date', signature:'Signature', workDescription:'Work description', siteArea:'Contract / site / area', responsible:'Responsible', riskFactors:'Risk factors', noHazards:'No hazards identified',
    acknowledgement:'By signing below, I confirm that I have read and understood this SJA, including the identified hazards, control measures and conditions for the work. I have also reviewed the checklist and verified the controls required before work starts. I agree to follow the requirements described in this analysis.',
    previewTitle:'SJA Preview', saveTitle:'Save SJA PDF'
  }
};

export async function buildPdf(data) {
  const lang = data?.documentLanguage === 'en' ? 'en' : 'no';
  const T = PDF_TEXT[lang];
  const pdf = await PDFDocument.create();
  const form = pdf.getForm();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const PAGE = [595.28, 841.89]; // A4 portrait
  const M = 34;
  const CONTENT_W = PAGE[0] - M * 2;
  const TOP = PAGE[1] - 34;
  const BOTTOM = 34;
  const line = rgb(.34,.40,.44);
  const accent = rgb(.10,.32,.49);
  const accentDark = rgb(.07,.24,.38);
  const light = rgb(.90,.95,.98);
  const lighter = rgb(.965,.98,.99);
  const black = rgb(.07,.09,.10);
  const green = rgb(.13,.48,.21);
  const amber = rgb(.78,.43,.03);
  const red = rgb(.72,.12,.12);
  let page;
  let y;
  let pageNo = 0;

  const riskLevel = (risk) => {
    const p=Number(risk?.probability||0), c=Number(risk?.consequence||0);
    const legacy=data?.riskModelVersion==='4x4-v1';
    const matrix=legacy
      ? {1:{1:'low',2:'low',3:'low',4:'medium'},2:{1:'low',2:'low',3:'medium',4:'medium'},3:{1:'low',2:'medium',3:'medium',4:'high'},4:{1:'medium',2:'medium',3:'high',4:'high'}}
      : {1:{1:'veryLow',2:'veryLow',3:'low',4:'medium'},2:{1:'veryLow',2:'low',3:'medium',4:'medium'},3:{1:'low',2:'medium',3:'high',4:'veryHigh'},4:{1:'medium',2:'medium',3:'veryHigh',4:'veryHigh'}};
    return matrix[c]?.[p] || 'none';
  };
  const riskText = (risk) => {
    const p=Number(risk?.probability||0), c=Number(risk?.consequence||0);
    if (!p || !c) return T.notAssessed;
    const labels={veryLow:T.veryLow,low:T.low,medium:T.medium,high:T.high,veryHigh:T.veryHigh};
    return `${labels[riskLevel(risk)] || T.notAssessed} (${p} x ${c} = ${p*c})`;
  };
  const riskColor = (risk) => ({veryLow:green,low:green,medium:amber,high:red,veryHigh:red}[riskLevel(risk)] || black);

  function newPage() {
    page = pdf.addPage(PAGE);
    pageNo += 1;
    const { width, height } = page.getSize();
    page.drawText(T.docTitle, {x:M,y:height-49,size:19,font:bold,color:accentDark});
    const no = String(data.sjaNo || '');
    const noLabel = `${T.sjaNo}:  ${no}`;
    page.drawText(noLabel,{x:width-M-bold.widthOfTextAtSize(noLabel,9),y:height-45,size:9,font:bold,color:black});
    page.drawLine({start:{x:M,y:height-58},end:{x:width-M,y:height-58},thickness:2,color:accent});
    page.drawText(`${T.page} ${pageNo}`,{x:width-M-38,y:19,size:7,font:regular,color:rgb(.42,.42,.42)});
    y = height - 78;
  }

  function ensureSpace(required, repeatHeading=null) {
    if (!page || y - required < BOTTOM) {
      newPage();
      if (repeatHeading) repeatHeading();
    }
  }

  function sectionHeading(number, title) {
    ensureSpace(32);
    page.drawRectangle({x:M,y:y-18,width:19,height:19,color:accent});
    const n=String(number);
    page.drawText(n,{x:M+9.5-bold.widthOfTextAtSize(n,10)/2,y:y-13.3,size:10,font:bold,color:rgb(1,1,1)});
    page.drawText(title,{x:M+28,y:y-14,size:13,font:bold,color:accentDark});
    y -= 25;
  }

  function fieldRow(labelText, value, x, topY, labelW, valueW, h=22, name=null, fontSize=8.5, multiline=false) {
    page.drawRectangle({x,y:topY-h,width:labelW,height:h,color:light,borderWidth:.55,borderColor:line});
    page.drawRectangle({x:x+labelW,y:topY-h,width:valueW,height:h,color:rgb(1,1,1),borderWidth:.55,borderColor:line});
    drawWrapped(page,labelText,{x:x+6,y:topY-15,width:labelW-12,font:bold,size:8.6,lineHeight:9.5,maxLines:2,color:accentDark});
    if (name) {
      addTextField(form,page,name,x+labelW+3,topY-h+3,valueW-6,h-6,value,fontSize,multiline,regular);
    } else {
      drawWrapped(page,value,{x:x+labelW+6,y:topY-15,width:valueW-12,font:regular,size:fontSize,lineHeight:10.5,maxLines:Math.max(1,Math.floor((h-7)/10.5)),color:black});
    }
  }

  function tableHeader(cols, topY, h=20) {
    cols.forEach(c=>{
      page.drawRectangle({x:c.x,y:topY-h,width:c.w,height:h,color:light,borderWidth:.55,borderColor:line});
      drawWrapped(page,c.label,{x:c.x+5,y:topY-14,width:c.w-10,font:bold,size:8.4,lineHeight:9,maxLines:2,color:accentDark});
    });
    return topY-h;
  }

  function textLines(text, width, size=7.5) {
    return Math.max(1,wrapText(String(text||''),regular,size,width).length);
  }

  function drawParticipantsSection() {
    sectionHeading('2',T.participants);
    const cols=[
      {x:M,w:CONTENT_W*.36,label:T.name},
      {x:M+CONTENT_W*.36,w:CONTENT_W*.32,label:T.department},
      {x:M+CONTENT_W*.68,w:CONTENT_W*.32,label:T.role}
    ];
    y=tableHeader(cols,y,20);
    const participants=(data.participants||[]).filter(p=>String(p.name||p.department||p.role||'').trim());
    if(!participants.length){
      page.drawRectangle({x:M,y:y-24,width:CONTENT_W,height:24,borderWidth:.55,borderColor:line});
      page.drawText(T.noParticipants,{x:M+6,y:y-15,size:8.5,font:regular,color:rgb(.4,.4,.4)}); y-=24;
    } else {
      participants.forEach((p,i)=>{
        const vals=[p.name||'',p.department||'',p.role||''];
        const heights=vals.map((v,idx)=>textLines(v,cols[idx].w-10,8.5));
        const h=Math.max(22,Math.max(...heights)*9+8);
        ensureSpace(h+5,()=>{sectionHeading('2',T.participantsContinued); y=tableHeader(cols,y,20);});
        cols.forEach((c,idx)=>{
          page.drawRectangle({x:c.x,y:y-h,width:c.w,height:h,borderWidth:.55,borderColor:line});
          drawWrapped(page,vals[idx],{x:c.x+5,y:y-13,width:c.w-10,font:regular,size:8.5,lineHeight:10,maxLines:8,color:black});
        });
        y-=h;
      });
    }
    y-=10;
  }

  function activityHeader(index,task) {
    const title=`3.${index+1}  ${String(task.activity||T.activityFallback)}`;
    page.drawRectangle({x:M,y:y-24,width:CONTENT_W,height:24,color:light,borderWidth:.65,borderColor:line});
    page.drawText(title,{x:M+8,y:y-16,size:10.5,font:bold,color:accentDark});
    y-=24;
    const half=CONTENT_W/2;
    page.drawRectangle({x:M,y:y-22,width:half,height:22,color:lighter,borderWidth:.55,borderColor:line});
    page.drawRectangle({x:M+half,y:y-22,width:half,height:22,color:lighter,borderWidth:.55,borderColor:line});
    const beforeLabel=`${T.riskBefore}:`;
    const beforeX=M+8;
    page.drawText(beforeLabel,{x:beforeX,y:y-14,size:8.5,font:bold,color:accentDark});
    const bt=riskText(task.riskBefore);
    page.drawText(bt,{x:beforeX+bold.widthOfTextAtSize(beforeLabel,8.5)+12,y:y-14,size:8.5,font:bold,color:riskColor(task.riskBefore)});
    const afterLabel=`${T.residualRisk}:`;
    const afterX=M+half+8;
    page.drawText(afterLabel,{x:afterX,y:y-14,size:8.5,font:bold,color:accentDark});
    const at=riskText(task.riskAfter);
    page.drawText(at,{x:afterX+bold.widthOfTextAtSize(afterLabel,8.5)+12,y:y-14,size:8.5,font:bold,color:riskColor(task.riskAfter)});
    y-=22;
  }

  function riskTableHeader() {
    const cols=[
      {x:M,w:CONTENT_W*.28,label:T.hazard},
      {x:M+CONTENT_W*.28,w:CONTENT_W*.20,label:T.consequence},
      {x:M+CONTENT_W*.48,w:CONTENT_W*.38,label:T.measure},
      {x:M+CONTENT_W*.86,w:CONTENT_W*.14,label:T.status}
    ];
    y=tableHeader(cols,y,20);
    return cols;
  }

  function drawRiskActivity(task,index) {
    ensureSpace(86,()=>sectionHeading('3',T.workRiskContinued));
    activityHeader(index,task);
    let cols=riskTableHeader();
    const hazards=task.hazards||[], cons=task.consequences||[], measures=task.measures||[];
    const count=Math.max(1,hazards.length,cons.length,measures.length);
    for(let i=0;i<count;i++){
      const hText=hazards[i]||'';
      const cText=cons[i]||cons[Math.min(i,cons.length-1)]||'';
      const mText=measures[i]||'';
      const implemented=!!task.measureVerification?.[i]?.implemented;
      const status=mText?(implemented?T.controlDone:T.controlNotDone):'';
      const vals=[hText,cText,mText,status];
      const fontSizes=[8.4,8.4,8.25,7.9];
      const maxLines=Math.max(...vals.map((v,idx)=>textLines(v,cols[idx].w-10,fontSizes[idx])));
      const rowH=Math.max(28,maxLines*8.7+10);
      if(y-rowH<BOTTOM){
        newPage(); sectionHeading('3',T.workRiskContinued);
        page.drawText(`3.${index+1}  ${String(task.activity||T.activityFallback)} (${lang==='no'?'fortsetter':'continued'})`,{x:M,y:y-12,size:9,font:bold,color:black}); y-=20;
        cols=riskTableHeader();
      }
      cols.forEach((c,idx)=>page.drawRectangle({x:c.x,y:y-rowH,width:c.w,height:rowH,borderWidth:.55,borderColor:line}));
      drawWrapped(page,hText,{x:cols[0].x+5,y:y-13,width:cols[0].w-10,font:regular,size:7.4,lineHeight:8.7,maxLines:12,color:black});
      drawWrapped(page,cText,{x:cols[1].x+5,y:y-13,width:cols[1].w-10,font:regular,size:7.4,lineHeight:8.7,maxLines:12,color:black});
      drawWrapped(page,mText,{x:cols[2].x+5,y:y-13,width:cols[2].w-10,font:regular,size:8.25,lineHeight:9.7,maxLines:14,color:black});
      if(status){
        const sc=implemented?green:red;
        drawWrapped(page,status,{x:cols[3].x+5,y:y-13,width:cols[3].w-10,font:bold,size:7.9,lineHeight:9.2,maxLines:3,color:sc});
      }
      y-=rowH;
    }
    y-=10;
  }

  function checklistHeading(continued=false) {
    sectionHeading('4',continued?T.checklistContinued:T.checklist);
    const cols=[
      {x:M,w:CONTENT_W*.57,label:T.checklistItem},
      {x:M+CONTENT_W*.57,w:CONTENT_W*.075,label:T.yes},
      {x:M+CONTENT_W*.645,w:CONTENT_W*.075,label:T.no},
      {x:M+CONTENT_W*.72,w:CONTENT_W*.28,label:T.comment}
    ];
    y=tableHeader(cols,y,20);
    return cols;
  }

  newPage();
  sectionHeading('1',T.basic);
  // Basic information is deliberately read-only in the PDF. Keep the grid balanced and
  // let identified risks use a full-width row instead of stretching one side of the table.
  const half=CONTENT_W/2;
  const labelW=100;
  let top=y;
  fieldRow(T.sjaNo,data.sjaNo||'',M,top,labelW,half-labelW,24,null,9.3,false);
  fieldRow(T.date,data.date||'',M+half,top,62,half-62,24,null,9.3,false); top-=24;
  fieldRow(T.workDescription,data.workDescription||data.processTask||'',M,top,labelW,CONTENT_W-labelW,36,null,9.2,true); top-=36;
  fieldRow(T.siteArea,data.siteArea||'',M,top,labelW,half-labelW,30,null,9.2,true);
  fieldRow(T.responsible,data.responsible||'',M+half,top,72,half-72,30,null,9.2,false); top-=30;
  const identifiedRisks=[...new Set((data.tasks||[])
    .flatMap(t=>Array.isArray(t.hazards)?t.hazards:[])
    .map(v=>String(v||'').trim())
    .filter(Boolean))].join(', ');
  const riskLines=Math.max(1,wrapText(identifiedRisks||T.noHazards,regular,9.0,CONTENT_W-labelW-12).length);
  const riskH=Math.max(30,Math.min(54,riskLines*10.5+10));
  fieldRow(T.riskFactors,identifiedRisks||T.noHazards,M,top,labelW,CONTENT_W-labelW,riskH,null,9.0,true); top-=riskH;
  y=top-12;

  drawParticipantsSection();

  sectionHeading('3',T.workRisk);
  const tasks=data.tasks||[];
  if(!tasks.length){
    page.drawRectangle({x:M,y:y-28,width:CONTENT_W,height:28,borderWidth:.55,borderColor:line});
    page.drawText(T.noActivities,{x:M+8,y:y-18,size:8,font:regular,color:rgb(.4,.4,.4)}); y-=38;
  } else tasks.forEach((task,index)=>drawRiskActivity(task,index));

  const checklist=data.checklist||[];
  const implementedControlChecks=[];
  (data.tasks||[]).forEach((task,taskIndex)=>{
    (task.measures||[]).forEach((measure,measureIndex)=>{
      const text=String(measure||'').trim();
      if(!text || !task.measureVerification?.[measureIndex]?.implemented) return;
      implementedControlChecks.push({
        taskIndex,
        activity:String(task.activity||`${T.activityFallback} ${taskIndex+1}`).trim(),
        measureIndex,
        text
      });
    });
  });

  ensureSpace(80);
  let checkCols=checklistHeading(false);
  let checkIndex=0;

  // Controls marked as implemented are what the residual-risk assessment relies on.
  // Performing personnel must therefore verify those controls before starting work.
  if(implementedControlChecks.length){
    const h=22;
    page.drawRectangle({x:M,y:y-h,width:CONTENT_W,height:h,color:lighter,borderWidth:.55,borderColor:line});
    page.drawText(`4.1  ${T.controlsVerification}`,{x:M+6,y:y-14,size:8.8,font:bold,color:accentDark});
    y-=h;
    for(const control of implementedControlChecks){
      const q=`3.${control.taskIndex+1} ${control.activity}: ${T.controlQuestion} ${control.text}`;
      const qLines=textLines(q,checkCols[0].w-10,8.3);
      const rowH=Math.max(32,qLines*9.6+10);
      if(y-rowH<BOTTOM){newPage();checkCols=checklistHeading(true);}
      checkCols.forEach(c=>page.drawRectangle({x:c.x,y:y-rowH,width:c.w,height:rowH,borderWidth:.55,borderColor:line}));
      drawWrapped(page,q,{x:checkCols[0].x+5,y:y-13,width:checkCols[0].w-10,font:regular,size:8.3,lineHeight:9.6,maxLines:10,color:black});
      addYesNoChoice(
        form,page,`control_${control.taskIndex}_${control.measureIndex}_answer`,
        checkCols[1].x+(checkCols[1].w-12)/2,
        checkCols[2].x+(checkCols[2].w-12)/2,
        y-rowH/2-6
      );
      addTextField(form,page,`control_${control.taskIndex}_${control.measureIndex}_comment`,checkCols[3].x+3,y-rowH+3,checkCols[3].w-6,rowH-6,'',8,true,regular);
      y-=rowH;
    }
  }

  if(checklist.length){
    const h=22;
    if(y-h<BOTTOM){newPage();checkCols=checklistHeading(true);}
    page.drawRectangle({x:M,y:y-h,width:CONTENT_W,height:h,color:lighter,borderWidth:.55,borderColor:line});
    page.drawText(`${implementedControlChecks.length?'4.2':'4.1'}  ${T.generalChecklist}`,{x:M+6,y:y-14,size:8.8,font:bold,color:accentDark});
    y-=h;
  }

  for(const item of checklist){
    if(item.type==='section'){
      const h=22;
      if(y-h<BOTTOM){newPage();checkCols=checklistHeading(true);}
      page.drawRectangle({x:M,y:y-h,width:CONTENT_W,height:h,color:lighter,borderWidth:.55,borderColor:line});
      const sectionLabel=item.label?.[lang]||item.label?.en||item.label?.no||item.label||'';
      page.drawText(sectionLabel,{x:M+6,y:y-14,size:8.6,font:bold,color:accentDark});
      y-=h; continue;
    }
    const q=item.text?.[lang]||item.text?.en||item.text?.no||item.text||'';
    const qLines=textLines(q,checkCols[0].w-10,8.3);
    const rowH=Math.max(28,qLines*9.6+10);
    if(y-rowH<BOTTOM){newPage();checkCols=checklistHeading(true);}
    checkCols.forEach(c=>page.drawRectangle({x:c.x,y:y-rowH,width:c.w,height:rowH,borderWidth:.55,borderColor:line}));
    drawWrapped(page,q,{x:checkCols[0].x+5,y:y-13,width:checkCols[0].w-10,font:regular,size:8.3,lineHeight:9.6,maxLines:8,color:black});
    addYesNoChoice(
      form,page,`check_${checkIndex}_answer`,
      checkCols[1].x+(checkCols[1].w-12)/2,
      checkCols[2].x+(checkCols[2].w-12)/2,
      y-rowH/2-6
    );
    addTextField(form,page,`check_${checkIndex}_comment`,checkCols[3].x+3,y-rowH+3,checkCols[3].w-6,rowH-6,'',8,true,regular);
    y-=rowH; checkIndex++;
  }
  y-=12;

  ensureSpace(190,()=>{});
  sectionHeading('5',T.completion);
  page.drawText(T.additionalComments,{x:M,y:y-11,size:9,font:bold,color:accentDark});
  addTextField(form,page,'additionalComments',M,y-66,CONTENT_W,48,data.additionalComments||'',9,true,regular); y-=78;

  const acknowledgement = T.acknowledgement;
  const acknowledgementLines = textLines(acknowledgement, CONTENT_W-16, 8.4);
  const acknowledgementH = Math.max(34, acknowledgementLines*10+14);
  ensureSpace(acknowledgementH+80,()=>{});
  page.drawRectangle({x:M,y:y-acknowledgementH,width:CONTENT_W,height:acknowledgementH,color:lighter,borderWidth:.55,borderColor:line});
  drawWrapped(page,acknowledgement,{x:M+8,y:y-14,width:CONTENT_W-16,font:regular,size:8.4,lineHeight:10,maxLines:7,color:black});
  y-=acknowledgementH+8;

  const signCols=[
    {x:M,w:CONTENT_W*.18,label:T.date},
    {x:M+CONTENT_W*.18,w:CONTENT_W*.34,label:T.name},
    {x:M+CONTENT_W*.52,w:CONTENT_W*.48,label:T.signature}
  ];
  y=tableHeader(signCols,y,20);
  const signingParticipants=(data.participants||[]).filter(p=>String(p.name||'').trim());
  const signRows=Math.max(3,signingParticipants.length);
  for(let i=0;i<signRows;i++){
    if(y-28<BOTTOM){
      newPage();
      sectionHeading('5',T.completionContinued);
      y=tableHeader(signCols,y,20);
    }
    const rowH=28;
    signCols.forEach(c=>page.drawRectangle({x:c.x,y:y-rowH,width:c.w,height:rowH,borderWidth:.55,borderColor:line}));
    const participant=signingParticipants[i];
    addTextField(form,page,`participant_sign_${i}_date`,signCols[0].x+3,y-rowH+3,signCols[0].w-6,rowH-6,'',8,false,regular);
    addTextField(form,page,`participant_sign_${i}_name`,signCols[1].x+3,y-rowH+3,signCols[1].w-6,rowH-6,participant?.name||'',8,false,regular);
    addTextField(form,page,`participant_sign_${i}_signature`,signCols[2].x+3,y-rowH+3,signCols[2].w-6,rowH-6,'',8,false,regular);
    y-=rowH;
  }

  form.updateFieldAppearances(regular);
  return pdf.save();
}

