"use client";
import React,{useEffect,useState} from "react";
import {listFieldDrafts,FieldDraft} from "./field-offline-queue";
export function SyncEngine({projectId}:{projectId?:string}){
 const [rows,setRows]=useState<FieldDraft[]>([]);const [online,setOnline]=useState(typeof navigator!=="undefined"?navigator.onLine:false);const [error,setError]=useState("");
 useEffect(()=>{const refresh=()=>setOnline(navigator.onLine);window.addEventListener("online",refresh);window.addEventListener("offline",refresh);let active=true;listFieldDrafts(projectId).then(v=>{if(active)setRows(v)}).catch(e=>{if(active)setError(String(e))});return()=>{active=false;window.removeEventListener("online",refresh);window.removeEventListener("offline",refresh)}},[projectId]);
 return <section className="rounded-xl border p-4 space-y-2" aria-live="polite"><div className="flex justify-between"><h2 className="font-semibold">Status koneksi & draft</h2><span className={online?"text-green-700":"text-amber-700"}>{online?"Online":"Offline"}</span></div><p className="text-sm text-gray-600">Draft tersimpan lokal: {rows.length}. Sinkronisasi server belum dihubungkan pada paket ini; draft tidak dianggap terkirim.</p>{error&&<p className="text-sm text-red-700">Penyimpanan lokal tidak tersedia: {error}</p>}{rows.length>0&&<ul className="text-sm space-y-1">{rows.slice(0,5).map(r=><li key={r.id} className="flex justify-between gap-2"><span>{r.kind} · {new Date(r.capturedAt).toLocaleString()}</span><span>{r.status}</span></li>)}</ul>}</section>
}
export default SyncEngine;
