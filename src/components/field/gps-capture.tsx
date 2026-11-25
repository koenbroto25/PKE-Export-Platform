"use client";
import React,{useState} from "react";
export type GpsCaptureValue={latitude:number;longitude:number;accuracy:number;capturedAt:string};
export function GPSCapture({onCaptured}:{onCaptured:(v:GpsCaptureValue)=>void}){
 const [state,setState]=useState<"idle"|"capturing"|"denied"|"unavailable"|"error">("idle");const [value,setValue]=useState<GpsCaptureValue|null>(null);
 const capture=()=>{if(!navigator.geolocation){setState("unavailable");return;}setState("capturing");navigator.geolocation.getCurrentPosition(p=>{const v={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,capturedAt:new Date(p.timestamp).toISOString()};setValue(v);onCaptured(v);setState("idle")},e=>setState(e.code===1?"denied":e.code===2?"unavailable":"error"),{enableHighAccuracy:true,timeout:15000,maximumAge:0})};
 return <div className="space-y-2"><button type="button" onClick={capture} disabled={state==="capturing"} className="rounded border px-3 py-2">{state==="capturing"?"Mengambil lokasi…":"Ambil GPS saat ini"}</button>{value&&<p className="text-xs text-gray-600">GPS tersimpan dalam draft · akurasi ±{Math.round(value.accuracy)} m</p>}{state==="denied"&&<p role="status" className="text-sm">Izin lokasi ditolak. Draft dapat dilanjutkan tanpa GPS kecuali tugas mensyaratkannya.</p>}{state==="unavailable"&&<p role="status" className="text-sm">Lokasi tidak tersedia pada perangkat ini.</p>}{state==="error"&&<p role="status" className="text-sm">Pengambilan lokasi gagal atau timeout. Coba lagi.</p>}</div>
}
export default GPSCapture;
