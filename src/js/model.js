const B = (en, no) => ({ en, no });
export const checklistTemplate = [
  { type:'section', id:'A', label:B('A — Documentation and transfer of experience','A — Dokumentasjon og erfaringsoverføring') },
  BQ('a1','Are all involved persons familiar with the task/activity?','Er alle involverte kjent med oppgaven/aktiviteten?'), BQ('a2','Are all involved persons familiar with the relevant procedures?','Er alle involverte kjent med relevante prosedyrer?'), BQ('a3','Are any involved persons aware of incidents during similar tasks/activities?','Kjenner noen av de involverte til hendelser under tilsvarende oppgaver/aktiviteter?'),
  { type:'section', id:'B', label:B('B — Competences/resources','B — Kompetanse/ressurser') }, BQ('b1','Does the job require any formal competences/certifications?','Krever arbeidet formell kompetanse/sertifisering?'), BQ('b2','Are the required personnel and competences available for the job?','Er nødvendig personell og kompetanse tilgjengelig?'), BQ('b3','Have all relevant persons participated in completing the SJA?','Har alle relevante personer deltatt i utarbeidelsen av SJA-en?'),
  { type:'section', id:'C', label:B('C — Communication and coordination','C — Kommunikasjon og koordinering') }, BQ('c1','Does the job require coordination between multiple departments/crafts?','Krever arbeidet koordinering mellom flere avdelinger/fag?'), BQ('c2','Are sufficient means of communication available, and are communication lines clear?','Finnes tilstrekkelige kommunikasjonsmidler, og er kommunikasjonslinjene tydelige?'), BQ('c3','Is there a potential for conflicting activities?','Er det fare for konflikt mellom samtidige aktiviteter?'), BQ('c4','Are all roles and responsibilities clearly defined?','Er alle roller og ansvarsområder tydelig definert?'), BQ('c5','Has sufficient time been allocated for safe completion of all activities?','Er det satt av tilstrekkelig tid til sikker gjennomføring?'), BQ('c6','Is deactivation of alarms required, and if so, have all responsible persons been informed? PTW/AT is required.','Må alarmer deaktiveres, og er ansvarlige personer informert? Arbeidstillatelse kreves.'), BQ('c7','Have alternative contingency measures been implemented in place of any deactivated alarms?','Er alternative beredskapstiltak etablert for deaktiverte alarmer?'),
  { type:'section', id:'D', label:B('D — Physical safety systems','D — Fysiske sikkerhetssystemer') }, BQ('d1','Have hazardous equipment been closed/de-energized for the duration of the job?','Er farlig utstyr avstengt/frakoblet energi under arbeidet?'), BQ('d2','Will safety installations be available for the duration of the job?','Vil sikkerhetsinstallasjoner være tilgjengelige under arbeidet?'), BQ('d3','Will emergency power/lighting and emergency exits be available for the duration of the job?','Vil nødstrøm/nødbelysning og nødutganger være tilgjengelige?'),
  { type:'section', id:'E', label:B('E — Equipment','E — Utstyr') }, BQ('e1','Is machine guarding in place, intact and in working order?','Er maskinvern på plass, intakt og i fungerende stand?'), BQ('e2','Are lifting equipment, specialist tools and other equipment available, controlled and in working order, and are relevant persons familiar with safe use?','Er løfteutstyr, spesialverktøy og annet utstyr tilgjengelig, kontrollert og i orden, og kjenner relevante personer sikker bruk?'), BQ('e3','Do all involved persons have sufficient and correct personal protective equipment?','Har alle involverte tilstrekkelig og korrekt personlig verneutstyr?'),
  { type:'section', id:'F', label:B('F — Location','F — Arbeidssted') }, BQ('f1','Will further inspection be required to verify access or obtain additional information about the area/conditions?','Kreves ytterligere inspeksjon for å verifisere adkomst eller innhente mer informasjon om området/forholdene?'), BQ('f2','Are necessary precautions in place for safely working at heights/multiple levels and falling objects?','Er nødvendige tiltak på plass for arbeid i høyden/flere nivåer og fallende gjenstander?'), BQ('f3','Are necessary precautions in place for preventing falls from or through roofs/into buildings?','Er nødvendige tiltak på plass for å hindre fall fra/gjennom tak eller inn i bygninger?'), BQ('f4','Do we have sufficient information about surfaces, materials, construction, stability and wear?','Har vi tilstrekkelig informasjon om underlag, materialer, konstruksjon, stabilitet og slitasje?'), BQ('f5','Are necessary precautions in place for preventing exposure to vibrations, toxic gases/fluids, smoke, fumes, chemicals or solvents?','Er nødvendige tiltak på plass mot eksponering for vibrasjoner, giftige gasser/væsker, røyk, kjemikalier eller løsemidler?'), BQ('f6','Are necessary precautions in place for safely using flammable gases/fluids/materials?','Er nødvendige tiltak på plass for sikker bruk av brennbare gasser/væsker/materialer?'), BQ('f7','Are necessary precautions in place for limiting dust and noise exposure?','Er nødvendige tiltak på plass for å begrense støv- og støyeksponering?'),
  { type:'section', id:'G', label:B('G — Worksite','G — Arbeidsområde') }, BQ('g1','Is the work area clean and tidy?','Er arbeidsområdet rent og ryddig?'), BQ('g2','Will warning signs or barriers be required?','Er det behov for varselskilt eller sperringer?'), BQ('g3','Have transportation requirements to and from the work area been considered?','Er transportbehov til og fra arbeidsområdet vurdert?'), BQ('g4','Will any tasks/activities require an additional safety watch?','Krever noen oppgaver/aktiviteter ekstra sikkerhetsvakt?'), BQ('g5','Have weather conditions been considered?','Er værforhold vurdert?'), BQ('g6','Are lighting conditions sufficient?','Er lysforholdene tilstrekkelige?')
];
function BQ(id,en,no){ return {type:'question',id,text:B(en,no),answer:'',comment:''}; }
export function blankTask(){return {id:crypto.randomUUID(),activity:'',libraryActivityId:'',hazards:[],consequences:[],measures:[],measureVerification:[],responsible:'',riskBefore:{probability:0,consequence:0},riskAfter:{probability:0,consequence:0},references:[],smartChecks:[],ruleContext:{},ruleFindings:[]};}
export function newDocument(){const now=new Date();return {id:crypto.randomUUID(),version:6,riskModelVersion:'4x4-v2-5level',createdAt:now.toISOString(),updatedAt:now.toISOString(),status:'draft',workDescription:'',processTask:'',siteArea:'',sjaNo:'',responsible:'',date:now.toISOString().slice(0,10),riskFactors:[],participants:[],tasks:[blankTask()],checklist:structuredClone(checklistTemplate),additionalComments:''};}
export function normalizeDocument(doc){
  const sourceModel=doc?.riskModelVersion||'';
  const isCompleted=doc?.status==='complete';
  const isKnown4x4=sourceModel==='4x4-v1'||sourceModel==='4x4-v2-5level';
  const targetModel=isCompleted&&sourceModel==='4x4-v1'?'4x4-v1':'4x4-v2-5level';
  const unsupportedLegacy=Boolean(sourceModel)&&!isKnown4x4;
  const d={...newDocument(),...doc};
  d.version=6;
  d.riskModelVersion=targetModel;
  if(sourceModel==='4x4-v1'&&targetModel==='4x4-v2-5level'){
    d.previousRiskModelVersion='4x4-v1';
    d.riskModelMigratedAt=d.riskModelMigratedAt||new Date().toISOString();
  }
  if(unsupportedLegacy)d.riskModelMigratedAt=d.riskModelMigratedAt||new Date().toISOString();
  d.workDescription=doc?.workDescription??doc?.processTask??doc?.description??'';
  d.processTask=d.workDescription;
  delete d.description;
  d.riskFactors=Array.isArray(doc?.riskFactors)?doc.riskFactors:[];
  d.participants=Array.isArray(doc?.participants)?doc.participants:[];
  d.tasks=(Array.isArray(doc?.tasks)&&doc.tasks.length?doc.tasks:[blankTask()]).map(t=>{
    const task={...blankTask(),...t,riskBefore:{probability:0,consequence:0,...t.riskBefore},riskAfter:{probability:0,consequence:0,...t.riskAfter},hazards:Array.isArray(t.hazards)?t.hazards:[],consequences:Array.isArray(t.consequences)?t.consequences:[],measures:Array.isArray(t.measures)?t.measures:[],references:Array.isArray(t.references)?t.references:[],smartChecks:Array.isArray(t.smartChecks)?t.smartChecks:[],ruleContext:t.ruleContext&&typeof t.ruleContext==='object'?t.ruleContext:{},ruleFindings:Array.isArray(t.ruleFindings)?t.ruleFindings:[]};
    if(unsupportedLegacy){task.legacyRiskAssessment={riskBefore:{...task.riskBefore},riskAfter:{...task.riskAfter}};task.riskBefore={probability:0,consequence:0};task.riskAfter={probability:0,consequence:0};}
    else for(const key of ['riskBefore','riskAfter']){const r=task[key];if(Number(r.probability)>4||Number(r.consequence)>4){task[`legacy${key==='riskBefore'?'RiskBefore':'RiskAfter'}`]={...r};task[key]={probability:0,consequence:0};}}
    task.measureVerification=Array.isArray(t.measureVerification)?t.measureVerification.map(v=>({implemented:false,note:'',...v})):[];
    while(task.measureVerification.length<task.measures.length)task.measureVerification.push({implemented:false,note:''});
    return task;
  });
  const canonicalChecklistById=new Map(checklistTemplate.map(item=>[item.id,item]));
  d.checklist=(Array.isArray(doc?.checklist)&&doc.checklist.length?doc.checklist:structuredClone(checklistTemplate)).map(item=>{
    let out=item.type==='question'&&item.answer==='na'?{...item,answer:''}:{...item};
    const canonical=canonicalChecklistById.get(item.id);
    if(canonical){
      if(item.type==='section'){
        const label=item.label;
        const needsRepair=typeof label==='string'||!label?.en||!label?.no||label?.en===label?.no;
        if(needsRepair)out.label=structuredClone(canonical.label);
      }else if(item.type==='question'){
        const text=item.text;
        const needsRepair=typeof text==='string'||!text?.en||!text?.no||text?.en===text?.no;
        if(needsRepair)out.text=structuredClone(canonical.text);
      }
    }
    return out;
  });
  return d;
}
