import React from 'react';
import {Link} from 'react-router-dom';
import {PKE_PROCESS_DEPENDENCIES} from '../../src/knowledge/process-dependency-map';
import {UXPanel,UXStateBadge,UXEmpty} from './UXFoundation';
import './UXFoundation.css';
const ROUTES:Record<string,string>={contracts:'/contracts',supply:'/pks-sites',production:'/operations',quality:'/p1-workflows',inventory:'/warehouse',transport:'/shipment-allocations',port:'/port-network',loading:'/maritime-operations',documents:'/compliance',customs:'/compliance',voyage:'/maritime-operations',settlement:'/finance'};
const LABELS:Record<string,string>={contract:'Contract',supply:'Supply / PKS',production:'Production',quality:'QA / QC',inventory:'Warehouse / Lot',transport:'Transport',port:'Port / Terminal',loading:'Loading / Survey',documents:'Export Documents',customs:'Customs',voyage:'Voyage / Shipment',settlement:'Finance / Settlement'};
export default function CrossProcessDependencyPanel(){
 return <UXPanel title="Cross-process dependency map" subtitle="Dependency model across lifecycle. This is a design map, not live readiness: evidence state is not yet calculated from production APIs.">
 <div className="ux-dependency-list">{PKE_PROCESS_DEPENDENCIES.map(d=><article className="ux-dependency" key={d.id}>
 <div className="ux-dependency-flow"><Link to={ROUTES[d.from]||'/'}>{LABELS[d.from]||d.from}</Link><span aria-hidden="true">→</span><Link to={ROUTES[d.to]||'/'}>{LABELS[d.to]||d.to}</Link></div>
 <div className="ux-dependency-meta"><UXStateBadge state="unknown" label="Runtime evidence belum dikorelasikan"/><span className="ux-dependency-strength">{d.strength}</span></div>
 <div className="ux-dependency-evidence"><strong>Required evidence</strong><ul>{d.requiredEvidence.map(e=><li key={e}>{e}</li>)}</ul></div>
 <div className="ux-dependency-risk"><strong>Failure patterns</strong><ul>{d.failureModes.map(e=><li key={e}>{e}</li>)}</ul></div>
 <div className="ux-dependency-ai"><strong>AI assistance (non-approval)</strong><span>{d.aiAssist.join(' · ')}</span><small>Decision owner: {d.ownerRole}. Human decision: {d.humanDecision}</small></div>
 </article>)}</div>
 </UXPanel>
}
